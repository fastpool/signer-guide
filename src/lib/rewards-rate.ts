/**
 * The one conversion between pox-5's rewards-per-token and sats per 1000 STX.
 *
 * A leaf on purpose. The refresh scripts import this, and anything they import
 * has to run under Node — so this file must never reach for React or for the
 * bundled data files, which is what would happen if it lived beside the page's
 * other amount helpers. The generator and the page disagreeing by a sat about
 * what a payout paid would be two answers to the same question.
 */

/** pox-5's PRECISION: rewards-per-token are fixed point with 18 decimals. */
const PRECISION = 10n ** 18n;
const USTX_PER_1000_STX = 1_000_000_000n;

/** A rewards-per-token figure, as sats per 1000 STX. */
export function rateFromRewardsPerUstx(rewardsPerUstx: bigint): bigint {
  return (rewardsPerUstx * USTX_PER_1000_STX) / PRECISION;
}
