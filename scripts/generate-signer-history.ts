/**
 * Builds src/data/signers/ — what each signer held each cycle, and who held it.
 *
 * This is the data behind the page for one signer contract. It is the most
 * expensive thing this repo reads by a wide margin, so most of the file is
 * about *not* reading it.
 *
 * ---------------------------------------------------------------------------
 * Why it is expensive
 * ---------------------------------------------------------------------------
 *
 * An amount is one call: `get-amount-delegated-for-signer`, per contract, per
 * cycle. A member list is one call *per staker*, because pox-5 answers "who is
 * this staker with" and not "who is with this signer" — a signer with two
 * thousand members costs two thousand calls for one cycle. Anonymous, Hiro
 * allows about fifty a minute. Walking every signer's every cycle on every
 * hourly refresh is not slow, it is impossible.
 *
 * ---------------------------------------------------------------------------
 * The four things that make it cheap
 * ---------------------------------------------------------------------------
 *
 * 1. **A cycle that is behind us cannot move, so it is read once.** Stacking
 *    for cycle N is locked in before N begins, so only the cycle being filled
 *    is really live. This still treats the current cycle as unsettled and
 *    re-reads it — one cycle of insurance against that reasoning being wrong
 *    costs a few calls an hour, and being wrong the other way would freeze a
 *    number that later moved. Everything strictly in the past is written once
 *    and never asked about again. In the steady state a run reads two cycles,
 *    not forty.
 *
 * 2. **A cheap number decides whether the expensive walk runs.** The amounts
 *    come first, and they are one call per contract. If a signer's total is
 *    what it was when its member list was made, nobody joined, nobody left and
 *    nobody changed what they staked — so the list still stands and the walk is
 *    skipped entirely. Only a signer whose money actually moved pays for its
 *    members. Note *when its list was made*, not *last run*: the amounts are
 *    refreshed hourly whether or not the members are, so a run-to-run
 *    comparison would notice a move once, decline to act on it, and then find
 *    the amounts agreeing with each other for ever. Hence `walkedUstx`.
 *
 * 2b. **A re-walk happens at most once a day.** The cycle being filled changes
 *    constantly, so rule 2 fires nearly every hour for the big signers — the
 *    three Xverse ones are eleven hundred members between them, and re-reading
 *    them hourly was the whole of a thirty-minute refresh. A list for a cycle
 *    that is still open is provisional anyway, so once a day is enough, and the
 *    page says when it was last made rather than implying it is current. See
 *    REWALK_AFTER_MS. In the steady state a run walks nothing at all and takes
 *    about twenty seconds.
 *
 * 3. **The unit is the signer key, not the contract.** Four signers run more
 *    than one signer-manager contract, and a staker who moved between two of
 *    them never left the signer. Walking the signer once rather than each
 *    contract separately reads each of those people once and gets the arithmetic
 *    right as a side effect.
 *
 * 4. **A run can be given a budget, and spends it on the stalest signers.**
 *    `--budget` caps the per-staker calls; signers are taken least-recently-
 *    checked first, so an hourly run that cannot afford everything still makes
 *    progress and comes back to the rest next time. A signer that would not fit
 *    is skipped rather than half-walked — except when it is first, so the
 *    largest signer can never be starved by a budget smaller than it is.
 *
 * ---------------------------------------------------------------------------
 * What it writes
 * ---------------------------------------------------------------------------
 *
 *   src/data/signers/<slug>.json          cycles, amounts, member counts
 *   src/data/signers/<slug>/<cycle>.json  one cycle's members
 *
 * Split because the page fetches them separately: opening a signer costs the
 * summary, opening one of its cycles costs that cycle. A reader on the list
 * page pays for neither. See src/lib/signer-history.ts.
 *
 * A cycle nobody staked in gets no members file at all — `memberCount: 0` in
 * the summary says everything an empty file would, and there are a lot of them.
 * `memberCount: null` is the different statement that we have not walked it,
 * and the page must not read one as the other.
 *
 * Usage:
 *   npx tsx scripts/generate-signer-history.ts
 *   npx tsx scripts/generate-signer-history.ts --only "fast pool"
 *   npx tsx scripts/generate-signer-history.ts --budget 2000
 *
 *   --budget N   most per-staker calls this run may make (default: no cap)
 *   --only Q     just the signers this query names, as signer-members.ts takes it
 *   --from N     earliest cycle to cover (default: 141, pox-5's first)
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  groupBySignerKey,
  signerSlug,
  type SignerGroup,
} from '../src/lib/signer-groups.js';
import type {
  CycleMember,
  SignerCycleMembers,
  SignerCycleSummary,
  SignerData,
  SignerHistory,
} from '../src/lib/types.js';
import { fetchAmountDelegated } from './locked.js';
import { indexSigner, readPositions } from './members.js';
import { describeNode, sleep, SPACING_MS } from './node.js';
import { fetchCurrentCycle } from './pox5.js';
import { groupName, matchGroups } from './signer-members.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SIGNERS = path.join(DATA, 'signers.json');
const OUTPUT = path.join(DATA, 'signers');

/** pox-5 went live part-way through 140; nothing was locked with it until 141. */
const FIRST_POX5_CYCLE = 141;

