/**
 * Who stakes with a signer, and how much each of them has in it.
 *
 * The unit is the signer key, not the contract. A signer can register more
 * than one signer-manager contract against one key — four of them do — and
 * everything the key decides is decided on the contracts together: the stake
 * behind the key, its weight, the slots it holds. Reported per contract, half
 * of such a signer looks like a small pool and the other half looks like
 * another one. So a query naming any contract reports the whole signer, the
 * members of all its contracts in one list, and which contract each of them
 * is with in a column.
 *
 * Two sources, and they answer different questions:
 *
 *  - `/extended/v3/staking/signers/{signer}/stakers` — Hiro's index of who
 *    has ever staked with this signer contract. It is a list of principals
 *    and nothing else: no amounts, and no claim that any of them is still
 *    there. It is keyed by the signer *contract*, so unlike the pox-4-era
 *    `/extended/v2/pox/cycles/…/signers/{signer_key}/stackers`, two contracts
 *    sharing one signer key do not get one another's members — which is why a
 *    signer's members are collected by walking each of its contracts.
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
 *   A pool is named the same way as before, by contract id or by any part of
 *   its name; what comes back is the signer it belongs to, its sibling
 *   contracts included.
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
  /** With one of this signer's contracts — which one is worth keeping. */
  | { kind: 'member'; ustx: bigint; contract: string }
  /** Staking this cycle, but with a signer that is not this one. */
  | { kind: 'elsewhere'; signer: string; ustx: bigint }
  /** Known to the index, with nothing in this cycle. */
  | { kind: 'gone' }
  | { kind: 'unknown' };

/**
 * What one staker is to this signer.
 *
 * The chain answers with a signer-manager contract, and a signer may have
 * several: membership is of the group, so the contract named has to be one of
 * this signer's rather than the one whose index turned the staker up. A
 * staker who moved between two contracts of the same signer never left it.
 */
export function classify(
  reading: Reading<CycleMembership>,
  contractIds: readonly string[],
): Position {
  if (!reading.read) return { kind: 'unknown' };
  if (reading.value === null) return { kind: 'gone' };
  if (contractIds.includes(reading.value.signer)) {
    return {
      kind: 'member',
      ustx: reading.value.ustx,
      contract: reading.value.signer,
    };
  }
  return {
    kind: 'elsewhere',
    signer: reading.value.signer,
    ustx: reading.value.ustx,
  };
}

/** One signer key, and every contract registered against it. */
export interface SignerGroup {
  /** Null for a contract whose key is unknown, which groups with nothing. */
  signerKey: string | null;
  contracts: Signer[];
}

/**
 * The signers behind a list of pools.
 *
 * Contracts sharing a key are one signer. A contract with no key on file is
 * its own group rather than joining a "no key" pile: an unknown key is not
 * evidence of a shared one, and merging on it would invent a signer.
 */
export function groupBySignerKey(signers: Signer[]): SignerGroup[] {
  const groups: SignerGroup[] = [];
  const byKey = new Map<string, SignerGroup>();

  for (const signer of signers) {
    const key = signer.signerKey;
    if (!key) {
      groups.push({ signerKey: null, contracts: [signer] });
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.contracts.push(signer);
      continue;
    }
    const group: SignerGroup = { signerKey: key, contracts: [signer] };
    byKey.set(key, group);
    groups.push(group);
  }

  return groups;
}

/**
 * The signers a query names — one contract brings its siblings with it.
 *
 * Naming a contract is how somebody asks about a pool, and the honest answer
 * to "who stakes with this pool" for half a signer is the whole signer.
 */
export function matchGroups(query: string, signers: Signer[]): SignerGroup[] {
  const groups = groupBySignerKey(signers);
  const matched: SignerGroup[] = [];

  for (const signer of matchSigners(query, signers)) {
    const group = groups.find((candidate) =>
      candidate.contracts.some((c) => c.contractId === signer.contractId),
    );
    if (group && !matched.includes(group)) matched.push(group);
  }

  return matched;
}

/** What to call a signer: the names of its contracts, in one line. */
export function groupName(group: SignerGroup): string {
  return group.contracts.map((contract) => contract.displayName).join(' + ');
}

