/**
 * The two pieces of the STX-only rate that are worth testing on their own.
 *
 * `generate-stx-only-calculations.ts` reads the chain and writes a file; these
 * are the decisions it makes in between, which are arithmetic and have edges:
 * which of a reward cycle's two payouts the last one was, and how much of the
 * published rate this cycle has earned the right to set.
 */

const USTX_PER_1000_STX = 1_000_000_000n;
/** pox-5's PRECISION: rewards-per-token are fixed point with 18 decimals. */
const PRECISION = 10n ** 18n;

/** A rewards-per-token figure, as sats per 1000 STX. */
export function rateFromRewardsPerUstx(rewardsPerUstx: bigint): bigint {
  return (rewardsPerUstx * USTX_PER_1000_STX) / PRECISION;
}

/**
 * Which payout the computation at `burnHeight` was.
 *
 * pox-5 distributes twice per reward cycle — its distribution cycle is
 * `(/ pox-reward-cycle-length u2)` — so a reward cycle holds an even payout and
 * an odd one, and `rewards-per-token-for-cycle` accumulates across both.
 * Whether the last one was the first of its cycle decides whether that
 * cumulative figure is one payout or two.
 */
export function payoutPosition(opts: {
  burnHeight: number;
  firstBurnchainBlockHeight: number;
  distributionBlocks: number;
}): { cycle: number; isFirstOfCycle: boolean } {
  const since = opts.burnHeight - opts.firstBurnchainBlockHeight;
  const index = Math.floor(since / opts.distributionBlocks);
  return {
    cycle: Math.floor(since / (opts.distributionBlocks * 2)),
    isFirstOfCycle: index % 2 === 0,
  };
}

/**
 * What the last payout actually paid, as sats per 1000 STX, or null.
 *
 * Null means "not known", never "nothing": before the first
 * `calculate-rewards`, or when the previous file cannot supply the first half
 * of a cycle that the cumulative figure is carrying.
 */
export function realisedPayoutRate(opts: {
  /** pox-5's `rewards-per-token-for-cycle` for `cycle`, cumulative. */
  cumulativeRewardsPerUstx: bigint | null;
  /** The cycle that figure belongs to. */
  cycle: number | null;
  isFirstOfCycle: boolean;
  /** The height of the computation it describes. */
  lastRewardBurnHeight: number | null;
  /** What this script wrote last time, or null. */
  previous: {
    lastRewardBurnHeight?: number | null;
    lastPayoutCycle?: number | null;
    lastPayoutRateSatsPer1000Stx?: string | null;
    cumulativeRewardsPerUstx?: string | null;
  } | null;
}): bigint | null {
  const previous = opts.previous;
  const isNumberString = (value: unknown): value is string =>
    typeof value === 'string' && /^\d+$/.test(value);

  // Nothing has been computed since the last run, so nothing about the last
  // payout has changed either. Reading it back rather than deriving it again
  // is what lets the derivation below need only one previous file.
  if (
    previous &&
    opts.lastRewardBurnHeight !== null &&
    previous.lastRewardBurnHeight === opts.lastRewardBurnHeight &&
    isNumberString(previous.lastPayoutRateSatsPer1000Stx)
  ) {
    return BigInt(previous.lastPayoutRateSatsPer1000Stx);
  }

  if (opts.cumulativeRewardsPerUstx === null) return null;

  // First payout of the cycle: the cumulative figure is that payout.
  if (opts.isFirstOfCycle) {
    return rateFromRewardsPerUstx(opts.cumulativeRewardsPerUstx);
  }

  // Second payout: subtract the first, which is what the file written between
  // the two payouts holds.
  if (
    previous &&
    opts.cycle !== null &&
    previous.lastPayoutCycle === opts.cycle &&
    isNumberString(previous.cumulativeRewardsPerUstx) &&
    opts.cumulativeRewardsPerUstx >= BigInt(previous.cumulativeRewardsPerUstx)
  ) {
    return rateFromRewardsPerUstx(
      opts.cumulativeRewardsPerUstx - BigInt(previous.cumulativeRewardsPerUstx),
    );
  }

  return null;
}

/**
 * The rate to publish.
 *
 * This cycle's own accrual counts for as much of it as the cycle has run, and
 * the last payout — settled, not estimated — covers the rest. An hour after a
 * payout, five blocks of sBTC deposits multiplied by 1050 is not an estimate
 * anybody should act on; by the end of the cycle it is the only figure that
 * describes the cycle at all, and by then it is all of the answer.
 *
 * With one of the two missing, the other stands alone. With both missing there
 * is no rate, and the page says so rather than showing a zero.
 */
export function publishedRate(opts: {
  projectedRateSatsPer1000Stx: bigint | null;
  lastPayoutRateSatsPer1000Stx: bigint | null;
  blocksIntoCycle: number | null;
  distributionBlocks: number;
}): bigint | null {
  if (opts.projectedRateSatsPer1000Stx === null) {
    return opts.lastPayoutRateSatsPer1000Stx;
  }
  if (opts.lastPayoutRateSatsPer1000Stx === null || opts.blocksIntoCycle === null) {
    return opts.projectedRateSatsPer1000Stx;
  }

  const run = BigInt(
    Math.max(0, Math.min(opts.blocksIntoCycle, opts.distributionBlocks)),
  );
  const left = BigInt(opts.distributionBlocks) - run;
  return (
    (opts.projectedRateSatsPer1000Stx * run +
      opts.lastPayoutRateSatsPer1000Stx * left) /
    BigInt(opts.distributionBlocks)
  );
}