/**
 * How many times a cycle whose members do not add up is walked again.
 *
 * A short list is usually a rate limit, and asking again tomorrow fixes it.
 * But it can also be a staker Hiro's index has never heard of, which no number
 * of retries will fix — and a frozen cycle retried for ever is a bill that
 * never stops. Three goes, then the page says the list is short and means it.
 */
const MAX_WALKS = 3;

// ---------------------------------------------------------------------------
// The parts with no node in them
// ---------------------------------------------------------------------------

export interface Options {
  budget: number;
  only: string[];
  from: number;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    budget: Number.POSITIVE_INFINITY,
    only: [],
    from: FIRST_POX5_CYCLE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--budget') options.budget = Number(argv[(i += 1)]);
    else if (arg === '--only') options.only.push(argv[(i += 1)]);
    else if (arg === '--from') options.from = Number(argv[(i += 1)]);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!(options.budget > 0)) throw new Error('--budget takes a count');
  if (!Number.isInteger(options.from)) {
    throw new Error('--from takes a cycle number');
  }
  return options;
}

/**
 * A cycle on file that we already know everything about.
 *
 * All three have to hold. A cycle missing one of the group's contracts is a
 * contract registered since it was written, and its amount for that cycle has
 * never been asked for; a null is a call that failed and is worth another go.
 * Only a past cycle with a complete set of answers is genuinely finished.
 */
export function amountsSettled(
  onFile: SignerCycleSummary | undefined,
  contractIds: string[],
  currentCycle: number,
): boolean {
  if (!onFile) return false;
  if (onFile.cycle >= currentCycle) return false;
  return contractIds.every((id) => typeof onFile.ustx[id] === 'string');
}

/**
 * What to record for an amount, given what the node said and what we had.
 *
 * The same rule as `preserveKnownTotals` in scripts/totals-merge.ts, and it is
 * there for the same reason: a node that would not answer is not a signer
 * holding nothing. Writing null over a number we already had would report a
 * rate limit as ignorance about somebody's money, and an hour-old amount is
 * worth more to a reader than a blank.
 *
 * It also keeps the cycle's total where it was, so `membersWorthWalking` does
 * not read a failed call as the signer's money moving and spend a thousand
 * chain calls re-walking a membership that never changed.
 */
export function amountOrKept(
  read: bigint | null,
  known: string | null | undefined,
): { ustx: string | null; kept: boolean } {
  if (read !== null) return { ustx: read.toString(), kept: false };
  if (typeof known === 'string') return { ustx: known, kept: true };
  return { ustx: null, kept: false };
}

/**
 * Whether this cycle's members are worth walking, given what the amounts said.
 *
 * The heart of the whole script. A signer holding exactly what it held last
 * run has had nobody join, nobody leave, and nobody change their stake, so the
 * list on file is still the list — and a walk would spend a thousand calls
 * confirming it.
 */