/** A contract id short enough for a column: the name after the dot. */
export function contractLabel(contractId: string): string {
  return contractId.split('.')[1] ?? contractId;
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
 * about. Any one contract holding something is enough: the signer is staked.
 */
async function chooseCycle(contractIds: string[]): Promise<number | null> {
  const current = await fetchCurrentCycle();
  if (current === null) return null;

  for (const contractId of contractIds) {
    const delegated = await fetchAmountDelegated(contractId, current);
    if (delegated !== null && delegated > 0n) return current;
  }
  for (const contractId of contractIds) {
    const next = await fetchAmountDelegated(contractId, current + 1);
    if (next !== null && next > 0n) return current + 1;
  }
  return current;
}

interface Member {
  staker: string;
  types: string[];
  position: Position;
}

/** One contract of a signer, and what the two sources say about it. */
interface ContractReport {
  contractId: string;
  displayName: string;
  indexedTotal: number | null;
  /** False when the index refused a page, so the member list is short. */
  indexComplete: boolean;
  /** What pox-5 says this contract holds for the cycle, null if unreadable. */
  delegatedUstx: bigint | null;
}

interface Report {
  signerKey: string | null;
  name: string;
  contracts: ContractReport[];
  /** Null only with `--no-amounts`, where no cycle was needed to answer. */
  cycle: number | null;
  /** Every staker of every contract, each counted once. */
  members: Member[];
  /** The contracts' amounts added up, or null when one would not read. */
  delegatedUstx: bigint | null;
}

async function buildReport(
  group: SignerGroup,
  options: Options,
): Promise<Report | null> {
  const contractIds = group.contracts.map((contract) => contract.contractId);
  // `--no-amounts` is a listing of the index and nothing else, so it does not
  // need a cycle — and must not fail for want of one the run never uses.
  const cycle =
    options.cycle ?? (options.amounts ? await chooseCycle(contractIds) : null);
  if (options.amounts && cycle === null) {
    console.error('The node would not say what cycle it is in.');
    return null;
  }

  /*
   * One walk per contract, into one list of people. A staker who moved from
   * one of these contracts to another is in both indexes and is one member of
   * this signer, so they are read once — and the types both indexes gave them
   * are kept, since neither is wrong about how they staked.
   */
  const contracts: ContractReport[] = [];
  const indexed = new Map<string, Set<string>>();

  /** The cycle to ask about, or null when this run asks nothing. */
  const asking = options.amounts ? (cycle as number) : null;

  for (const contract of group.contracts) {
    const { stakers, total, complete } = await fetchIndexedStakers(
      contract.contractId,
    );
    contracts.push({
      contractId: contract.contractId,
      displayName: contract.displayName,
      indexedTotal: total,
      indexComplete: complete,
      delegatedUstx:
        asking === null
          ? null
          : await fetchAmountDelegated(contract.contractId, asking),
    });

    for (const entry of stakers) {
      const types = indexed.get(entry.staker);
      if (types) for (const type of entry.types) types.add(type);
      else indexed.set(entry.staker, new Set(entry.types));
    }
    await sleep(SPACING_MS);
  }

  const members: Member[] = [];
  for (const [staker, types] of indexed) {
    const position: Position =
      asking === null
        ? { kind: 'unknown' }
        : classify(await readMembership(staker, asking), contractIds);
    members.push({ staker, types: [...types], position });
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
        await readMembership(member.staker, asking as number),
        contractIds,
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

  // Null beats a total that is short by a contract nobody could read: the
  // check below it is only worth printing when both sides are whole.
  const readable = contracts.every((c) => c.delegatedUstx !== null);

  return {
    signerKey: group.signerKey,
    name: groupName(group),
    contracts,
    cycle,
    members,
    delegatedUstx:
      options.amounts && readable
        ? contracts.reduce((sum, c) => sum + (c.delegatedUstx as bigint), 0n)
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

  const indexComplete = report.contracts.every((c) => c.indexComplete);
  const indexedTotal = report.contracts.every((c) => c.indexedTotal !== null)
    ? report.contracts.reduce((sum, c) => sum + (c.indexedTotal as number), 0)
    : null;

  console.log(`\n${report.name} — signer key ${report.signerKey ?? '—'}`);
  if (report.cycle !== null) console.log(`  cycle ${report.cycle}`);

  // The contracts, always — one of them is the answer to "which of these is
  // the pool I asked about", and their amounts are what the signer's total is
  // made of.
  console.log(
    `  ${report.contracts.length} contract(s) registered with this key:`,
  );
  const idWidth = Math.max(
    ...report.contracts.map((contract) => contract.contractId.length),
  );
  for (const contract of report.contracts) {
    const held =
      contract.delegatedUstx === null
        ? ''
        : `  ${formatStx(contract.delegatedUstx).padStart(20)} STX`;
    console.log(
      `    ${contract.displayName.padEnd(24)}` +
        ` ${contract.contractId.padEnd(idWidth)}${held}`,
    );
  }

  // Before any count is printed: a refused page and a signer nobody stakes
  // with both leave an empty list, and only one of them is news.
  if (!indexComplete) {
    console.log(
      `  Hiro's index would not answer${
        report.members.length ? ' for every page' : ''
      }. ${report.members.length} staker(s) came back` +
        `${indexedTotal === null ? '' : ` of ${indexedTotal}`},` +
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
  // Which contract only earns a column when there is a choice to report.
  const several = report.contracts.length > 1;
  console.log('');
  for (const [index, member] of shown.entries()) {
    const position = member.position as { ustx: bigint; contract: string };
    const share =
      staked === 0n ? 0 : Number((position.ustx * 10000n) / staked) / 100;
    console.log(
      `  ${String(index + 1).padStart(4)}  ${member.staker.padEnd(45)}` +
        ` ${formatStx(position.ustx).padStart(20)} STX` +
        `  ${share.toFixed(2).padStart(6)}%` +
        `${several ? `  ${contractLabel(position.contract).padEnd(30)}` : ''}` +
        `  [${member.types.join(', ')}]`,
    );
  }
  if (shown.length < staking.length) {
    console.log(`  … ${staking.length - shown.length} more, --json for all`);
  }

  console.log('');
  // Per contract as well as per signer: the signer's total is the number that
  // matters, but a contract whose own members do not add up is the one to go
  // and look at, and the sum would hide which.
  if (several) {
    console.log('  by contract:');
    for (const contract of report.contracts) {
      const mine = staking.filter(
        (m) =>
          (m.position as { contract: string }).contract === contract.contractId,
      );
      const held = mine.reduce(
        (sum, m) => sum + (m.position as { ustx: bigint }).ustx,
        0n,
      );
      const against =
        contract.delegatedUstx === null
          ? '  (pox-5 would not say)'
          : contract.delegatedUstx === held
            ? '  ✓'
            : `  ✗ pox-5 says ${formatStx(contract.delegatedUstx)}`;
      console.log(
        `    ${contract.displayName.padEnd(24)}` +
          ` ${String(mine.length).padStart(4)} member(s)` +
          ` ${formatStx(held).padStart(20)} STX${against}`,
      );
    }
    console.log('');
  }

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
  // Counted across contracts, so a staker in two of their indexes is one
  // person here and two there — a difference of one is not a cut-short walk.
  if (indexedTotal !== null && indexedTotal < report.members.length) {
    console.log(
      `  the indexes report ${indexedTotal} staker(s) but returned` +
        ` ${report.members.length} — the walk was cut short`,
    );
  }

  // The one check worth printing every time: the members' amounts against
  // what the signer says it holds. Both come from pox-5, so they should agree
  // exactly, and a difference means somebody staking here is not in the index
  // — which is the one failure this script cannot see any other way.
  if (report.delegatedUstx === null) {
    console.log(
      '  pox-5 would not say what the signer holds, so nothing to check against',
    );
  } else if (report.delegatedUstx === staked) {
    console.log(`  ✓ adds up to what pox-5 says the signer holds this cycle`);
  } else {
    const difference = report.delegatedUstx - staked;
    // Which explanation to offer is not a guess: a staker this run could not
    // read, or a page the index would not hand over, accounts for a gap by
    // itself. Only with neither of those is "somebody the index has never
    // heard of" the thing left, and that is the finding worth making.
    const because =
      unknown.length || !indexComplete
        ? ' Expected: this run could not read everyone. Run it again before' +
          ' reading anything into the difference.'
        : ' Everyone was read, so somebody staking here is not in the index —' +
          ' or staked while this ran.';
    console.log(
      `  ✗ pox-5 says the signer holds ${formatStx(report.delegatedUstx)} STX,` +
        ` which is ${formatStx(difference < 0n ? -difference : difference)} STX` +
        `${difference > 0n ? ' more' : ' less'} than the members above.` +
        because,
    );
  }
}

function toJson(report: Report) {
  return {
    signerKey: report.signerKey,
    name: report.name,
    cycle: report.cycle,
    delegatedUstx: report.delegatedUstx?.toString() ?? null,
    contracts: report.contracts.map((contract) => ({
      contractId: contract.contractId,
      displayName: contract.displayName,
      indexedTotal: contract.indexedTotal,
      indexComplete: contract.indexComplete,
      delegatedUstx: contract.delegatedUstx?.toString() ?? null,
    })),
    members: report.members.map((member) => ({
      staker: member.staker,
      types: member.types,
      status: member.position.kind,
      ustx:
        member.position.kind === 'member' ||
        member.position.kind === 'elsewhere'
          ? member.position.ustx.toString()
          : null,
      /** Which of this signer's contracts they are with. */
      contract:
        member.position.kind === 'member' ? member.position.contract : null,
      /** The signer they went to, when it is not this one. */
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

  const wanted: SignerGroup[] = [];
  for (const query of options.queries) {
    const matches = matchGroups(query, signers);
    if (matches.length === 0) {
      console.error(`No pool matches "${query}".`);
      process.exit(1);
    }
    for (const match of matches) {
      if (!wanted.includes(match)) wanted.push(match);
    }
  }

  if (!options.json) {
    console.log(
      `Asking ${describeNode()} about ${wanted.length} signer(s):` +
        ` ${wanted.map(groupName).join(', ')}`,
    );
  }

  const reports: Report[] = [];
  for (const group of wanted) {
    const report = await buildReport(group, options);
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
