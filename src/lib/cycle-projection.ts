/**
 * Where the running cycle is heading: what it has paid so far, plus the
 * payouts still to come at the rate the current one is projected to pay.
 *
 * A reward cycle is paid in two goes. The one in progress is projected by the
 * refresh (stx-only-calculations.json: what has come in, scaled to the whole
 * distribution cycle, then split as pox-5 splits it). A payout not yet begun
 * is assumed to pay the same — the best guess there is, and the one a reader
 * can check, since it is the same figure twice.
 */

import { apyPercent } from './rate-view';
import { cycleRewardSplit } from './network-history';
import type { NetworkCycle, StxOnlyCalculations } from './types';

const USTX_PER_1000_STX = 1_000_000_000n;
const PAYOUTS_PER_CYCLE = 2;

export interface CycleProjection {
  stxOnly: bigint;
  bond: bigint;
  foundation: bigint;
  total: bigint;
  /** STX-only sats per 1000 STX for the whole cycle. */
  rateSatsPer1000Stx: bigint;
  /** As `cycleApyPercent`: each payout's APY, averaged. */
  apyPercent: number | null;
}

const big = (value: string | null | undefined): bigint | null => {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

/** Null unless `cycle` is the one the refresh is projecting a payout for. */
export function projectCycle(
  cycle: NetworkCycle,
  calc: StxOnlyCalculations,
): CycleProjection | null {
  if (calc.payoutCycle !== cycle.cycle) return null;
  const stxOnly = big(calc.projectedCycleSats);
  const bond = big(calc.projectedBondSats);
  const foundation = big(calc.projectedFoundationSats);
  const staked = big(calc.stxOnlyStakedUstx);
  if (stxOnly === null || bond === null || foundation === null) return null;
  if (staked === null || staked <= 0n) return null;

  const remaining = BigInt(
    Math.max(0, PAYOUTS_PER_CYCLE - cycle.payouts.length),
  );
  if (remaining === 0n) return null;

  const paid = cycleRewardSplit(cycle) ?? {
    stxOnly: big(cycle.stxOnlyRewardsSats) ?? 0n,
    bond: 0n,
    foundation: 0n,
    total: big(cycle.stxOnlyRewardsSats) ?? 0n,
  };
  const payoutRate = (stxOnly * USTX_PER_1000_STX) / staked;
  const paidRate = (() => {
    let sum = 0n;
    for (const p of cycle.payouts) sum += big(p.rateSatsPer1000Stx) ?? 0n;
    return sum;
  })();

  const apys: number[] = [];
  for (const p of cycle.payouts) {
    const rate = big(p.rateSatsPer1000Stx);
    const price = big(p.stxPriceSats);
    if (rate === null || price === null) continue;
    const apy = apyPercent({ rateSatsPer1000Stx: rate, stxPriceSats: price });
    if (apy !== null) apys.push(apy);
  }
  const price = big(calc.stxPriceSats);
  const projectedApy =
    price === null
      ? null
      : apyPercent({ rateSatsPer1000Stx: payoutRate, stxPriceSats: price });
  if (projectedApy !== null) {
    for (let i = 0n; i < remaining; i++) apys.push(projectedApy);
  }

  const out = {
    stxOnly: paid.stxOnly + remaining * stxOnly,
    bond: paid.bond + remaining * bond,
    foundation: paid.foundation + remaining * foundation,
  };
  return {
    ...out,
    total: out.stxOnly + out.bond + out.foundation,
    rateSatsPer1000Stx: paidRate + remaining * payoutRate,
    apyPercent: apys.length
      ? apys.reduce((sum, value) => sum + value, 0) / apys.length
      : null,
  };
}
