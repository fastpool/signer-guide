/**
 * Where the sBTC rewards have got to, and how many people are still owed some.
 *
 * Rewards do not arrive; they are fetched, in two hops, neither of which
 * happens on its own:
 *
 *   pox-5  --claim-rewards-->  signer manager  --claim-staker-rewards-->  you
 *
 * pox-5 accrues per cycle against the signer's shares. `claim-rewards` on the
 * signer manager pulls that across as real sBTC; until somebody calls it, the
 * money is in pox-5 and the pool's own balance does not show it. Then each
 * staker's share sits pooled in the manager until `claim-staker-rewards`
 * moves it. Both calls are permissionless — anyone may make them for anyone —
 * which is exactly why nobody does.
 *
 * So there are two piles, and this counts both:
 *
 *   in pox-5     `get-earned(signer, cycle, bond-index)` — settled and
 *                unsettled together, per pool
 *   in the pool  `get-unclaimed-staker-rewards` — pulled from pox-5, not yet
 *                attributed to anybody
 *
 * The Capped Fee implementation adds a stage the others do not have. Its
 * `settle-staker-rewards` moves a share out of the pooled bucket into that
 * staker's `pending-payouts` so small cycles can accumulate before paying one
 * Bitcoin fee. That balance is theirs but still in the contract, so
 * `get-total-pending-payouts` counts as a third pile. Standard and Xverse have
 * no such stage — `claim-staker-rewards` pays out on the spot — and no such
 * getter, which is why every read here is probed for rather than assumed.
 *
 * Two piles are deliberately NOT counted as owed to stakers:
 *
 *   withdrawal liability   already left the balance into an sBTC withdrawal.
 *                          In flight, or stuck — see failed-distributions.ts
 *   earned fees            the operator's cut, not a staker's money
 *
 * Counting stakers is the expensive half. Nothing enumerates a Clarity map, so
 * the only list of who staked with whom is the transaction history: every
 * successful `stake` / `stake-update` on pox-5, whose result names both. That
 * is one page per fifty transactions, then a couple of calls per staker. Pass
 * `--skip-stakers` for the amounts alone, which need only a handful of calls.
 */

import { Cl, ClarityType, type ClarityValue } from '@stacks/transactions';
import { SPACING_MS } from './node.js';
import {
  callReadOnly,
  contractFunctions,
  contractPrints,
  contractSource,
  fetchJson,
  readDataVar,
  sleep,
} from './read-only.js';

export const POX5 = 'SP000000000000000000002Q6VF78.pox-5';
export const SBTC_TOKEN = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';

/** STX-only staking is `none`; a bond period would be `(some index)`. */
const STX_ONLY = Cl.none();

const STAKE_FUNCTIONS = new Set(['stake', 'stake-update']);

function uintOrNull(cv: ClarityValue | null): bigint | null {
  return cv?.type === ClarityType.UInt ? BigInt(cv.value) : null;
}

/** The cycles pox-5 could have rewards for: its first, through the current one. */
export async function rewardCycles(): Promise<number[] | null> {
  const first = uintOrNull(await readDataVar(POX5, 'first-pox-5-reward-cycle'));
  await sleep(SPACING_MS);
  const current = uintOrNull(await callReadOnly(POX5, 'current-pox-reward-cycle'));
  if (first === null || current === null) return null;

  const cycles: number[] = [];
  for (let cycle = Number(first); cycle <= Number(current); cycle += 1) {
    cycles.push(cycle);
  }
  return cycles;
}

/**
 * Whether any sBTC bond exists at all.
 *
 * Everything here reads the STX-only side (`bond-index: none`). Bond periods
 * are keyed by index and would each need their own read, so rather than
 * quietly reporting a subset, this asks whether there is a subset to miss.
 * Zero means the STX-only reads are the whole picture.
 */
export async function totalSbtcStaked(): Promise<bigint | null> {
  return uintOrNull(await readDataVar(POX5, 'total-sbtc-staked'));
}

/** What pox-5 still owes one pool, settled and unsettled, across the cycles. */
export async function fetchOwedByPox5(
  signer: string,
  cycles: number[],
): Promise<bigint | null> {
  let total = 0n;
  for (const cycle of cycles) {
    await sleep(SPACING_MS);
    const earned = uintOrNull(
      await callReadOnly(POX5, 'get-earned', [
        Cl.address(signer),
        Cl.uint(cycle),
        STX_ONLY,
      ]),
    );
    // A pool pox-5 will not answer for is not a pool owed zero.
    if (earned === null) return null;
    total += earned;
  }
  return total;
}

