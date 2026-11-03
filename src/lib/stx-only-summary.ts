/**
 * The STX-only rewards estimate, as the four numbers the home page's tiles
 * show: the rate, what it comes to in a year, how far the distribution cycle
 * has got, and when it pays.
 *
 * The full estimate page works all of this out inside its own component; the
 * tiles need the same figures without the rest of it, and two copies of
 * "blocks into the cycle over blocks in it" would drift.
 */

import {
  apyPercent,
  FALLBACK_DISTRIBUTION_BLOCKS,
  payoutDueAt,
} from './rate-view';
import type { StxOnlyCalculations } from './types';

export interface StxOnlySummary {
  rateSatsPer1000Stx: bigint;
  /** Null without a price to turn sats into a share of the STX staked. */
  apy: number | null;
  progressPercent: number;
  blocksIntoCycle: number;
  cycleBlocks: number;
  /** When the payout is due, by the block count at the last refresh. */
  dueAt: Date | null;
  /**
   * The due time has passed. The estimate was made at the last refresh and
   * the chain has moved on since; "in about 3 days" from a week ago is
   * worse than saying nothing.
   */
  overdue: boolean;
}

const big = (value: string | null | undefined): bigint | null => {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

export function stxOnlySummary(
  calculations: StxOnlyCalculations,
  now: number = Date.now(),
): StxOnlySummary | null {
  const rate = big(calculations.rateSatsPer1000Stx);
  const into = calculations.blocksIntoCycle;
  const left = calculations.blocksLeftInCycle;
  if (rate === null || into === null || left === null) return null;

  const price = big(calculations.stxPriceSats);
  const cycleBlocks =
    calculations.distributionBlocks || FALLBACK_DISTRIBUTION_BLOCKS;
  const base = Date.parse(calculations.generatedAt);
  const dueAt = Number.isNaN(base)
    ? null
    : payoutDueAt({ now: base, blocksLeft: left });

  return {
    rateSatsPer1000Stx: rate,
    apy:
      price === null
        ? null
        : apyPercent({ rateSatsPer1000Stx: rate, stxPriceSats: price }),
    progressPercent: Math.max(0, Math.min(100, (into / cycleBlocks) * 100)),
    blocksIntoCycle: into,
    cycleBlocks,
    dueAt,
    overdue: dueAt !== null && dueAt.getTime() < now,
  };
}
