/**
 * What the published rate means to somebody holding STX.
 *
 * Three words, kept apart here because everything below turns on which is
 * meant, and pox-5's own glossary is the authority:
 *
 *   reward cycle       2100 burn blocks on mainnet — a reward phase and its
 *                      trailing 100-block prepare phase. Also the signer
 *                      cycle. Amounts and history are keyed by this.
 *   distribution cycle 1050 burn blocks, twice as often as a reward cycle.
 *                      The period rewards accrue over, and what `calculate-
 *                      rewards` settles at the end of.
 *   payout             the event at a distribution cycle's boundary.
 *
 * `rateSatsPer1000Stx` is per *distribution cycle*, not per year and not per
 * reward cycle. Every number below follows from that one fact, and it is the
 * fact most easily got wrong — a rate read as a reward cycle's is half the
 * truth, and read as a year's is fifty times too small.
 *
 * Pure, and imported by the phone app as well as the page: an app and a site
 * disagreeing about what somebody earns is not a rounding difference, it is
 * two answers to the same question.
 */

/**
 * Distribution cycles a year.
 *
 * Fifty, not the fifty-two this said when it was thinking in weeks. 1050 burn
 * blocks is 7.3 days rather than 7, so a year holds 365 / 7.29 = 50.1 of them
 * — and pox-5 agrees, dividing its annualised target rate by exactly 50. At 52
 * the APY on the page was overstated by about 4%, which is what calling a
 * distribution cycle "a week" costs when somebody annualises it.
 */
export const DISTRIBUTION_CYCLES_PER_YEAR = 50;

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

  return (Math.pow(1 + periodReturn, DISTRIBUTION_CYCLES_PER_YEAR) - 1) * 100;
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
  return rewardSatsPerPayout(opts) * BigInt(DISTRIBUTION_CYCLES_PER_YEAR);
}

/** How far through the distribution cycle the chain is, 0 to 1. */
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

/**
 * When the last payout happened, from how many blocks ago it was.
 *
 * The mirror of `payoutDueAt`, and it exists for the same reason a date beats
 * a cycle number on the page: pox-5 pays twice in a reward cycle, so "cycle
 * 141" names a fortnight with two payouts in it, and a reader looking at one
 * figure cannot tell which. Ten minutes a block is the same approximation the
 * countdown already makes, and a payout hours out is close enough to say when
 * it was.
 */
export function payoutHappenedAt(opts: {
  now: number;
  blocksSince: number;
}): Date {
  return new Date(
    opts.now - opts.blocksSince * BITCOIN_BLOCK_MINUTES * 60 * 1000,
  );
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
