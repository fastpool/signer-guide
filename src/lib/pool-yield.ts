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
 *  - **A bond's share.** A signer with a BTC bond gets a share of the rewards
 *    on top of the STX-only rate (`bondShareSats` in the calculations). What
 *    it comes to per signer is not in any file here, so a bond pool's figure
 *    is its STX-only part and is marked as such.
 *  - **The fee in an earlier cycle.** Only today's fee is on file. Earned is
 *    therefore given before the fee, which is a fact, and the yield after the
 *    fee is given at today's fee, which is what a reader choosing now needs.
 *
 * Pure, so the phone app can use it as it is.
 */

import { apyPercent } from './rate-view';
import type { Signer, StxOnlyDistribution } from './types';

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

/** A pool whose signer holds a BTC bond, and so earns more than this sees. */
export function isBondPool(signer: Pick<Signer, 'contractId'>): boolean {
  // The same test generate-stx-only-calculations.ts counts bond stake with.
  return signer.contractId.includes('signer-manager-bond-');
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
  ustx: bigint;
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
  cycles: readonly { cycle: number; ustx: Record<string, string | null> }[];
  rates: Map<number, CycleRate>;
}): PoolCycleEarning[] {
  const earnings: PoolCycleEarning[] = [];
  for (const cycle of opts.cycles) {
    const rate = opts.rates.get(cycle.cycle);
    const raw = cycle.ustx[opts.contractId];
    if (!rate || raw == null) continue;
    let ustx: bigint;
    try {
      ustx = BigInt(raw);
    } catch {
      continue;
    }
    if (ustx <= 0n) continue;
    earnings.push({
      cycle: cycle.cycle,
      ustx,
      sats: earnedSats(ustx, rate.rewardsPerUstx),
      partial: !rate.complete,
    });
  }
  return earnings.sort((a, b) => b.cycle - a.cycle);
}
