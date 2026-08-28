import {
  apyPercent,
  hoursUntilPayout,
  payoutDueAt,
  payoutProgress,
  rewardSatsPerPayout,
  rewardSatsPerYear,
} from '@guide/lib/rate-view';
import type { StxOnlyCalculations } from '@guide/lib/types';

/**
 * The headline figure, and everything that qualifies it.
 *
 * Read once, here, so that no screen works it out for itself. Every field is
 * allowed to be null — the refresh publishes a file with holes in it when the
 * chain would not answer, and a rate this app could not read has to say so
 * rather than show a zero, which is a claim about somebody's rewards.
 */

export type Rate = {
  /** Sats per 1000 STX, per payout. A payout is about a week. */
  satsPer1000Stx: bigint | null;
  /** The same as a decimal per single STX, for the line under the figure. */
  satsPerStx: number | null;
  /** Compounded over a year, when there is an STX price to measure against. */
  apy: number | null;
  /** The cycle the figure belongs to. */
  cycle: number;
  /** What the last completed payout actually paid — a fact, not a projection. */
  lastPayoutSatsPer1000Stx: bigint | null;
  lastPayoutCycle: number | null;
  /** This payout window's own accrual, extrapolated. Noisy early on. */
  projectedSatsPer1000Stx: bigint | null;
  /** How far through the current payout window the chain is, 0 to 1. */
  progress: number | null;
  hoursToPayout: number | null;
  dueAt: Date | null;
  totalStakedUstx: bigint | null;
  stxPriceSats: bigint | null;
  generatedAt: string;
};

function asBigint(value: string | null | undefined): bigint | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function readRate(calculations: StxOnlyCalculations, now = Date.now()): Rate {
  const satsPer1000Stx = asBigint(calculations.rateSatsPer1000Stx);
  const stxPriceSats = asBigint(calculations.stxPriceSats);
  const blocksLeft = calculations.blocksLeftInCycle;

  return {
    satsPer1000Stx,
    satsPerStx: satsPer1000Stx === null ? null : Number(satsPer1000Stx) / 1000,
    apy:
      satsPer1000Stx !== null && stxPriceSats !== null
        ? apyPercent({ rateSatsPer1000Stx: satsPer1000Stx, stxPriceSats })
        : null,
    cycle: calculations.cycle,
    lastPayoutSatsPer1000Stx: asBigint(calculations.lastPayoutRateSatsPer1000Stx),
    lastPayoutCycle: calculations.lastPayoutCycle ?? null,
    projectedSatsPer1000Stx: asBigint(calculations.projectedRateSatsPer1000Stx),
    progress: payoutProgress({
      blocksIntoCycle: calculations.blocksIntoCycle,
      distributionBlocks: calculations.distributionBlocks,
    }),
    hoursToPayout: blocksLeft === null ? null : hoursUntilPayout(blocksLeft),
    dueAt: blocksLeft === null ? null : payoutDueAt({ now, blocksLeft }),
    totalStakedUstx: asBigint(calculations.totalStakedUstx),
    stxPriceSats,
    generatedAt: calculations.generatedAt,
  };
}

/**
 * What a position of this size is on course to earn.
 *
 * Null rather than zero when either half is missing: a staker with a position
 * and no readable rate has unknown rewards, not none.
 */
export function earningsFor(
  amountUstx: bigint | null,
  rate: Rate,
): { perPayout: bigint; perYear: bigint } | null {
  if (amountUstx === null || rate.satsPer1000Stx === null) return null;
  const opts = { amountUstx, rateSatsPer1000Stx: rate.satsPer1000Stx };
  return {
    perPayout: rewardSatsPerPayout(opts),
    perYear: rewardSatsPerYear(opts),
  };
}
