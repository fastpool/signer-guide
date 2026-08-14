/**
 * Who joined a signer between two pox-5 cycles, who left, and where they went.
 *
 * `signer-members.ts` answers "who is in this pool now". This answers "what
 * changed, and why" — which is the question behind a member count that moved,
 * and the one a count on its own cannot answer. A pool that went from 127
 * members to 135 may have gained eight, or gained thirty and lost twenty-two
 * to a competitor, and those are not the same news.
 *
 * The unit is the signer key, as everywhere else here: a staker who moved
 * between two contracts of the same signer never left it. See the note at the
 * top of signer-members.ts.
 *
 * ---------------------------------------------------------------------------
 * What "where did they go" means
 * ---------------------------------------------------------------------------
 *
 * For each leaver, pox-5 is asked where they stand in the later cycle, and the
 * answer is one of four things — kept apart, because collapsing them is how a
 * rate limit gets reported as an exodus:
 *
 *   with another signer   they moved; which one is named
 *   stopped               no pox-5 position, and nothing locked either
 *   staked, not this cycle  locked, but their stake starts later. Not a
 *                         leaver at all — usually somebody who re-staked a few
 *                         blocks after the cycle began, so it takes effect
 *                         from the next one
 *   unknown               the node would not say. Never counted as any of the
 *                         above
 *
 * Joiners get the same treatment against the earlier cycle, so "new to
 * stacking" and "taken from another pool" are told apart.
 *
 * ---------------------------------------------------------------------------
 * Where the answers come from
 * ---------------------------------------------------------------------------
 *
 * Rosters come from `src/data/signers/<slug>/<cycle>.json` when the refresh has
 * built them, and from the chain when it has not — a walk costs one call per
 * staker, so a committed roster is worth using. Which was used is printed, and
 * a roster the generator marked as short is flagged, because every number below
 * is only as complete as the two lists it came from.
 *
 * Lookups are answered from the other signers' committed rosters first, which
 * is free and covers most of them. **A staker missing from those is still asked
 * about on the chain**, never assumed to have stopped: absence from a file we
 * may simply not have written is not evidence about somebody's money.
 *
 * Usage:
 *   npx tsx scripts/membership-movement.ts max500 141 142
 *   npx tsx scripts/membership-movement.ts "fast pool" --from 141 --to 142
 *   npx tsx scripts/membership-movement.ts max500 141 142 --json
 *
 *   --from N --to N   the cycles to compare; also positional, in that order
 *   --fresh           ignore the committed rosters and walk the chain
 *   --top N           how many movers to name (JSON is never truncated)
 *   --no-lock-check   skip asking whether a leaver still holds a lock, which
 *                     merges "stopped" and "staked, not this cycle"
 *   --json            the whole answer as JSON
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
  Signer,
  SignerCycleMembers,
  SignerData,
  SignerHistory,
} from '../src/lib/types.js';
import { formatStx, shortPrincipal } from './format.js';
import { readMembership, walkSignerMembers } from './members.js';
import {
  API_URL,
  describeNode,
  nodeHeaders,
  sleep,
  SPACING_MS,
} from './node.js';
import { contractLabel, groupName, matchGroups } from './signer-members.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SIGNERS = path.join(DATA, 'signers.json');
const HISTORY = path.join(DATA, 'signers');

// ---------------------------------------------------------------------------
// The parts with no node in them
// ---------------------------------------------------------------------------

export interface Options {
  query: string | null;
  from: number | null;
  to: number | null;
  top: number;
  fresh: boolean;
  lockCheck: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    query: null,
    from: null,
    to: null,
    top: 20,
    fresh: false,
    lockCheck: true,
    json: false,
  };
  const cycles: number[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--fresh') options.fresh = true;
    else if (arg === '--no-lock-check') options.lockCheck = false;
    else if (arg === '--from') options.from = Number(argv[(i += 1)]);
    else if (arg === '--to') options.to = Number(argv[(i += 1)]);
    else if (arg === '--top') options.top = Number(argv[(i += 1)]);
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (/^\d+$/.test(arg)) cycles.push(Number(arg));
    // The first bare word is the pool; a second would be a typo worth
    // catching rather than a query silently ignored.
    else if (options.query === null) options.query = arg;
    else
      throw new Error(`Naming two pools at once: "${options.query}", "${arg}"`);
  }

  // Positional cycles fill whichever end was not named by a flag.
  for (const cycle of cycles) {
    if (options.from === null) options.from = cycle;
    else if (options.to === null) options.to = cycle;
    else throw new Error('More than two cycles given');
  }

  if (options.query === null) throw new Error('Name a pool');
  if (options.from === null || options.to === null) {
    throw new Error('Give two cycles, e.g. `max500 141 142`');
  }
  for (const cycle of [options.from, options.to]) {
    if (!Number.isInteger(cycle) || cycle < 0) {
      throw new Error(`Not a cycle number: ${cycle}`);
    }
  }
  if (options.from === options.to) {
    throw new Error('The two cycles are the same one');
  }
  if (options.from > options.to) {
    // Comparing backwards would report every joiner as a leaver. Easier to
    // fix it here than to make somebody read the output twice to notice.
    [options.from, options.to] = [options.to, options.from];
  }
  if (!(options.top > 0)) throw new Error('--top takes a count');
  return options;
}

/** One signer's membership in one cycle. */
export interface Roster {
  cycle: number;
  /** uSTX held, by staker. */
  amounts: Map<string, bigint>;
  /** Which of the signer's contracts each staker is with. */
  contracts: Map<string, string>;
  source: 'file' | 'chain';
  /**
   * False when the list is known to be short — a walk the index cut off, or a
   * roster the generator could not reconcile. Every count below inherits it.
   */
  complete: boolean;
}

