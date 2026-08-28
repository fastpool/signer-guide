import { satsLabel } from '@guide/lib/amounts';
import { earningsFor, readRate } from '../data/rate';
import { groupDigits } from '../format';
import { BUNDLED } from '../data/snapshot';

/**
 * What the bundled data says right now, rather than what it said the day the
 * test was written.
 *
 * `src/data/stx-only-calculations.json` is regenerated hourly by a scheduled
 * job and committed, so a test asserting `408` is a test that goes red on its
 * own at some point in the next hour — which it did. These derive the expected
 * figures from the same file the screen reads, so what is actually being
 * checked is that the screen shows the published rate, which is the claim
 * worth making.
 */
export const BUNDLED_RATE = readRate(BUNDLED.stxOnlyCalculations);

/** The rate as the rate card prints it. */
export function expectedRateText(): string {
  return groupDigits(BUNDLED_RATE.satsPer1000Stx!);
}

/** What a position of this size earns, as the screens print it. */
export function expectedEarnings(amountUstx: bigint): {
  perPayout: string;
  perYear: string;
} {
  const earnings = earningsFor(amountUstx, BUNDLED_RATE)!;
  return {
    perPayout: satsLabel(earnings.perPayout, 'en'),
    perYear: satsLabel(earnings.perYear, 'en'),
  };
}
