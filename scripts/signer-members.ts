/**
 * Who stakes with a pool, and how much each of them has in it.
 *
 * Two sources, and they answer different questions:
 *
 *  - `/extended/v3/staking/signers/{signer}/stakers` — Hiro's index of who
 *    has ever staked with this signer contract. It is a list of principals
 *    and nothing else: no amounts, and no claim that any of them is still
 *    there. It is keyed by the signer *contract*, so unlike the pox-4-era
 *    `/extended/v2/pox/cycles/…/signers/{signer_key}/stackers`, two contracts
 *    sharing one signer key do not get one another's members.
 *  - `pox-5.get-signer-cycle-membership` — the chain, asked per staker: for
 *    this cycle, which signer are they with and for how much. This is what
 *    membership actually means, and it is the number the pool's own total is
 *    made of.
 *
 * So the index says who to ask about and the chain says what is true, which
 * is the only ordering that can be checked: the members' amounts are summed
 * and compared against `get-amount-delegated-for-signer` for the same cycle,
 * and a difference is printed rather than swallowed. A staker the index has
 * never heard of is invisible to this script, and that comparison is what
 * would say so.
 *
 * Usage:
 *   npx tsx scripts/signer-members.ts max500
 *   npx tsx scripts/signer-members.ts "fast pool" --top 20
 *   npx tsx scripts/signer-members.ts SPMPMA….fastpool-max500-signer-manager --json
 *
 *   --cycle N      the reward cycle to ask about (default: the current one,
 *                  or the next when nothing is locked in the current one yet)
 *   --top N        print only the N largest members (JSON is never truncated)
 *   --no-amounts   list the index and stop, asking the chain nothing
 *   --json         the whole answer as JSON, for piping somewhere else
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 *
 * `@stacks/transactions` is used here to read the answers, where
 * `src/lib/clarity.ts` exists to avoid it. That file is about the page's
 * bundle; nothing under `scripts/` reaches a browser, and hand-decoding a
 * tuple to save bytes nobody downloads would be inventing a risk.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cl, cvToHex } from '@stacks/transactions';
import { serializeUint } from '../src/lib/clarity.js';
import type { Signer, SignerData } from '../src/lib/types.js';
import { formatStx } from './format.js';
import { getJson } from './hiro.js';
import { fetchAmountDelegated } from './locked.js';
import {
  API_URL,
  describeNode,
  RETRY_DELAYS_MS,
  sleep,
  SPACING_MS,
} from './node.js';
import {
  callReadOnly,
  fetchCurrentCycle,
  optionalTuple,
  tuplePrincipal,
  tupleUint,
} from './pox5.js';

const SIGNERS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'signers.json',
);

// ---------------------------------------------------------------------------
// The parts with no node in them
// ---------------------------------------------------------------------------

export interface Options {
  queries: string[];
  cycle: number | null;
  top: number | null;
  amounts: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    queries: [],
    cycle: null,
    top: null,
    amounts: true,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--no-amounts') options.amounts = false;
    else if (arg === '--cycle') options.cycle = Number(argv[(i += 1)]);
    else if (arg === '--top') options.top = Number(argv[(i += 1)]);
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else options.queries.push(arg);
  }

  if (options.cycle !== null && !Number.isInteger(options.cycle)) {
    throw new Error('--cycle takes a cycle number');
  }
  if (options.top !== null && !(options.top > 0)) {
    throw new Error('--top takes a count');
  }
  return options;
}

/** Lower case, letters and digits only — so "fast pool" finds `fastpool-1`. */
const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The pools a query names.
 *
 * An exact contract id means that one pool and nothing else. Anything else is
 * matched loosely against both the contract id and the name the guide shows,
 * and every match is reported — "fast pool" naming two pools is an answer,
 * not an error, and picking one of them silently would be the wrong kind of
 * helpful.
 */
export function matchSigners(query: string, signers: Signer[]): Signer[] {
  const exact = signers.filter((signer) => signer.contractId === query);
  if (exact.length) return exact;

  const needle = fold(query);
  if (!needle) return [];
  return signers.filter(
    (signer) =>
      fold(signer.contractId).includes(needle) ||
      fold(signer.displayName).includes(needle),
  );
}

/**
 * What the node said about one staker, kept apart from what it means.
 *
 * `read: false` is "the node would not answer", which is not the same as an
 * answer of none — the first is a gap in this run, the second is a fact about
 * the staker, and reporting one as the other is how somebody ends up missing
 * from a list of who is owed rewards.
 */
export type Reading<T> = { read: false } | { read: true; value: T | null };

export interface CycleMembership {
  signer: string;
  ustx: bigint;
}

