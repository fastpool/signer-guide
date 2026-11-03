/**
 * Every staker and amount for a signer in a cycle, as one table.
 *
 * A secondlayer subgraph (https://www.secondlayer.tools/p/subgraphs) that
 * keeps a copy of pox-5's `staker-signer-cycle-memberships` map: one row per
 * staker per cycle, saying which signer contract they were with and for how
 * much. That map is what `get-signer-cycle-membership` reads, one staker at a
 * time, and what `generate:history` spends up to 2,000 calls a run asking
 * about. Here it is one request per signer and cycle:
 *
 *   GET /v1/subgraphs/pox5-signer-members/memberships?signer=<contract>&cycle=147
 *
 * The rules for what each print does are written in scripts/pox5-membership.ts,
 * shared with the replay that checked them against the chain, and copied in
 * below by `pnpm subgraph:sync`. Replayed over
 * every pox-5 event, they matched every closed-cycle member list the chain had
 * confirmed. They also caught one the committed history had wrong.
 *
 * Test and deploy, from the repository root:
 *
 *   (cd subgraphs && pnpm install --ignore-workspace)   # once: the CLI imports
 *                                                       # @secondlayer/subgraphs
 *   export SECONDLAYER_API_URL=https://api.secondlayer.tools
 *   export SECONDLAYER_API_KEY=…                         # as in .env
 *   secondlayer subgraphs test subgraphs/pox5-signer-members.ts --from 9040000 --to 9050000
 *   secondlayer subgraphs deploy subgraphs/pox5-signer-members.ts
 *
 * `test` stops at 1,000 events however high --limit is, so it checks a window
 * at a time. On 3 November 2026 three windows (8,665,700-8,700,000,
 * 9,040,000-9,050,000 and 9,390,000-9,402,900) gave exactly the rows the
 * chain-order replay of scripts/pox5-membership.ts gives for the same events.
 *
 * Cost: indexing reads pox-5's prints, about 20k rows so far plus a few
 * hundred a day, against a free tier of 1M a month. Reading the table is free.
 */

import { defineSubgraph } from '@secondlayer/subgraphs';

// The CLI bundles this file from stdin, so it cannot import the rules from
// scripts/. They are copied in below instead. Edit them there and run
// `pnpm subgraph:sync`; a test fails while this copy is out of date.
// ---- BEGIN copied from scripts/pox5-membership.ts by `pnpm subgraph:sync`. Do not edit here. ----

interface MembershipEvent {
  topic: string;
  /** Print fields, either as pox-5 prints them (kebab-case) or camelCased. */
  data: Record<string, unknown>;
}