/**
 * How much sBTC a principal holds. Null when it could not be read.
 *
 * SIP-010's `get-balance` answers `(response uint uint)`, not a bare uint, so
 * the ok has to come off first — reading it as a uint fails, and a failed
 * read here would print a pool holding fifteen million sats as unreadable.
 */
export async function sbtcBalance(principal: string): Promise<bigint | null> {
  const cv = await callReadOnly(SBTC_TOKEN, 'get-balance', [
    Cl.address(principal),
  ]);
  if (cv?.type !== ClarityType.ResponseOk) return null;
  return uintOrNull(cv.value);
}

/**
 * What a pool turned out to be, which is four states and not two.
 *
 *   holds        it keeps its own books — `get-unclaimed-staker-rewards` and
 *                friends answer, and the numbers below come straight from them
 *   pox5-direct  it holds stakers' sBTC but keeps no books at all. Native
 *                Pool: `claim-rewards` pulls the cycle in, then each staker
 *                pulls their own share out with `claim-staker-rewards`, which
 *                reads what they are owed from pox-5 and takes no fee. So the
 *                pile is the contract's plain sBTC balance, what each person
 *                is owed lives in pox-5, and who has claimed exists only as
 *                print events
 *   keeps-none   read fine, and genuinely holds nothing for anybody — the
 *                invite-only bond managers, Juice Pool
 *   unreadable   we could not read it at all
 *
 * The middle two look identical through a boolean, and conflating them is how
 * Native Pool's fifteen million sats got printed as a design choice. Anything
 * unreadable makes the totals unknown rather than lower.
 */
export type PoolKind = 'holds' | 'pox5-direct' | 'keeps-none' | 'unreadable';

export type PoolHoldings = {
  pool: string;
  kind: PoolKind;
  /** Pulled from pox-5, not yet attributed to any staker. */
  unattributedSats: bigint;
  /** Settled to individual stakers, not yet paid out. Capped Fee only. */
  pendingSats: bigint;
  /** Already handed to sBTC as a withdrawal: in flight, or refused and stuck. */
  inFlightSats: bigint;
  /** The operator's cut. Not a staker's money; reported so it is not confused. */
  feesSats: bigint;
  /** What pox-5 has not handed over yet; null when it could not be read. */
  owedByPox5Sats: bigint | null;
};

/** Everything one pool holds, asking only for the getters it actually has. */
export async function fetchPoolHoldings(
  pool: string,
  cycles: number[],
): Promise<PoolHoldings> {
  const zero = {
    pool,
    unattributedSats: 0n,
    pendingSats: 0n,
    inFlightSats: 0n,
    feesSats: 0n,
  };

  const functions = await contractFunctions(pool);
  // Not "keeps nothing" — we do not know what it keeps. Under a rate limit
  // this is the common failure, and it must not read as an answer.
  if (!functions) return { ...zero, kind: 'unreadable', owedByPox5Sats: null };

  const owedByPox5Sats = await fetchOwedByPox5(pool, cycles);
  const getters = functions.readOnly;

  if (!getters.has('get-unclaimed-staker-rewards')) {
    // No books, but a way for a staker to pull their share out: it is holding
    // their money, and its whole sBTC balance is that pile. No fee is taken
    // here, so nothing in the balance is the operator's.
    if (functions.public.has('claim-staker-rewards')) {
      await sleep(SPACING_MS);
      const balance = await sbtcBalance(pool);
      return balance === null
        ? { ...zero, kind: 'unreadable', owedByPox5Sats }
        : {
            ...zero,
            kind: 'pox5-direct',
            unattributedSats: balance,
            owedByPox5Sats,
          };
    }
    // Read fine, and genuinely has nothing for anybody: a different design,
    // not an empty pile.
    return { ...zero, kind: 'keeps-none', owedByPox5Sats };
  }

  const ask = async (fn: string): Promise<bigint | null> => {
    if (!getters.has(fn)) return 0n;
    await sleep(SPACING_MS);
    return uintOrNull(await callReadOnly(pool, fn));
  };

  const unattributed = await ask('get-unclaimed-staker-rewards');
  const pending = await ask('get-total-pending-payouts');
  const inFlight = await ask('get-withdrawal-liability');
  const fees = await ask('get-earned-fees');
  // A getter the contract has but would not answer is the same problem one
  // step down: report the pool as unread rather than as holding less.
  if (
    unattributed === null ||
    pending === null ||
    inFlight === null ||
    fees === null
  ) {
    return { ...zero, kind: 'unreadable', owedByPox5Sats };
  }

  return {
    pool,
    kind: 'holds',
    unattributedSats: unattributed,
    pendingSats: pending,
    inFlightSats: inFlight,
    feesSats: fees,
    owedByPox5Sats,
  };
}

