/**
 * What the published rate means to somebody holding STX.
 *
 * `rateSatsPer1000Stx` is per *payout*, not per year and not per cycle: pox-5
 * pays every 1050 burn blocks, which is half a reward cycle and about a week,
 * so a cycle carries two of them. Every number below follows from that one
 * fact, and it is the fact most easily got wrong — a rate read as a cycle's is
 * half the truth, and read as a year's is fifty-two times too small.
 *
 * Pure, and imported by the phone app as well as the page: an app and a site
 * disagreeing about what somebody earns is not a rounding difference, it is
 * two answers to the same question.
 */

/** Payouts a year: 1050 burn blocks is about a week, and there are 52. */
export const PAYOUT_PERIODS_PER_YEAR = 52;

/** Burn blocks between payouts, when the data file does not say. */
export const FALLBACK_DISTRIBUTION_BLOCKS = 1050;

export const BITCOIN_BLOCK_MINUTES = 10;

const USTX_PER_1000_STX = 1_000_000_000n;

/**
 * The rate compounded over a year, as a percentage.
 *
 * Compounded rather than multiplied because the sBTC a payout pays is not
 * restaked — but the comparison a reader is making is against a rate quoted
 * the way every other rate is quoted, and that is an APY. Null when there is
 * no STX price to measure it against; a yield needs both halves.
 */
export function apyPercent(opts: {
  rateSatsPer1000Stx: bigint;
  stxPriceSats: bigint;
}): number | null {
  if (opts.stxPriceSats <= 0n) return null;

  const periodReturn =
    Number(opts.rateSatsPer1000Stx) / Number(1000n * opts.stxPriceSats);
  if (!Number.isFinite(periodReturn) || periodReturn < 0) return null;

  return (Math.pow(1 + periodReturn, PAYOUT_PERIODS_PER_YEAR) - 1) * 100;
}

/**
 * What a position of this size earns at this rate, per payout, in sats.
 *
 * Integer throughout: the rate is a whole number of sats per 1000 STX and the
 * amount a whole number of microSTX, so the product is exact and the division
 * is the only rounding. It rounds down, which is the direction that cannot
 * promise somebody more than they will get.
 */
export function rewardSatsPerPayout(opts: {
  amountUstx: bigint;
  rateSatsPer1000Stx: bigint;
}): bigint {
  if (opts.amountUstx <= 0n || opts.rateSatsPer1000Stx <= 0n) return 0n;
  return (opts.amountUstx * opts.rateSatsPer1000Stx) / USTX_PER_1000_STX;
}

/** The same, over a year — no compounding, because sats are not restaked. */
export function rewardSatsPerYear(opts: {
  amountUstx: bigint;
  rateSatsPer1000Stx: bigint;
}): bigint {
  return rewardSatsPerPayout(opts) * BigInt(PAYOUT_PERIODS_PER_YEAR);
}

/** How far through the payout window the chain is, 0 to 1. */
export function payoutProgress(opts: {
  blocksIntoCycle: number | null;
  distributionBlocks: number;
}): number | null {
  const total = opts.distributionBlocks || FALLBACK_DISTRIBUTION_BLOCKS;
  if (opts.blocksIntoCycle === null || total <= 0) return null;
  return Math.min(1, Math.max(0, opts.blocksIntoCycle / total));
}

/** Roughly how long until the next payout, in hours. */
export function hoursUntilPayout(blocksLeft: number): number {
  return Math.max(1, Math.round((blocksLeft * BITCOIN_BLOCK_MINUTES) / 60));
}

/** When the next payout falls due, from a burn height count. */
export function payoutDueAt(opts: {
  now: number;
  blocksLeft: number;
}): Date {
  return new Date(
    opts.now + opts.blocksLeft * BITCOIN_BLOCK_MINUTES * 60 * 1000,
  );
}