export function membersWorthWalking(
  onFile: SignerCycleSummary | undefined,
  total: bigint | null,
  /** `fileFinal` — whether this record is done with, not whether the cycle is. */
  fileFinal: boolean,
  now: number,
): boolean {
  // Never walked. Zero members is a fact and is recorded as 0; null is not.
  if (!onFile || onFile.memberCount === null) return true;

  /*
   * One last walk before the record is frozen, whatever the clock says.
   *
   * The amounts are refreshed hourly and the members daily, so a stake that
   * changes in a cycle's last day is on file as an amount while the list is
   * still the one walked before it moved. That is a normal day's staleness and
   * the daily gate below is the price of affordability — until the cycle rolls
   * over. Then `fileFinal` turns true, and every path after the gate declines:
   * a list that adds up and a record that is final is "as good as it is going
   * to get". The list would be frozen for good, a member short of the total it
   * is filed with, and nothing would ever say so.
   *
   * It happened: fastpool-1's cycle 142 was walked at 10:54 on 26 August,
   * between an unstake and a 99 STX increase forty-five minutes later. The
   * next run was 21.4 hours later — inside the day — so the gate returned
   * before the mismatch below could be noticed.
   *
   * The test is `walkedUstx`, the total as it stood at the walk, against the
   * total now: it is the one thing that shows the list no longer accounts for
   * the amounts it is filed beside. `membersAddUp` cannot show it, and is not
   * wrong to say so — it describes the walk, which was right when it was made.
   *
   * This terminates. A walk writes `walkedUstx` from the amounts, so one
   * successful walk clears the mismatch by construction, and a settled cycle's
   * amounts do not move again. A walk skipped for want of budget leaves the
   * mismatch, and the next run owes it — which is the right way round.
   *
   * Deliberately final cycles only. A live cycle where the money moves every
   * hour would be walked every hour, which is the thousand-call bill the gate
   * exists to avoid; a live list catches up on its own the next day.
   */
  if (fileFinal && amountsMovedSinceWalk(onFile, total)) return true;

  /*
   * Everything from here is a *re*-walk, and that is the expensive case: the
   * three Xverse signers alone are eleven hundred members, so an hourly
   * re-walk of the cycle being filled was spending a thousand-odd chain calls
   * to find that a handful of people had joined. Once a day is enough for a
   * list that is provisional until the cycle closes anyway, and it is the
   * difference between a refresh that takes half an hour and one that takes a
   * minute.
   *
   * A missing `walkedAt` is a file written before this was recorded, and is
   * read as long ago — the first run after this ships stamps one on.
   */
  if (!dayHasPassed(onFile.walkedAt, now)) return false;

  // A list that does not add up is short, and a retry is usually all it needs
  // — but not for ever, whatever the cycle.
  if (!onFile.membersAddUp) return (onFile.walks ?? 0) < MAX_WALKS;

  // Frozen, and as good as it is going to get.
  if (fileFinal) return false;

  /*
   * Live: walk it only if the money has moved since the list was made — and
   * against `walkedUstx`, the total as it stood at that walk, never against
   * last run's `ustx`. The amounts are refreshed hourly whether or not the
   * members are, so a run-to-run comparison would see the move once, decline
   * to walk for want of a day, and then find the two amounts agreeing with
   * each other for ever after. The list would never be rebuilt again.
   */
  if (onFile.walkedUstx === null || total === null) return true;
  return onFile.walkedUstx !== total.toString();
}

/**
 * Whether the amounts have moved since the list was walked.
 *
 * Only when both figures are known. `walkedUstx` is null on a record written
 * before it was kept, and `total` is null when a contract would not answer —
 * neither is evidence that the list is stale, and walking every historical
 * cycle of every signer on a missing field would cost more than the whole
 * refresh.
 */
function amountsMovedSinceWalk(
  onFile: SignerCycleSummary,
  total: bigint | null,
): boolean {
  if (typeof onFile.walkedUstx !== 'string' || total === null) return false;
  return onFile.walkedUstx !== total.toString();
}