/**
 * Everyone who has ever staked, and every pool they have staked with.
 *
 * A staker who moved pools is still owed by the old one for the cycles they
 * were there, so this keeps every signer they have been with rather than only
 * the current one.
 *
 * The transaction list is the only index there is: `staker-info` is a Clarity
 * map, and a map cannot be enumerated from outside. Newest-first, fifty at a
 * time, all the way back.
 *
 * INCOMPLETE BY ITSELF, and knowingly so. This reads each transaction's
 * result, which only names a staker when pox-5 was what the person called.
 * Somebody who joined through a wrapper — `native-pool-v1 delegate` calls
 * pox-5 `stake` inside the same transaction — leaves the wrapper's result
 * behind instead, and does not appear here at all. Their pox-5 print event
 * does name them, but pox-5's event log cannot be paged back far enough to
 * find it. So gated pools are enumerated from their own membership roll
 * instead (`fetchMembers`), and the caller merges the two.
 */
export async function enumerateStakers(opts: {
  onProgress?: (seen: number, total: number, stakers: number) => void;
} = {}): Promise<Map<string, Set<string>> | null> {
  const stakers = new Map<string, Set<string>>();
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    await sleep(SPACING_MS);
    const page = await fetchJson<{
      total: number;
      results: {
        tx: {
          tx_status: string;
          tx_result?: { repr?: string };
          contract_call?: { contract_id: string; function_name: string };
        };
      }[];
    }>(
      `/extended/v2/addresses/${POX5}/transactions?limit=50&offset=${offset}`,
    );
    // A page we could not read is stakers we would not count, and a count
    // short by an unknown amount is worse than no count.
    if (!page) return null;

    total = page.total;
    for (const { tx } of page.results) {
      const call = tx.contract_call;
      if (
        tx.tx_status !== 'success' ||
        call?.contract_id !== POX5 ||
        !STAKE_FUNCTIONS.has(call.function_name)
      ) {
        continue;
      }
      // Both entry points answer with a tuple naming the staker and the
      // signer they ended up with — cheaper and surer than re-reading args.
      const repr = tx.tx_result?.repr ?? '';
      const staker = /\(staker '([0-9A-Z]+)\)/.exec(repr)?.[1];
      const signer = /\(signer '([0-9A-Z]+\.[a-z0-9-]+)\)/.exec(repr)?.[1];
      if (!staker || !signer) continue;
      const pools = stakers.get(staker) ?? new Set<string>();
      pools.add(signer);
      stakers.set(staker, pools);
    }

    offset += 50;
    opts.onProgress?.(Math.min(offset, total), total, stakers.size);
  }

  return stakers;
}

/** One staker's claims out of a pox5-direct pool, added up. */
export type Claim = {
  staker: string;
  claimedSats: bigint;
  /** The cycles they have claimed for, so a missing one is visible. */
  cycles: number[];
};

/**
 * One `claim-staker-rewards` print, read off the log.
 *
 * The event is the only record, so this is the parser standing between a
 * `repr` string and a claim of fact about somebody's money. Anything that is
 * not unambiguously the right shape comes back null rather than half-read.
 */
export function parseClaimEvent(
  repr: string,
): { staker: string; earnedSats: bigint; cycle: number } | null {
  if (!/\(action "claim-staker-rewards"\)/.test(repr)) return null;
  const staker = /\(staker '([0-9A-Z]+)\)/.exec(repr)?.[1];
  const earned = /\(earned u(\d+)\)/.exec(repr)?.[1];
  const cycle = /\(reward-cycle u(\d+)\)/.exec(repr)?.[1];
  if (!staker || !earned || !cycle) return null;
  return { staker, earnedSats: BigInt(earned), cycle: Number(cycle) };
}

/**
 * Who has claimed from a pox5-direct pool, and how much.
 *
 * Native Pool keeps no ledger of this — `claim-staker-rewards` transfers the
 * sBTC and prints, and that print is the only record there is. So the answer
 * to "who has claimed" is not a contract read at all; it is the contract's
 * own event log, paged through.
 *
 * Null when the log could not be fully read. A partial claim list would say
 * somebody has not claimed when they have, which is the wrong way round for
 * a report anybody might act on.
 */
export async function fetchClaims(pool: string): Promise<Claim[] | null> {
  const prints = await contractPrints(pool, SPACING_MS);
  if (prints === null) return null;

  const byStaker = new Map<string, Claim>();
  for (const repr of prints) {
    const parsed = parseClaimEvent(repr);
    if (!parsed) continue;

    const claim = byStaker.get(parsed.staker) ?? {
      staker: parsed.staker,
      claimedSats: 0n,
      cycles: [],
    };
    claim.claimedSats += parsed.earnedSats;
    // One claim per staker per cycle, but a re-org replay would double it;
    // keeping the cycle list distinct makes that visible rather than silent.
    if (!claim.cycles.includes(parsed.cycle)) claim.cycles.push(parsed.cycle);
    byStaker.set(parsed.staker, claim);
  }

  return [...byStaker.values()].sort((a, b) =>
    b.claimedSats > a.claimedSats ? 1 : b.claimedSats < a.claimedSats ? -1 : 0,
  );
}

/**
 * The contract that decides who is allowed into a gated pool.
 *
 * A pox5-direct manager admits nobody on its own — `validate-stake!` defers to
 * somewhere else, and Native Pool's does it in one line:
 *
 *   (asserts! (contract-call? .native-pool-v1 is-delegating staker …) …)
 *
 * That reference is the membership roll, and reading it out of the deployed
 * source beats hardcoding an address: whoever deploys a pool of this shape has
 * to name their gate in exactly this way for pox-5 to accept a staker at all.
 *
 * Relative (`.name`) means the same deployer, which is the only form that can
 * appear — a `contract-call?` to another principal is written out in full and
 * would be matched by the second pattern.
 */
export async function fetchMembershipContract(
  pool: string,
): Promise<string | null> {
  const source = await contractSource(pool);
  if (!source) return null;
  const relative = /\(contract-call\?\s+\.([a-zA-Z0-9-]+)\s+is-delegating/.exec(
    source,
  );
  if (relative) return `${pool.split('.')[0]}.${relative[1]}`;
  const absolute =
    /\(contract-call\?\s+'([0-9A-Z]+\.[a-zA-Z0-9-]+)\s+is-delegating/.exec(source);
  return absolute ? absolute[1] : null;
}

/** One `delegate` / `delegate-update` / `undelegate` print, read off the log. */
export function parseMembershipEvent(
  repr: string,
): { user: string; joined: boolean } | null {
  const action = /\(action "(delegate|delegate-update|undelegate)"\)/.exec(repr);
  const user = /\(user '([0-9A-Z]+)\)/.exec(repr)?.[1];
  if (!action || !user) return null;
  return { user, joined: action[1] !== 'undelegate' };
}

/**
 * Who has ever been in a gated pool, and who still is.
 *
 * `ever` is the one that matters for rewards: leaving does not forfeit what a
 * cycle already earned you, so somebody who undelegated last week can still
 * have sats waiting. `current` is reported alongside so the two are not
 * confused.
 */
export async function fetchMembers(
  membership: string,
): Promise<{ ever: string[]; current: string[] } | null> {
  const prints = await contractPrints(membership, SPACING_MS);
  if (prints === null) return null;

  const ever = new Set<string>();
  const current = new Set<string>();
  // The log comes back newest-first; membership is a running state, so it has
  // to be replayed the way it happened.
  for (const repr of [...prints].reverse()) {
    const parsed = parseMembershipEvent(repr);
    if (!parsed) continue;
    ever.add(parsed.user);
    if (parsed.joined) current.add(parsed.user);
    else current.delete(parsed.user);
  }
  return { ever: [...ever], current: [...current] };
}

/**
 * What pox-5 says one staker is still owed by one signer, across the cycles.
 *
 * This is the pox5-direct source. `claim-staker-rewards` on such a pool reads
 * exactly this and transfers it, so a non-zero answer is money the person can
 * take right now — and, since only they can call it (`tx-sender`), money
 * nobody else can take for them.
 */
export async function fetchOwedByPox5ToStaker(
  signer: string,
  staker: string,
  cycles: number[],
): Promise<bigint> {
  let total = 0n;
  for (const cycle of cycles) {
    await sleep(SPACING_MS);
    total +=
      uintOrNull(
        await callReadOnly(POX5, 'get-earned-staker-rewards', [
          Cl.address(signer),
          Cl.uint(cycle),
          STX_ONLY,
          Cl.address(staker),
        ]),
      ) ?? 0n;
  }
  return total;
}

export type StakerBalance = {
  staker: string;
  /** Their share still pooled in a manager, across pools and cycles. */
  unsettledSats: bigint;
  /** Settled to them but not paid out. Capped Fee pools only. */
  pendingSats: bigint;
};

/**
 * What one staker is still owed, across every pool they have been with.
 *
 * `get-earned-staker-rewards` returns `{earned, fees}` where `earned` is
 * already net of the pool's cut, so it is what would actually reach them.
 */
export async function fetchStakerBalance(
  staker: string,
  pools: Iterable<string>,
  cycles: number[],
  getters: Map<string, Set<string>>,
  kinds: Map<string, PoolKind> = new Map(),
): Promise<StakerBalance> {
  let unsettledSats = 0n;
  let pendingSats = 0n;

  for (const pool of pools) {
    // A pox5-direct pool keeps no per-staker books of its own, so asking it
    // would answer nothing and read as "owed nothing". pox-5 has the number.
    if (kinds.get(pool) === 'pox5-direct') {
      unsettledSats += await fetchOwedByPox5ToStaker(pool, staker, cycles);
      continue;
    }

    const has = getters.get(pool);
    if (!has?.has('get-earned-staker-rewards')) continue;

    for (const cycle of cycles) {
      await sleep(SPACING_MS);
      const cv = await callReadOnly(pool, 'get-earned-staker-rewards', [
        Cl.address(staker),
        Cl.uint(cycle),
        STX_ONLY,
      ]);
      if (cv?.type !== ClarityType.Tuple) continue;
      unsettledSats += uintOrNull(cv.value['earned'] ?? null) ?? 0n;
    }

    if (has.has('get-pending-payout')) {
      await sleep(SPACING_MS);
      pendingSats +=
        uintOrNull(
          await callReadOnly(pool, 'get-pending-payout', [Cl.address(staker)]),
        ) ?? 0n;
    }
  }

  return { staker, unsettledSats, pendingSats };
}

export type Report = {
  cycles: number[];
  pools: PoolHoldings[];
  /** Null when the staker walk was skipped or could not be completed. */
  stakers: {
    total: number;
    withUnclaimed: StakerBalance[];
  } | null;
  /** Non-zero means bond-period rewards exist that these reads do not cover. */
  sbtcStakedSats: bigint | null;
};

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

/**
 * The piles, added up across every pool.
 *
 * Null beats a low number. A total is only given when every pool that feeds
 * it was actually read — one unreadable contract makes the sum a guess, and a
 * guess about somebody's rewards is worth less than an admission.
 */
export function totals(report: Report): {
  inPox5Sats: bigint | null;
  unattributedSats: bigint | null;
  pendingSats: bigint | null;
  inFlightSats: bigint | null;
  feesSats: bigint | null;
  owedToStakersSats: bigint | null;
  /** Pools we could not read at all, so a reader can see the size of the gap. */
  unreadable: string[];
} {
  const unreadable = report.pools
    .filter((p) => p.kind === 'unreadable')
    .map((p) => p.pool);
  const complete = unreadable.length === 0;
  const owed = report.pools.map((p) => p.owedByPox5Sats);
  const only = (value: bigint) => (complete ? value : null);

  return {
    inPox5Sats: owed.some((v) => v === null) ? null : sum(owed as bigint[]),
    unattributedSats: only(sum(report.pools.map((p) => p.unattributedSats))),
    pendingSats: only(sum(report.pools.map((p) => p.pendingSats))),
    inFlightSats: only(sum(report.pools.map((p) => p.inFlightSats))),
    feesSats: only(sum(report.pools.map((p) => p.feesSats))),
    owedToStakersSats: only(
      sum(report.pools.map((p) => p.unattributedSats + p.pendingSats)),
    ),
    unreadable,
  };
}

/** Adds a pool's membership roll into an enumeration, in place. */
export function mergeMembers(
  stakers: Map<string, Set<string>>,
  pool: string,
  members: Iterable<string>,
): number {
  let added = 0;
  for (const member of members) {
    const pools = stakers.get(member);
    if (!pools) {
      stakers.set(member, new Set([pool]));
      added += 1;
    } else if (!pools.has(pool)) {
      pools.add(pool);
    }
  }
  return added;
}