interface CycleMembershipRow {
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
const MAX_LOCK_CYCLES = 96;

/** What one event does to one staker's rows. */
interface MembershipChange {
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
const MEMBERSHIP_TOPICS = [
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
function membershipChange(
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
type MembershipState = Map<string, Map<number, CycleMembershipRow>>;

/** Apply one change to an in-memory copy of the membership map. */
function applyChange(
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
function membersOf(
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

// ---- END copied from scripts/pox5-membership.ts ----

type Ctx = {
  delete: (table: string, where: Record<string, unknown>) => unknown;
  upsert: (
    table: string,
    key: Record<string, unknown>,
    row: Record<string, unknown>,
  ) => unknown;
};

/** What every handler does: the rules decide what each print writes. */
async function write(
  topic: string,
  event: { data: Record<string, unknown> },
  ctx: Ctx,
): Promise<void> {
  const change = membershipChange({ topic, data: event.data });
  if (!change) return;

  if (change.drop) {
    for (let c = change.drop.from; c < change.drop.to; c += 1) {
      await ctx.delete('memberships', { staker: change.staker, cycle: c });
    }
  }
  for (const row of change.set) {
    await ctx.upsert(
      'memberships',
      { staker: change.staker, cycle: row.cycle },
      {
        staker: change.staker,
        cycle: row.cycle,
        signer: row.signer,
        ustx: row.ustx,
        kind: row.kind,
      },
    );
  }
}

/*
 * The `prints` maps were inferred by `secondlayer subgraphs create
 * --from-contract` from 2,000 sampled pox-5 prints. The CLI requires them, and
 * a print that does not match its map is skipped and logged rather than
 * written, so a pox-5 upgrade that changes a print shows up in the logs
 * instead of as wrong rows. Fields arrive camelCased (`unlockCycle`), which
 * the rules accept as well as pox-5's own kebab-case.
 *
 * Everything inside defineSubgraph is written out as literals. The CLI reads
 * the definition without running it, and refuses an identifier or a computed
 * object there ("non-literal expression: Identifier"). So the five sources
 * prints are spelled out rather than built from MEMBERSHIP_TOPICS.
 *
 * startBlock is the block before pox-5's first print (grant-signer-key at
 * 8,665,732).
 */
export default defineSubgraph({
  name: 'pox5-signer-members',
  startBlock: 8665700,
  sources: {
    // One source for all five topics, so the handler sees them in chain
    // order. With one source per topic, `secondlayer subgraphs test` applied
    // each source's events as a group (every stake, then every stake-update,
    // ...), and an unstake replayed after a later re-stake deletes it: 96
    // rows short over blocks 8,665,700-8,700,000 against the chain-order
    // replay. Membership is only right in the order the chain wrote it.
    membership: {
      type: 'print_event',
      contractId: 'SP000000000000000000002Q6VF78.pox-5',
      prints: {
        stake: {
          amountUstx: 'uint',
          firstRewardCycle: 'uint',
          numCycles: 'uint',
          signer: 'principal',
          staker: 'principal',
          unlockBurnHeight: 'uint',
          unlockCycle: 'uint',
        },
        'stake-update': {
          amountIncrease: 'uint',
          amountUstx: 'uint',
          cyclesToExtend: 'uint',
          numCycles: 'uint',
          oldSigner: 'principal',
          prevUnlockHeight: 'uint',
          signer: 'principal',
          staker: 'principal',
          unlockBurnHeight: 'uint',
          unlockCycle: 'uint',
        },
        unstake: {
          amountUstx: 'uint',
          firstRewardCycle: 'uint',
          signer: 'principal',
          staker: 'principal',
          unlockBurnHeight: 'uint',
          unlockCycle: 'uint',
        },
        'register-for-bond': {
          amountUstx: 'uint',
          bondIndex: 'uint',
          btcLockup: 'jsonb',
          firstRewardCycle: 'uint',
          isL1Lock: 'boolean',
          satsTotal: 'uint',
          signer: 'principal',
          staker: 'principal',
          unlockBurnHeight: 'uint',
          unlockCycle: 'uint',
        },
        // Never printed on mainnet yet, so not inferred like the others: these
        // are the fields pox-5's source puts in the print.
        'update-bond-registration': {
          amountSats: 'uint',
          amountUstx: 'uint',
          bondIndex: 'uint',
          firstRewardCycle: 'uint',
          isL1Lock: 'boolean',
          numCycles: 'uint',
          oldSigner: 'principal',
          signer: 'principal',
          staker: 'principal',
        },
      },
    },
  },
  schema: {
    memberships: {
      columns: {
        staker: { type: 'principal', indexed: true },
        cycle: { type: 'uint', indexed: true },
        signer: { type: 'principal', indexed: true },
        ustx: { type: 'uint' },
        // 'stake' for STX-only, 'bond' for a protocol bond. pox-5 counts both
        // in `get-amount-delegated-for-signer`.
        kind: { type: 'text' },
      },
      // pox-5's own key: a staker is with one signer per cycle.
      uniqueKeys: [['staker', 'cycle']],
    },
  },
  handlers: {
    // Every other pox-5 topic is not in `prints` and never reaches here, and
    // membershipChange ignores any topic it has no rule for anyway.
    membership: (event, ctx) => write(event.topic, event, ctx),
  },
});