/** How often a cycle that can still change is worth walking again. */
export const REWALK_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a day has gone by since `walkedAt`.
 *
 * Unknown counts as yes. A timestamp we cannot read is not evidence that the
 * list is fresh, and the cost of being wrong is one walk rather than a list
 * that is never rebuilt.
 */
export function dayHasPassed(
  walkedAt: string | null | undefined,
  now: number,
): boolean {
  if (!walkedAt) return true;
  const at = Date.parse(walkedAt);
  if (Number.isNaN(at)) return true;
  return now - at >= REWALK_AFTER_MS;
}

/**
 * What a cycle's amounts add up to, or null when one of them never read.
 *
 * Strict about the null, unlike `sumCycleUstx` on the page: this total is
 * compared against the last one to decide whether anything moved, and a sum
 * that quietly leaves out an unreadable contract would compare equal to a
 * complete one and skip a walk that was needed.
 */
export function strictSum(ustx: Record<string, string | null>): bigint | null {
  let total = 0n;
  for (const amount of Object.values(ustx)) {
    if (amount === null) return null;
    total += BigInt(amount);
  }
  return total;
}

/**
 * Signers in the order a budget should be spent on them: stalest first.
 *
 * A signer with nothing on file has waited longest by definition and goes to
 * the front. Otherwise it is whenever its summary was last written, so an
 * hourly run that can only afford a few of them works its way round rather
 * than doing the same three every time.
 */
