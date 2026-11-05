/**
 * What a pool pays, before and after its fee.
 *
 * pox-5 pays every STX-only share in a cycle the same: one
 * `rewards-per-token-for-cycle` figure, accumulated across the cycle's two
 * payouts. So what a pool earned in a cycle is not something it has to tell
 * anybody — it is what pox-5 counted for it that cycle times that one figure,
 * and both are already on file: the amount in the signer's history, the
 * figure in `stx-only-history.json`. No chain call, and the same arithmetic
 * `reward-distribution.ts` checks a pool's members against.
 *
 * Two things this cannot see, and says so rather than guessing:
 *
 *  - **A bond's share.** STX registered for a BTC bond is not paid the
 *    STX-only rate: it is paid out of the bond share (`bondShareSats` in the
 *    calculations), which no file here breaks down per signer. So earnings
 *    count the STX-only part of a pool's stake alone — its total less the
 *    bond part the history has on file (src/lib/bond-stake.ts) — and a pool
 *    with bond stake is marked as earning more than this sees.
 *  - **The fee in an earlier cycle.** Only today's fee is on file. Earned is
 *    therefore given before the fee, which is a fact, and the yield after the
 *    fee is given at today's fee, which is what a reader choosing now needs.
 *
 * Pure, so the phone app can use it as it is.
 */

import { bondParts, bondUstxOf, sumParts } from './bond-stake';
import { apyPercent } from './rate-view';
import type { BondStake, Signer, StxOnlyDistribution } from './types';

/** pox-5's PRECISION: rewards-per-token are fixed point with 18 decimals. */
const PRECISION = 10n ** 18n;
const FULL_BIPS = 10_000n;

/** One reward cycle's rewards-per-token, and whether both payouts are in. */
export interface CycleRate {
  cycle: number;
  /** Cumulative across the cycle's payouts so far. */
  rewardsPerUstx: bigint;
  /** True once the second payout is on file; false for a cycle half paid. */
  complete: boolean;
}

/**
 * Each cycle's rewards-per-token, from the distribution history.
 *
 * The cumulative figure of a cycle's last payout on file, not the sum of the
 * per-payout rates: those are rounded to whole sats per 1000 STX and one of
 * them can be missing, while the cumulative figure is pox-5's own and covers
 * both.
 */
export function cycleRates(
  distributions: readonly StxOnlyDistribution[],
): Map<number, CycleRate> {
  const rates = new Map<number, CycleRate>();
  const ordered = [...distributions].sort(
    (a, b) => a.burnHeight - b.burnHeight,
  );
  for (const entry of ordered) {
    let value: bigint;
    try {
      value = BigInt(entry.cumulativeRewardsPerUstx);
    } catch {
      continue;
    }
    rates.set(entry.cycle, {
      cycle: entry.cycle,
      rewardsPerUstx: value,
      complete: !entry.firstOfCycle,
    });
  }
  return rates;
}

/** Sats earned by `ustx` at a cycle's rewards-per-token. Rounds down. */
export function earnedSats(ustx: bigint, rewardsPerUstx: bigint): bigint {
  if (ustx <= 0n || rewardsPerUstx <= 0n) return 0n;
  return (ustx * rewardsPerUstx) / PRECISION;
}

/** What is left of `sats` after a fee in basis points. Rounds down. */
export function afterFee(sats: bigint, feeBips: number): bigint {
  const fee = BigInt(Math.max(0, Math.min(10_000, Math.round(feeBips))));
  return (sats * (FULL_BIPS - fee)) / FULL_BIPS;
}

/** The old test by contract name: right for the bond-only contracts alone. */
function namedLikeBond(contractId: string): boolean {
  return contractId.includes('signer-manager-bond-');
}

/**
 * A pool with stake registered for a BTC bond, and so earning more than the
 * STX-only figures here see.
 *
 * Decided by the bond split for the cycle when there is one. Without it — a
 * file from before the split existed, or a pool whose split did not add up —
 * the old test by contract name stands in, which catches the bond-only
 * contracts and nothing else.
 */
export function isBondPool(
  signer: Pick<Signer, 'contractId'>,
  stake?: BondStake,
): boolean {
  const known = bondUstxOf(stake, [signer.contractId]);
  if (known !== null) return known > 0n;
  return namedLikeBond(signer.contractId);
}

/**
 * The yield a staker keeps, as a percentage a year, at today's rate and fee.
 *
 * Null when it cannot be said: no rate or price, or a fee this contract does
 * not hold (it is taken somewhere this page cannot read).
 */
export function netApyPercent(opts: {
  rateSatsPer1000Stx: bigint | null;
  stxPriceSats: bigint | null;
  feeBips: number | null;
}): number | null {
  if (
    opts.rateSatsPer1000Stx === null ||
    opts.stxPriceSats === null ||
    opts.feeBips === null
  ) {
    return null;
  }
  return apyPercent({
    rateSatsPer1000Stx: afterFee(opts.rateSatsPer1000Stx, opts.feeBips),
    stxPriceSats: opts.stxPriceSats,
  });
}

/** One cycle of a pool's earnings. */
export interface PoolCycleEarning {
  cycle: number;
  /** The STX-only part of the stake, which is what earned `sats`. */
  ustx: bigint;
  /** The part registered for bonds, which `sats` leaves out. */
  bondUstx: bigint;
  /** Before the pool's fee. */
  sats: bigint;
  /** The cycle has had only its first payout so far. */
  partial: boolean;
}

/**
 * What a contract earned in each cycle it held stake and pox-5 paid for.
 *
 * Newest first. A cycle with no rate on file is left out rather than shown as
 * zero — before pox-5's first payout there was nothing to earn here, and a
 * cycle not yet paid has earned nothing *yet*, which the page says another
 * way.
 */
export function poolEarnings(opts: {
  contractId: string;
  cycles: readonly {
    cycle: number;
    ustx: Record<string, string | null>;
    bondUstx?: Record<string, Record<string, string>>;
  }[];
  rates: Map<number, CycleRate>;
}): PoolCycleEarning[] {
  const earnings: PoolCycleEarning[] = [];
  for (const cycle of opts.cycles) {
    const rate = opts.rates.get(cycle.cycle);
    const raw = cycle.ustx[opts.contractId];
    if (!rate || raw == null) continue;
    let total: bigint;
    try {
      total = BigInt(raw);
    } catch {
      continue;
    }
    if (total <= 0n) continue;
    // The bond part from the checked split, or — for a cycle without one —
    // all of it for a bond-only contract and none for anything else.
    const bond = cycle.bondUstx
      ? sumParts(bondParts(cycle.bondUstx, [opts.contractId]))
      : namedLikeBond(opts.contractId)
        ? total
        : 0n;
    const bondUstx = bond > total ? total : bond;
    const ustx = total - bondUstx;
    if (ustx <= 0n) continue;
    earnings.push({
      cycle: cycle.cycle,
      ustx,
      bondUstx,
      sats: earnedSats(ustx, rate.rewardsPerUstx),
      partial: !rate.complete,
    });
  }
  return earnings.sort((a, b) => b.cycle - a.cycle);
}
