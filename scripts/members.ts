/**
 * Who stakes with a signer in a cycle, read from the two sources that know.
 *
 * Shared by the report a person runs (`signer-members.ts`) and the generator
 * the refresh runs (`generate-signer-history.ts`), because the subtle part is
 * the same for both and is worth having once:
 *
 *  - `/extended/v3/staking/signers/{contract}/stakers` — Hiro's index of who
 *    has ever staked with a signer *contract*. A list of principals and
 *    nothing else: no amounts, and no claim that any of them is still there.
 *    Keyed by contract, so a signer's members are collected by walking each of
 *    its contracts.
 *  - `pox-5.get-signer-cycle-membership` — the chain, asked per staker: for
 *    this cycle, which signer are they with and for how much. This is what
 *    membership actually means.
 *
 * The index says who to ask about and the chain says what is true. Neither
 * failure is allowed to look like an answer: a page the index would not hand
 * over is reported as a short walk rather than as a smaller pool, and a staker
 * the node would not answer for is reported as unread rather than as gone.
 */

import { Cl, cvToHex } from '@stacks/transactions';
import { serializeUint } from '../src/lib/clarity.js';
import { getJson } from './hiro.js';
import { API_URL, RETRY_DELAYS_MS, sleep, SPACING_MS } from './node.js';
import {
  callReadOnly,
  optionalTuple,
  tuplePrincipal,
  tupleUint,
} from './pox5.js';

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
 * ends the walk, and what has been collected is still worth having — but a
 * refused first page and a pool nobody stakes with both come back as an empty
 * list, and reporting "0 members" for the first would be a rate limit dressed
 * up as an empty pool. So the walk says whether it finished, and the caller
 * has to decide which of the two it is looking at.
 */
export async function fetchIndexedStakers(contractId: string): Promise<{
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

/** What pox-5 has for this staker in this cycle. */
export async function readMembership(
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

export interface Member {
  staker: string;
  types: string[];
  position: Position;
}

export interface SignerIndex {
  /** Every staker of every contract, each appearing once. */
  stakers: Map<string, Set<string>>;
  /** False when an index refused a page, so the list below is short. */
  complete: boolean;
  /** What the indexes claim between them; null when one would not say. */
  indexedTotal: number | null;
}

/**
 * Every staker of every contract of one signer, gathered into one list.
 *
 * A staker who moved from one of these contracts to another is in both
 * indexes and is one member here, so they appear once — and the types both
 * indexes gave them are kept, since neither is wrong about how they staked.
 *
 * This is the cheap half of a walk: a page per hundred stakers, and no chain
 * calls at all. It is separated from the expensive half because its answer is
 * what says how expensive the other half will be, which is exactly what a
 * caller working to a budget has to know before it commits.
 */
export async function indexSigner(contractIds: string[]): Promise<SignerIndex> {
  const stakers = new Map<string, Set<string>>();
  let complete = true;
  let indexedTotal: number | null = 0;

  for (const contractId of contractIds) {
    const page = await fetchIndexedStakers(contractId);
    if (!page.complete) complete = false;
    indexedTotal =
      page.total === null || indexedTotal === null
        ? null
        : indexedTotal + page.total;

    for (const entry of page.stakers) {
      const types = stakers.get(entry.staker);
      if (types) for (const type of entry.types) types.add(type);
      else stakers.set(entry.staker, new Set(entry.types));
    }
    await sleep(SPACING_MS);
  }

  return { stakers, complete, indexedTotal };
}

/**
 * Where each indexed staker stands in one cycle — the expensive half.
 *
 * One chain call per staker, because pox-5 answers "who is this staker with"
 * and not "who is with this signer". `cycle` null asks nothing and reports
 * everybody as unread, which is what a listing of the index alone wants.
 */
export async function readPositions(
  index: SignerIndex,
  contractIds: string[],
  cycle: number | null,
  onNote: (note: string) => void = () => {},
): Promise<Member[]> {
  const members: Member[] = [];
  for (const [staker, types] of index.stakers) {
    const position: Position =
      cycle === null
        ? { kind: 'unknown' }
        : classify(await readMembership(staker, cycle), contractIds);
    members.push({ staker, types: [...types], position });
    if (cycle !== null) await sleep(SPACING_MS);
  }

  // A staker the node refused after its own retries is usually the rate limit
  // catching up with a long run, and one pass at the end clears it. Worth
  // doing here rather than telling somebody to run the whole thing again: it
  // is a handful of calls, and it is the difference between a total that adds
  // up and a total that has to be explained.
  const unread = members.filter((m) => m.position.kind === 'unknown');
  if (cycle !== null && unread.length) {
    onNote(
      `${unread.length} staker(s) went unread; asking again in a moment …`,
    );
    await sleep(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    for (const member of unread) {
      member.position = classify(
        await readMembership(member.staker, cycle),
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

  return members;
}

export interface Walk {
  members: Member[];
  /** False when an index refused a page, so the member list is short. */
  indexComplete: boolean;
  /** How many stakers the indexes claim; null when one would not say. */
  indexedTotal: number | null;
}

/** Both halves, for a caller with no budget to keep to. */
export async function walkSignerMembers(
  contractIds: string[],
  cycle: number | null,
  onNote: (note: string) => void = () => {},
): Promise<Walk> {
  const index = await indexSigner(contractIds);
  return {
    members: await readPositions(index, contractIds, cycle, onNote),
    indexComplete: index.complete,
    indexedTotal: index.indexedTotal,
  };
}