export type Position =
  | { kind: 'member'; ustx: bigint }
  /** Staking this cycle, but with somebody else. */
  | { kind: 'elsewhere'; signer: string; ustx: bigint }
  /** Known to the index, with nothing in this cycle. */
  | { kind: 'gone' }
  | { kind: 'unknown' };

export function classify(
  reading: Reading<CycleMembership>,
  contractId: string,
): Position {
  if (!reading.read) return { kind: 'unknown' };
  if (reading.value === null) return { kind: 'gone' };
  if (reading.value.signer === contractId) {
    return { kind: 'member', ustx: reading.value.ustx };
  }
  return {
    kind: 'elsewhere',
    signer: reading.value.signer,
    ustx: reading.value.ustx,
  };
}

/** Every other pool registered with the same signer key. */
export function sharesKeyWith(signer: Signer, signers: Signer[]): Signer[] {
  if (!signer.signerKey) return [];
  return signers.filter(
    (other) =>
      other.contractId !== signer.contractId &&
      other.signerKey === signer.signerKey,
  );
}

// ---------------------------------------------------------------------------
// The parts that ask
// ---------------------------------------------------------------------------

export interface IndexedStaker {
  staker: string;
  types: string[];
}

interface IndexPage {
  total?: number;
  results?: IndexedStaker[];
  cursor?: { next: string | null };
}

/**
 * Every staker the index has for this signer contract, following its cursor.
 *
 * `complete` is the part that matters. A page the index will not answer for
 * ends the walk, and what has been collected is still worth printing — but a
 * refused first page and a pool nobody stakes with both come back as an empty
 * list, and printing "0 members" for the first would be reporting a rate
 * limit as an empty pool. So the walk says whether it finished, and the
 * caller has to say which of the two it is looking at.
 */
async function fetchIndexedStakers(contractId: string): Promise<{
  stakers: IndexedStaker[];
  total: number | null;
  complete: boolean;
}> {
  const stakers: IndexedStaker[] = [];
  let cursor: string | null = null;
  let total: number | null = null;
  const seen = new Set<string>();

  do {
    const url = new URL(
      `${API_URL}/extended/v3/staking/signers/${contractId}/stakers`,
    );
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const page = (await getJson<IndexPage>(url.toString())).value;
    if (!page) return { stakers, total, complete: false };

    total = page.total ?? total;
    for (const entry of page.results ?? []) {
      if (seen.has(entry.staker)) continue;
      seen.add(entry.staker);
      stakers.push(entry);
    }

    cursor = page.cursor?.next ?? null;
    // A cursor pointing at a page we have already walked would loop forever.
    if (cursor && seen.has(cursor) && (page.results?.length ?? 0) === 0) break;
    if (cursor) await sleep(SPACING_MS);
  } while (cursor);

  return { stakers, total, complete: true };
}

/** What pox-5 has for this staker in this cycle. */
async function readMembership(
  staker: string,
  cycle: number,
): Promise<Reading<CycleMembership>> {
  let stakerArg: string;
  try {
    stakerArg = cvToHex(Cl.principal(staker));
  } catch {
    // Not a principal the chain could hold a position for. The index gave it
    // to us, so say nothing rather than counting it as having left.
    return { read: false };
  }

  const result = await callReadOnly('get-signer-cycle-membership', [
    stakerArg,
    `0x${serializeUint(cycle)}`,
  ]);
  if (result === null) return { read: false };

  try {
    const tuple = optionalTuple(result);
    if (tuple === null) return { read: true, value: null };
    return {
      read: true,
      value: {
        signer: tuplePrincipal(tuple, 'signer'),
        ustx: tupleUint(tuple, 'amount-ustx'),
      },
    };
  } catch {
    return { read: false };
  }
}

/**
 * The cycle to ask about.
 *
 * pox-5 went live part-way through cycle 140 and nothing is locked with it
 * until 141, so the current cycle reads as empty for every pool during that
 * window — the same wrinkle `readLockedTotals` handles, for the same reason.
 * An empty current cycle here means the next one is what somebody is asking
 * about.
 */
async function chooseCycle(contractId: string): Promise<number | null> {
  const current = await fetchCurrentCycle();
  if (current === null) return null;

  const delegated = await fetchAmountDelegated(contractId, current);
  if (delegated !== null && delegated > 0n) return current;

  const next = await fetchAmountDelegated(contractId, current + 1);
  return next !== null && next > 0n ? current + 1 : current;
}

interface Member {
  staker: string;
  types: string[];
  position: Position;
}