export function byStaleness(
  groups: SignerGroup[],
  checkedAt: (group: SignerGroup) => number | null,
): SignerGroup[] {
  return [...groups].sort((a, b) => {
    const left = checkedAt(a);
    const right = checkedAt(b);
    if (left === right) return 0;
    if (left === null) return -1;
    if (right === null) return 1;
    return left - right;
  });
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function summaryPath(slug: string): string {
  return path.join(OUTPUT, `${slug}.json`);
}

function membersPath(slug: string, cycle: number): string {
  return path.join(OUTPUT, slug, `${cycle}.json`);
}

function readSummary(slug: string): SignerHistory | null {
  const file = summaryPath(slug);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SignerHistory;
    return Array.isArray(parsed?.cycles) ? parsed : null;
  } catch {
    // A half-written file from a killed run. Rebuilding costs a run; reading
    // it as "no cycles on file" and overwriting it loses the lot.
    console.error(`  ${file} would not parse; rebuilding it`);
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// The parts that ask
// ---------------------------------------------------------------------------

interface Spend {
  /** Per-staker calls left in this run's budget. */
  left: number;
  /** How many have been spent, so the first signer is never starved. */
  spent: number;
}

interface GroupResult {
  slug: string;
  name: string;
  /** Cycles whose amounts were read from the chain this run. */
  amountsRead: number;
  /** Cycles whose members were walked this run. */
  walked: number;
  /** Amounts the node would not re-read, left at what they were. */
  carriedForward: number;
  /** True when a walk was skipped for want of budget. */
  budgetBit: boolean;
}

async function updateGroup(
  group: SignerGroup,
  currentCycle: number,
  options: Options,
  spend: Spend,
  /** One timestamp for the whole run, so a walk's stamp does not depend on
   *  how long the signers before it took. */
  now: number,
): Promise<GroupResult> {
  const slug = signerSlug(group);
  const name = groupName(group);
  const contractIds = group.contracts.map((contract) => contract.contractId);
  const existing = readSummary(slug);
  const onFile = new Map<number, SignerCycleSummary>(
    (existing?.cycles ?? []).map((cycle) => [cycle.cycle, cycle]),
  );

  const result: GroupResult = {
    slug,
    name,
    amountsRead: 0,
    walked: 0,
    carriedForward: 0,
    budgetBit: false,
  };
  const cycles: SignerCycleSummary[] = [];

  for (let cycle = options.from; cycle <= currentCycle + 1; cycle += 1) {
    const before = onFile.get(cycle);

    /*
     * The two flags, and they part company for exactly one cycle.
     *
     * `fileFinal` is whether this record is done with. Strictly past, because
     * the current cycle is almost certainly settled but one cycle of insurance
     * is cheap, and being wrong here freezes a number that later moved.
     *
     * `cycleFinal` is whether the cycle itself is shut. Stacking for a cycle is
     * locked in before that cycle begins, so the current one takes no more
     * stakers — it is earning, not filling. Only the next cycle is open.
     */
    const fileFinal = cycle < currentCycle;
    const cycleFinal = cycle <= currentCycle;

    /*
     * The amounts. A past cycle with a complete set of answers on file keeps
     * them and costs nothing — this is the saving that makes the whole thing
     * affordable, and it is why `fileFinal` is the conservative one above.
     */
    let ustx: Record<string, string | null>;
    if (amountsSettled(before, contractIds, currentCycle)) {
      ustx = (before as SignerCycleSummary).ustx;
    } else {
      ustx = {};
      for (const contractId of contractIds) {
        // A past cycle already answered for keeps its answer rather than
        // spending a call to be told the same thing.
        const known = before?.ustx[contractId];
        if (fileFinal && typeof known === 'string') {
          ustx[contractId] = known;
          continue;
        }
        const read = await fetchAmountDelegated(contractId, cycle);
        const { ustx: amount, kept } = amountOrKept(read, known);
        ustx[contractId] = amount;
        if (kept) result.carriedForward += 1;
        await sleep(SPACING_MS);
      }
      result.amountsRead += 1;
    }

    const total = strictSum(ustx);
    const summary: SignerCycleSummary = {
      cycle,
      ustx,
      memberCount: before?.memberCount ?? null,
      membersAddUp: before?.membersAddUp ?? false,
      walks: before?.walks ?? 0,
      walkedAt: before?.walkedAt ?? null,
      walkedUstx: before?.walkedUstx ?? null,
      fileFinal,
      cycleFinal,
    };

    /*
     * The members, asked separately: a cycle whose amounts were settled long
     * ago may still never have been walked, and skipping it with them would
     * leave it without a member list for ever.
     */
    if (membersWorthWalking(before, total, fileFinal, now)) {
      const walked = await walkCycle(group, slug, cycle, total, spend);
      if (walked === 'skipped') result.budgetBit = true;
      else {
        summary.memberCount = walked.memberCount;
        summary.membersAddUp = walked.membersAddUp;
        summary.walks = (before?.walks ?? 0) + 1;
        // Stamped from the walk, not from the run: what the list is a
        // photograph of, and when it was taken.
        summary.walkedAt = new Date(now).toISOString();
        summary.walkedUstx = total === null ? null : total.toString();
        result.walked += 1;
      }
    }

    cycles.push(summary);
  }

  const history: SignerHistory = {
    signerKey: group.signerKey,
    contractIds,
    // Newest first, so the cycle a reader wants is the one they land on.
    cycles: cycles.reverse(),
    // Recorded rather than left for the page to infer. `cycleFinal` says a
    // cycle is shut; which of the shut ones is earning right now needs this.
    currentCycle,
    generatedAt: new Date().toISOString(),
  };
  writeJson(summaryPath(slug), history);
  return result;
}

/**
 * Walk one cycle's members, or decline for want of budget.
 *
 * The index walk happens first and is cheap — a page per hundred stakers — and
 * it is what says how much the expensive part will cost. So the budget is
 * checked once the price is known, and a signer that will not fit is left
 * whole for the next run rather than half-read: half a member list is a list
 * that does not add up, which is a worse thing to publish than no list.
 *
 * The exception is a run that has spent nothing yet. That signer is the
 * stalest one there is, and skipping it because it is bigger than the budget
 * would mean the largest signer in the guide never gets read at all.
 */
async function walkCycle(
  group: SignerGroup,
  slug: string,
  cycle: number,
  total: bigint | null,
  spend: Spend,
): Promise<'skipped' | { memberCount: number; membersAddUp: boolean }> {
  const contractIds = group.contracts.map((contract) => contract.contractId);

  // The cheap half first: it is what says what the expensive half costs.
  const index = await indexSigner(contractIds);
  const price = index.stakers.size;
  if (price > spend.left && spend.spent > 0) return 'skipped';

  const walked = await readPositions(index, contractIds, cycle, (note) =>
    console.error(`    ${note}`),
  );
  spend.left -= price;
  spend.spent += price;

  const members: CycleMember[] = [];
  for (const member of walked) {
    if (member.position.kind !== 'member') continue;
    members.push({
      staker: member.staker,
      ustx: member.position.ustx.toString(),
      contractId: member.position.contract,
    });
  }

  const staked = members.reduce((sum, m) => sum + BigInt(m.ustx), 0n);
  // Both sides come from pox-5, so they agree unless somebody staking here is
  // missing from Hiro's index or the walk was cut short. Either way the list
  // is short, and the page has to be able to say so.
  const membersAddUp =
    index.complete &&
    total !== null &&
    total === staked &&
    !walked.some((m) => m.position.kind === 'unknown');

  const file = membersPath(slug, cycle);
  if (members.length === 0) {
    // Nothing to say that `memberCount: 0` does not, and there are a lot of
    // these. An older file would now be wrong, though, so it goes.
    if (fs.existsSync(file)) fs.rmSync(file);
  } else {
    const contents: SignerCycleMembers = {
      signerKey: group.signerKey,
      cycle,
      members,
    };
    writeJson(file, contents);
  }

  return { memberCount: members.length, membersAddUp };
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const data = JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData;

  let groups = groupBySignerKey(data.signers);
  if (options.only.length) {
    const wanted: SignerGroup[] = [];
    for (const query of options.only) {
      const matched = matchGroups(query, data.signers);
      if (matched.length === 0) {
        console.error(`No pool matches "${query}".`);
        process.exit(1);
      }
      for (const group of matched) {
        // Matched against a fresh grouping, so compare by contract rather than
        // by object identity.
        const already = wanted.some((w) => signerSlug(w) === signerSlug(group));
        if (!already) wanted.push(group);
      }
    }
    groups = wanted;
  }

  const currentCycle = await fetchCurrentCycle();
  if (currentCycle === null) {
    console.error(
      'The node would not say what cycle it is in, so there is no way to' +
        ' know which cycles are settled. Leaving the history as it is.',
    );
    process.exit(1);
    return;
  }

  const ordered = byStaleness(groups, (group) => {
    const summary = readSummary(signerSlug(group));
    if (!summary?.generatedAt) return null;
    const at = Date.parse(summary.generatedAt);
    return Number.isNaN(at) ? null : at;
  });

  console.log(
    `Reading ${ordered.length} signer(s) up to cycle ${currentCycle + 1}` +
      ` from ${describeNode()}` +
      `${options.budget === Number.POSITIVE_INFINITY ? '' : `, budget ${options.budget} staker read(s)`} ...`,
  );

  const now = Date.now();
  const spend: Spend = { left: options.budget, spent: 0 };
  let walked = 0;
  let short = 0;
  let carriedForward = 0;

  for (const group of ordered) {
    const result = await updateGroup(group, currentCycle, options, spend, now);
    walked += result.walked;
    carriedForward += result.carriedForward;
    if (result.budgetBit) short += 1;
    if (result.amountsRead || result.walked) {
      console.log(
        `  ${result.name}: ${result.amountsRead} cycle(s) read,` +
          ` ${result.walked} walked` +
          `${result.carriedForward ? `, ${result.carriedForward} kept` : ''}`,
      );
    }
  }

  console.log(
    `\nWrote ${ordered.length} signer(s) to ${OUTPUT}` +
      ` — ${walked} cycle(s) of members walked,` +
      ` ${spend.spent.toLocaleString('en-GB')} staker read(s) spent`,
  );
  if (carriedForward) {
    // Said out loud, because carrying an amount forward is invisible in the
    // file — it looks exactly like an amount that did not move. A node that is
    // refusing everything would otherwise produce a quiet, unchanging run.
    console.log(
      `  ${carriedForward} amount(s) would not read, kept at what they were`,
    );
  }
  if (short) {
    console.log(
      `  ${short} signer(s) would not fit the budget and were left for the` +
        ' next run — they are the stalest ones, so they go first next time.',
    );
  }
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