export interface Movement {
  stayed: string[];
  left: string[];
  joined: string[];
  /** Stayers whose amount moved, and by how much. */
  changed: { staker: string; before: bigint; after: bigint }[];
}

export function compare(before: Roster, after: Roster): Movement {
  const stayed: string[] = [];
  const left: string[] = [];
  const joined: string[] = [];
  const changed: Movement['changed'] = [];

  for (const [staker, amount] of before.amounts) {
    const now = after.amounts.get(staker);
    if (now === undefined) {
      left.push(staker);
      continue;
    }
    stayed.push(staker);
    if (now !== amount) changed.push({ staker, before: amount, after: now });
  }
  for (const staker of after.amounts.keys()) {
    if (!before.amounts.has(staker)) joined.push(staker);
  }

  // Largest movers first, so the names that matter are at the top of a list
  // somebody is going to read only the top of.
  const size = (r: Roster) => (s: string) => r.amounts.get(s) ?? 0n;
  left.sort((a, b) => cmp(size(before)(b), size(before)(a)));
  joined.sort((a, b) => cmp(size(after)(b), size(after)(a)));
  changed.sort((a, b) => cmp(abs(b.after - b.before), abs(a.after - a.before)));
  return { stayed, left, joined, changed };
}

const cmp = (a: bigint, b: bigint) => (a > b ? 1 : a < b ? -1 : 0);
const abs = (v: bigint) => (v < 0n ? -v : v);

export function sum(stakers: string[], amounts: Map<string, bigint>): bigint {
  return stakers.reduce((total, s) => total + (amounts.get(s) ?? 0n), 0n);
}

/**
 * Where a staker stands in the cycle they are not in this signer for.
 *
 * `unknown` is a state of its own and is never folded into `stopped`. The
 * difference is a person reported as having walked away from a pool when the
 * node simply asked us to slow down.
 */
export type Standing =
  | { kind: 'signer'; signer: string }
  | { kind: 'stopped' }
  | { kind: 'locked'; unlockHeight: number }
  /**
   * The chain puts them with one of *this* signer's own contracts.
   *
   * Which means they never moved, and the roster that left them out is short —
   * usually a committed one the refresh has not caught up on. Worth its own
   * state rather than being filed under the contract's name: printed as a
   * destination it reads as "they left, to here", which is the opposite of
   * what it says. It is a fact about the data, not about the staker.
   */
  | { kind: 'stillHere'; signer: string }
  | { kind: 'unknown' };

/**
 * How to read a standing, which depends on which way somebody moved.
 *
 * The same fact — no pox-5 position in the other cycle — is "they stopped" for
 * a leaver and "they are new to stacking" for a joiner. One sentence for both
 * would be wrong in one direction, so the direction is asked for.
 */
export type Direction = 'left' | 'joined';

export function standingLabel(
  standing: Standing,
  direction: Direction,
): string {
  switch (standing.kind) {
    case 'signer':
      return standing.signer;
    case 'stillHere':
      return 'still with this signer — the roster is short';
    case 'stopped':
      return direction === 'left'
        ? 'nothing locked — stopped stacking'
        : 'new — was not stacking';
    case 'locked':
      return direction === 'left'
        ? 'locked, but no position in that cycle'
        : 'was locked, but held no position then';
    default:
      return 'the node would not say';
  }
}

