/**
 * Which signer each staker is with in each cycle, from pox-5's own prints.
 *
 * pox-5 keeps one row per (staker, cycle) in `staker-signer-cycle-memberships`.
 * That is what `get-signer-cycle-membership` reads, and it is the thing a
 * member list is a list of. Only five public functions write it, and each
 * prints enough to replay what it wrote:
 *
 *   stake                 cycles [first-reward-cycle, unlock-cycle) → signer
 *   register-for-bond     the same, for a bond's term
 *   stake-update          drops [from, prev-unlock) and sets [from, unlock),
 *                         where from = unlock-cycle − num-cycles = current + 1
 *   unstake               drops every cycle from unlock-cycle (= current + 1)
 *   update-bond-registration
 *                         drops and re-sets [first-reward-cycle, +num-cycles)
 *                         under the new signer
 *
 * `stake-update` prints `prev-unlock-height`, but it holds a cycle, not a
 * height: it is `prev-unlock-cycle` in the contract.
 *
 * Shared by the secondlayer subgraph (subgraphs/pox5-signer-members.ts) and
 * by the replay that checks it against the chain. Both get one set of rules,
 * written down once. Replayed over every pox-5 event to 3 November 2026, it
 * matched every member list the chain had confirmed for a closed cycle, and
 * every signer's delegated total for cycle 146.
 */

export interface MembershipEvent {
  topic: string;
  /** Print fields, either as pox-5 prints them (kebab-case) or camelCased. */
  data: Record<string, unknown>;
}

export interface CycleMembershipRow {
  cycle: number;
  signer: string;
  ustx: bigint;
  /** STX-only staking, or a protocol bond. Both count towards the signer. */
  kind: 'stake' | 'bond';
}

/**
 * The longest lock pox-5 allows. `add-staker-to-signer-cycles` folds over a
 * list of 96, so no stake reaches further than 96 cycles past its first.
 */
export const MAX_LOCK_CYCLES = 96;

/** What one event does to one staker's rows. */
export interface MembershipChange {
  staker: string;
  /**
   * Delete the staker's rows for cycles in [from, to).
   *
   * Always a closed range, never "everything after". A hosted subgraph
   * applies a block's writes together when it commits, so a handler that
   * looked up which rows exist would miss the ones an earlier event in the
   * same block had just written. Deleting by key over a known range works
   * whatever is pending.
   */
  drop: { from: number; to: number } | null;
  /** Then write these rows, replacing any for the same cycle. */
  set: CycleMembershipRow[];
}

/** The topics that write signer membership. Anything else changes nothing. */
export const MEMBERSHIP_TOPICS = [
  'stake',
  'stake-update',
  'unstake',
  'register-for-bond',
  'update-bond-registration',
] as const;

function field(data: Record<string, unknown>, kebab: string): unknown {
  if (kebab in data) return data[kebab];
  const camel = kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return data[camel];
}

function uint(data: Record<string, unknown>, key: string): bigint {
  const value = field(data, key);
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value))
    return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`pox-5 print without a uint ${key}: ${String(value)}`);
}

function cycle(data: Record<string, unknown>, key: string): number {
  return Number(uint(data, key));
}

function principal(data: Record<string, unknown>, key: string): string {
  const value = field(data, key);
  if (typeof value !== 'string' || !value) {
    throw new Error(`pox-5 print without a principal ${key}`);
  }
  return value;
}

function span(
  from: number,
  to: number,
  signer: string,
  ustx: bigint,
  kind: CycleMembershipRow['kind'],
): CycleMembershipRow[] {
  const rows: CycleMembershipRow[] = [];
  for (let c = from; c < to; c += 1)
    rows.push({ cycle: c, signer, ustx, kind });
  return rows;
}

/** The change one pox-5 print makes, or null for a topic that makes none. */
export function membershipChange(
  event: MembershipEvent,
): MembershipChange | null {
  const d = event.data;
  switch (event.topic) {
    case 'stake': {
      const first = cycle(d, 'first-reward-cycle');
      const unlock = cycle(d, 'unlock-cycle');
      return {
        staker: principal(d, 'staker'),
        drop: null,
        set: span(
          first,
          unlock,
          principal(d, 'signer'),
          uint(d, 'amount-ustx'),
          'stake',
        ),
      };
    }
    case 'register-for-bond': {
      const first = cycle(d, 'first-reward-cycle');
      const unlock = cycle(d, 'unlock-cycle');
      return {
        staker: principal(d, 'staker'),
        drop: null,
        set: span(
          first,
          unlock,
          principal(d, 'signer'),
          uint(d, 'amount-ustx'),
          'bond',
        ),
      };
    }
    case 'stake-update': {
      const unlock = cycle(d, 'unlock-cycle');
      const from = unlock - cycle(d, 'num-cycles');
      const prevUnlock = cycle(d, 'prev-unlock-height');
      return {
        staker: principal(d, 'staker'),
        drop: { from, to: Math.max(prevUnlock, unlock) },
        set: span(
          from,
          unlock,
          principal(d, 'signer'),
          uint(d, 'amount-ustx'),
          'stake',
        ),
      };
    }
    case 'unstake': {
      // unlock-cycle is current + 1, and nothing this staker holds can
      // reach further than a full lock past it.
      const from = cycle(d, 'unlock-cycle');
      return {
        staker: principal(d, 'staker'),
        drop: { from, to: from + MAX_LOCK_CYCLES },
        set: [],
      };
    }
    case 'update-bond-registration': {
      const first = cycle(d, 'first-reward-cycle');
      const to = first + cycle(d, 'num-cycles');
      return {
        staker: principal(d, 'staker'),
        drop: { from: first, to },
        set: span(
          first,
          to,
          principal(d, 'signer'),
          uint(d, 'amount-ustx'),
          'bond',
        ),
      };
    }
    default:
      return null;
  }
}

/** staker → cycle → row: the whole membership map, for a replay. */
export type MembershipState = Map<string, Map<number, CycleMembershipRow>>;

/** Apply one change to an in-memory copy of the membership map. */
export function applyChange(
  state: MembershipState,
  change: MembershipChange,
): void {
  let rows = state.get(change.staker);
  if (!rows) state.set(change.staker, (rows = new Map()));
  if (change.drop) {
    const { from, to } = change.drop;
    for (const c of [...rows.keys()]) {
      if (c >= from && c < to) rows.delete(c);
    }
  }
  for (const row of change.set) rows.set(row.cycle, row);
}

/** Everyone with one of these contracts in one cycle, and for how much. */
export function membersOf(
  state: MembershipState,
  contractIds: readonly string[],
  cycleNumber: number,
): { staker: string; signer: string; ustx: bigint }[] {
  const wanted = new Set(contractIds);
  const found: { staker: string; signer: string; ustx: bigint }[] = [];
  for (const [staker, rows] of state) {
    const row = rows.get(cycleNumber);
    if (row && wanted.has(row.signer)) {
      found.push({ staker, signer: row.signer, ustx: row.ustx });
    }
  }
  return found;
}