interface Report {
  contractId: string;
  displayName: string;
  signerKey: string | null;
  cycle: number;
  indexedTotal: number | null;
  /** False when the index refused a page, so the list below is short. */
  indexComplete: boolean;
  members: Member[];
  /** Other pools registered with the same signer key. */
  sharedWith: string[];
  /** What pox-5 says the pool holds for the cycle, or null if unreadable. */
  delegatedUstx: bigint | null;
}

async function buildReport(
  signer: Signer,
  signers: Signer[],
  options: Options,
): Promise<Report | null> {
  const cycle = options.cycle ?? (await chooseCycle(signer.contractId));
  if (cycle === null) {
    console.error('The node would not say what cycle it is in.');
    return null;
  }

  const { stakers, total, complete } = await fetchIndexedStakers(
    signer.contractId,
  );

  const members: Member[] = [];
  for (const entry of stakers) {
    const position: Position = options.amounts
      ? classify(await readMembership(entry.staker, cycle), signer.contractId)
      : { kind: 'unknown' };
    members.push({ staker: entry.staker, types: entry.types, position });
    if (options.amounts) await sleep(SPACING_MS);
  }

  // A staker the node refused after its own retries is usually the rate limit
  // catching up with a long run, and one pass at the end clears it. Worth
  // doing here rather than telling somebody to run the whole thing again: it
  // is a handful of calls, and it is the difference between a total that adds
  // up and a total that has to be explained.
  const unread = members.filter((m) => m.position.kind === 'unknown');
  if (options.amounts && unread.length) {
    console.error(
      `  ${unread.length} staker(s) went unread; asking again in a moment ...`,
    );
    await sleep(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    for (const member of unread) {
      member.position = classify(
        await readMembership(member.staker, cycle),
        signer.contractId,
      );
      await sleep(SPACING_MS);
    }
  }

  // Largest first: the question behind "who is in this pool" is usually who
  // is most of it.
  members.sort((a, b) => {
    const left = a.position.kind === 'member' ? a.position.ustx : -1n;
    const right = b.position.kind === 'member' ? b.position.ustx : -1n;
    if (left === right) return a.staker.localeCompare(b.staker);
    return right > left ? 1 : -1;
  });

  return {
    contractId: signer.contractId,
    displayName: signer.displayName,
    signerKey: signer.signerKey ?? null,
    cycle,
    indexedTotal: total,
    indexComplete: complete,
    members,
    sharedWith: sharesKeyWith(signer, signers).map((s) => s.contractId),
    delegatedUstx: options.amounts
      ? await fetchAmountDelegated(signer.contractId, cycle)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Saying it
// ---------------------------------------------------------------------------

function printReport(report: Report, options: Options) {
  const staking = report.members.filter((m) => m.position.kind === 'member');
  const staked = staking.reduce(
    (sum, m) => sum + (m.position as { ustx: bigint }).ustx,
    0n,
  );

  console.log(`\n${report.displayName} — ${report.contractId}`);
  console.log(`  cycle ${report.cycle}, signer key ${report.signerKey ?? '—'}`);

  if (report.sharedWith.length) {
    console.log(
      `  note: ${report.sharedWith.length} other contract(s) use this signer` +
        ` key — ${report.sharedWith.join(', ')}. The members below are this` +
        " contract's alone; anything keyed on the signer key counts them" +
        ' together.',
    );
  }

  // Before any count is printed: a refused page and a pool nobody stakes with
  // both leave an empty list, and only one of them is news about the pool.
  if (!report.indexComplete) {
    console.log(
      `  Hiro's index would not answer${
        report.members.length ? ' for every page' : ''
      }. ${report.members.length} staker(s) came back` +
        `${report.indexedTotal === null ? '' : ` of ${report.indexedTotal}`},` +
        ' so what follows is short by an unknown number of people. Run it' +
        ' again, or set HIRO_API_KEY.',
    );
    if (report.members.length === 0) return;
  }

  if (!options.amounts) {
    console.log(`  ${report.members.length} staker(s) in Hiro's index\n`);
    for (const member of report.members) {
      console.log(`  ${member.staker}  [${member.types.join(', ')}]`);
    }
    return;
  }

  const gone = report.members.filter((m) => m.position.kind === 'gone').length;
  const elsewhere = report.members.filter(
    (m) => m.position.kind === 'elsewhere',
  );
  const unknown = report.members.filter((m) => m.position.kind === 'unknown');

  console.log(
    `  ${staking.length} member(s) this cycle, ${formatStx(staked)} STX between them`,
  );

  const shown = options.top ? staking.slice(0, options.top) : staking;
  console.log('');
  for (const [index, member] of shown.entries()) {
    const ustx = (member.position as { ustx: bigint }).ustx;
    const share = staked === 0n ? 0 : Number((ustx * 10000n) / staked) / 100;
    console.log(
      `  ${String(index + 1).padStart(4)}  ${member.staker.padEnd(45)}` +
        ` ${formatStx(ustx).padStart(20)} STX  ${share.toFixed(2).padStart(6)}%` +
        `  [${member.types.join(', ')}]`,
    );
  }
  if (shown.length < staking.length) {
    console.log(`  … ${staking.length - shown.length} more, --json for all`);
  }

  console.log('');
  if (gone) {
    console.log(`  ${gone} indexed staker(s) hold nothing in this cycle`);
  }
  if (elsewhere.length) {
    console.log(
      `  ${elsewhere.length} indexed staker(s) are with another signer now`,
    );
  }
  if (unknown.length) {
    // Named, because these are the ones a re-run should look at: the amount
    // below will be short by whatever they hold, and this says who to ask
    // about rather than leaving a number that does not add up.
    console.log(`  ${unknown.length} staker(s) the node would not answer for:`);
    for (const member of unknown) console.log(`    ${member.staker}`);
  }
  if (
    report.indexedTotal !== null &&
    report.indexedTotal !== report.members.length
  ) {
    console.log(
      `  the index reports ${report.indexedTotal} staker(s) but returned` +
        ` ${report.members.length} — the walk was cut short`,
    );
  }

  // The one check worth printing every time: the members' amounts against
  // what the pool says it holds. Both come from pox-5, so they should agree
  // exactly, and a difference means somebody staking here is not in the index
  // — which is the one failure this script cannot see any other way.
  if (report.delegatedUstx === null) {
    console.log(
      '  pox-5 would not say what the pool holds, so nothing to check against',
    );
  } else if (report.delegatedUstx === staked) {
    console.log(`  ✓ adds up to what pox-5 says the pool holds this cycle`);
  } else {
    const difference = report.delegatedUstx - staked;
    // Which explanation to offer is not a guess: a staker this run could not
    // read, or a page the index would not hand over, accounts for a gap by
    // itself. Only with neither of those is "somebody the index has never
    // heard of" the thing left, and that is the finding worth making.
    const because =
      unknown.length || !report.indexComplete
        ? ' Expected: this run could not read everyone. Run it again before' +
          ' reading anything into the difference.'
        : ' Everyone was read, so somebody staking here is not in the index —' +
          ' or staked while this ran.';
    console.log(
      `  ✗ pox-5 says the pool holds ${formatStx(report.delegatedUstx)} STX,` +
        ` which is ${formatStx(difference < 0n ? -difference : difference)} STX` +
        `${difference > 0n ? ' more' : ' less'} than the members above.` +
        because,
    );
  }
}

function toJson(report: Report) {
  return {
    contractId: report.contractId,
    displayName: report.displayName,
    signerKey: report.signerKey,
    cycle: report.cycle,
    delegatedUstx: report.delegatedUstx?.toString() ?? null,
    members: report.members.map((member) => ({
      staker: member.staker,
      types: member.types,
      status: member.position.kind,
      ustx:
        member.position.kind === 'member' ||
        member.position.kind === 'elsewhere'
          ? member.position.ustx.toString()
          : null,
      signer:
        member.position.kind === 'elsewhere' ? member.position.signer : null,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const signers = (JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData)
    .signers;

  if (options.queries.length === 0) {
    console.error(
      'Name a pool: a contract id, or any part of its name.\n' +
        '  npx tsx scripts/signer-members.ts max500\n',
    );
    console.error('Pools the guide knows:');
    for (const signer of signers) {
      console.error(`  ${signer.displayName.padEnd(30)} ${signer.contractId}`);
    }
    process.exit(1);
  }

  const wanted: Signer[] = [];
  for (const query of options.queries) {
    const matches = matchSigners(query, signers);
    if (matches.length === 0) {
      console.error(`No pool matches "${query}".`);
      process.exit(1);
    }
    for (const match of matches) {
      if (!wanted.some((s) => s.contractId === match.contractId)) {
        wanted.push(match);
      }
    }
  }

  if (!options.json) {
    console.log(
      `Asking ${describeNode()} about ${wanted.length} pool(s):` +
        ` ${wanted.map((s) => s.displayName).join(', ')}`,
    );
  }

  const reports: Report[] = [];
  for (const signer of wanted) {
    const report = await buildReport(signer, signers, options);
    if (report) reports.push(report);
  }

  if (options.json) {
    console.log(JSON.stringify(reports.map(toJson), null, 2));
    return;
  }
  for (const report of reports) printReport(report, options);
}

// Only when run, not when imported: the tests below this file's name import
// the parts with no node in them, and a module that asks Hiro on import
// cannot be tested at all.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