export function tallyStandings(
  standings: Map<string, Standing>,
  direction: Direction,
): { label: string; count: number; stakers: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const [staker, standing] of standings) {
    const label = standingLabel(standing, direction);
    const bucket = groups.get(label);
    if (bucket) bucket.push(staker);
    else groups.set(label, [staker]);
  }
  return [...groups]
    .map(([label, stakers]) => ({ label, count: stakers.length, stakers }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// The parts that read
// ---------------------------------------------------------------------------

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The roster the refresh committed for this signer and cycle, if it has one. */
function rosterFromFile(group: SignerGroup, cycle: number): Roster | null {
  const slug = signerSlug(group);
  const summary = readJson<SignerHistory>(path.join(HISTORY, `${slug}.json`));
  const onFile = summary?.cycles.find((c) => c.cycle === cycle);
  // No summary entry means nobody has walked this cycle, which is not the same
  // as a cycle with no members — so there is nothing to read here.
  if (!onFile || onFile.memberCount === null) return null;

  const amounts = new Map<string, bigint>();
  const contracts = new Map<string, string>();
  const file = readJson<SignerCycleMembers>(
    path.join(HISTORY, slug, `${cycle}.json`),
  );
  // A cycle with no members gets no file at all — `memberCount: 0` says it,
  // and an empty roster is the right reading of that.
  for (const member of file?.members ?? []) {
    amounts.set(member.staker, BigInt(member.ustx));
    contracts.set(member.staker, member.contractId);
  }
  if (onFile.memberCount !== amounts.size) return null;

  return {
    cycle,
    amounts,
    contracts,
    source: 'file',
    complete: onFile.membersAddUp,
  };
}

/** The roster read from the chain: one call per indexed staker. */
async function rosterFromChain(
  group: SignerGroup,
  cycle: number,
): Promise<Roster> {
  const contractIds = group.contracts.map((c) => c.contractId);
  const walk = await walkSignerMembers(contractIds, cycle, (note) =>
    console.error(`    ${note}`),
  );

  const amounts = new Map<string, bigint>();
  const contracts = new Map<string, string>();
  for (const member of walk.members) {
    if (member.position.kind !== 'member') continue;
    amounts.set(member.staker, member.position.ustx);
    contracts.set(member.staker, member.position.contract);
  }
  return {
    cycle,
    amounts,
    contracts,
    source: 'chain',
    complete:
      walk.indexComplete &&
      !walk.members.some((m) => m.position.kind === 'unknown'),
  };
}

async function rosterFor(
  group: SignerGroup,
  cycle: number,
  options: Options,
): Promise<Roster> {
  if (!options.fresh) {
    const onFile = rosterFromFile(group, cycle);
    if (onFile) return onFile;
  }
  if (!options.json) {
    console.error(`  walking cycle ${cycle} on the chain ...`);
  }
  return rosterFromChain(group, cycle);
}

/**
 * Every staker any signer's committed roster has for this cycle.
 *
 * Free, and it answers most of the lookups below. Absence from it means only
 * that no file we hold names them — never that they are not staking — so the
 * caller still has to ask the chain about anyone it does not find.
 */
function networkRoster(signers: Signer[], cycle: number): Map<string, string> {
  const where = new Map<string, string>();
  for (const group of groupBySignerKey(signers)) {
    const file = readJson<SignerCycleMembers>(
      path.join(HISTORY, signerSlug(group), `${cycle}.json`),
    );
    for (const member of file?.members ?? []) {
      where.set(member.staker, member.contractId);
    }
  }
  return where;
}

/** Whether this address has any STX locked, and until when. */
async function readLock(
  principal: string,
): Promise<{ locked: bigint; unlockHeight: number } | null> {
  try {
    const res = await fetch(`${API_URL}/v2/accounts/${principal}?proof=0`, {
      headers: nodeHeaders(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      locked: string;
      unlock_height: number;
    };
    return {
      locked: BigInt(body.locked),
      unlockHeight: body.unlock_height,
    };
  } catch {
    return null;
  }
}

/**
 * Where each of these stakers stands in `cycle`, for a signer that is not ours.
 *
 * The committed rosters answer first and cost nothing. Anyone they do not name
 * is asked about on the chain, and only a staker the chain positively says has
 * no position is looked at further — to tell somebody who stopped from
 * somebody whose stake simply starts in a later cycle.
 */
async function standingsFor(
  stakers: string[],
  cycle: number,
  ours: Set<string>,
  network: Map<string, string>,
  options: Options,
): Promise<Map<string, Standing>> {
  const standings = new Map<string, Standing>();

  for (const staker of stakers) {
    const fromFile = network.get(staker);
    if (fromFile && !ours.has(fromFile)) {
      standings.set(staker, { kind: 'signer', signer: fromFile });
      continue;
    }

    const reading = await readMembership(staker, cycle);
    await sleep(SPACING_MS);
    if (!reading.read) {
      standings.set(staker, { kind: 'unknown' });
      continue;
    }
    if (reading.value) {
      const signer = reading.value.signer;
      // A staker the chain puts with one of our own contracts never moved, so
      // they are not a destination — they are a hole in the roster that listed
      // them as gone.
      standings.set(
        staker,
        ours.has(signer)
          ? { kind: 'stillHere', signer }
          : { kind: 'signer', signer },
      );
      continue;
    }

    if (!options.lockCheck) {
      standings.set(staker, { kind: 'stopped' });
      continue;
    }
    const lock = await readLock(staker);
    await sleep(SPACING_MS);
    standings.set(
      staker,
      lock === null
        ? { kind: 'unknown' }
        : lock.locked > 0n
          ? { kind: 'locked', unlockHeight: lock.unlockHeight }
          : { kind: 'stopped' },
    );
  }

  return standings;
}

// ---------------------------------------------------------------------------
// Saying it
// ---------------------------------------------------------------------------

function describeRoster(roster: Roster): string {
  const source =
    roster.source === 'file' ? 'from the committed roster' : 'read from pox-5';
  return roster.complete
    ? source
    : `${source} — short, so the counts below are a floor`;
}

function printReport(
  group: SignerGroup,
  before: Roster,
  after: Roster,
  movement: Movement,
  leavers: Map<string, Standing>,
  joiners: Map<string, Standing>,
  options: Options,
) {
  const grew = after.amounts.size - before.amounts.size;
  const staked = {
    before: sum([...before.amounts.keys()], before.amounts),
    after: sum([...after.amounts.keys()], after.amounts),
  };

  console.log(`\n${groupName(group)} — signer key ${group.signerKey ?? '—'}`);
  console.log(`  cycle ${before.cycle} → ${after.cycle}`);
  console.log(`    ${before.cycle}: ${describeRoster(before)}`);
  console.log(`    ${after.cycle}: ${describeRoster(after)}`);

  console.log(
    `\n  members  ${before.amounts.size} → ${after.amounts.size}` +
      `  (${grew >= 0 ? '+' : ''}${grew})`,
  );
  const moved = staked.after - staked.before;
  console.log(
    `  staked   ${formatStx(staked.before)} → ${formatStx(staked.after)} STX` +
      `  (${moved >= 0n ? '+' : '-'}${formatStx(abs(moved))})`,
  );

  console.log(
    `\n  stayed  ${String(movement.stayed.length).padStart(4)}` +
      `  ${formatStx(sum(movement.stayed, after.amounts)).padStart(20)} STX` +
      ` in ${after.cycle}`,
  );
  const up = movement.changed.filter((c) => c.after > c.before).length;
  const down = movement.changed.length - up;
  console.log(
    `            of those, ${up} put in more, ${down} took some out,` +
      ` ${movement.stayed.length - movement.changed.length} unchanged`,
  );
  console.log(
    `  left    ${String(movement.left.length).padStart(4)}` +
      `  ${formatStx(sum(movement.left, before.amounts)).padStart(20)} STX` +
      ` they had in ${before.cycle}`,
  );
  console.log(
    `  joined  ${String(movement.joined.length).padStart(4)}` +
      `  ${formatStx(sum(movement.joined, after.amounts)).padStart(20)} STX` +
      ` in ${after.cycle}`,
  );

  const movers = (
    stakers: string[],
    standings: Map<string, Standing>,
    amounts: Map<string, bigint>,
    direction: Direction,
  ) => {
    const arrow = direction === 'left' ? '→' : '←';
    console.log(
      `\n  where the ${stakers.length} who ${direction} ` +
        `${direction === 'left' ? 'went' : 'came from'}:`,
    );
    for (const row of tallyStandings(standings, direction)) {
      console.log(
        `    ${String(row.count).padStart(4)}  ${label(row.label).padEnd(42)}` +
          `  ${formatStx(sum(row.stakers, amounts)).padStart(18)} STX`,
      );
    }
    console.log('');
    for (const staker of stakers.slice(0, options.top)) {
      const standing = standings.get(staker) ?? { kind: 'unknown' as const };
      console.log(
        `    ${formatStx(amounts.get(staker) ?? 0n).padStart(18)} STX` +
          `  ${shortPrincipal(staker).padEnd(46)}` +
          ` ${arrow} ${label(standingLabel(standing, direction))}`,
      );
    }
    if (stakers.length > options.top) {
      console.log(`    … ${stakers.length - options.top} more, --json for all`);
    }
  };

  if (movement.left.length) {
    movers(movement.left, leavers, before.amounts, 'left');
  }
  if (movement.joined.length) {
    movers(movement.joined, joiners, after.amounts, 'joined');
  }

  // Said last and said plainly: these are not movements at all, and every
  // count above is wrong by however many of them there are.
  const stale =
    [...leavers.values()].filter((s) => s.kind === 'stillHere').length +
    [...joiners.values()].filter((s) => s.kind === 'stillHere').length;
  if (stale) {
    console.log(
      `\n  ⚠ ${stale} of the movers above never moved — the chain puts them` +
        ' with this signer in both cycles, so a committed roster is behind.' +
        ' Re-run with --fresh, or `pnpm generate:history` to catch it up.',
    );
  }

  if (movement.changed.length) {
    console.log('\n  biggest changes among those who stayed:');
    for (const change of movement.changed.slice(0, options.top)) {
      const delta = change.after - change.before;
      console.log(
        `    ${delta > 0n ? '+' : '-'}${formatStx(abs(delta)).padStart(17)} STX` +
          `  ${shortPrincipal(change.staker).padEnd(46)}` +
          ` ${formatStx(change.before)} → ${formatStx(change.after)}`,
      );
    }
  }
  console.log('');
}

/** A destination as a column: a contract id shortened, a sentence as it is. */
function label(value: string): string {
  return value.includes('.') ? contractLabel(value) : value;
}

function toJson(
  group: SignerGroup,
  before: Roster,
  after: Roster,
  movement: Movement,
  leavers: Map<string, Standing>,
  joiners: Map<string, Standing>,
) {
  const roster = (r: Roster) => ({
    cycle: r.cycle,
    source: r.source,
    complete: r.complete,
    members: r.amounts.size,
    ustx: sum([...r.amounts.keys()], r.amounts).toString(),
  });
  const mover = (
    staker: string,
    amounts: Map<string, bigint>,
    standings: Map<string, Standing>,
  ) => ({
    staker,
    ustx: (amounts.get(staker) ?? 0n).toString(),
    standing: standings.get(staker) ?? { kind: 'unknown' },
  });

  return {
    signerKey: group.signerKey,
    name: groupName(group),
    contractIds: group.contracts.map((c) => c.contractId),
    from: roster(before),
    to: roster(after),
    stayed: movement.stayed.length,
    left: movement.left.map((s) => mover(s, before.amounts, leavers)),
    joined: movement.joined.map((s) => mover(s, after.amounts, joiners)),
    changed: movement.changed.map((c) => ({
      staker: c.staker,
      before: c.before.toString(),
      after: c.after.toString(),
      delta: (c.after - c.before).toString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const data = JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData;

  const matched = matchGroups(options.query as string, data.signers);
  if (matched.length === 0) {
    console.error(`No pool matches "${options.query}".`);
    process.exit(1);
  }
  if (matched.length > 1) {
    // Two signers is two reports, and averaging them would be nonsense.
    console.error(
      `"${options.query}" names ${matched.length} signers. Pick one:`,
    );
    for (const group of matched) console.error(`  ${groupName(group)}`);
    process.exit(1);
  }
  const group = matched[0];

  if (!options.json) {
    console.error(
      `Comparing cycles ${options.from} and ${options.to} for` +
        ` ${groupName(group)}, asking ${describeNode()} ...`,
    );
  }

  const before = await rosterFor(group, options.from as number, options);
  const after = await rosterFor(group, options.to as number, options);
  const movement = compare(before, after);

  const ours = new Set(group.contracts.map((c) => c.contractId));
  if (!options.json && (movement.left.length || movement.joined.length)) {
    console.error(
      `  looking up ${movement.left.length + movement.joined.length} mover(s) ...`,
    );
  }
  const leavers = await standingsFor(
    movement.left,
    after.cycle,
    ours,
    networkRoster(data.signers, after.cycle),
    options,
  );
  const joiners = await standingsFor(
    movement.joined,
    before.cycle,
    ours,
    networkRoster(data.signers, before.cycle),
    options,
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        toJson(group, before, after, movement, leavers, joiners),
        null,
        2,
      ),
    );
    return;
  }
  printReport(group, before, after, movement, leavers, joiners, options);
}

// Only when run, not when imported: the tests beside this file import the
// parts with no node in them.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
