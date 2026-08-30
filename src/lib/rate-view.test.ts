/**
 * The one number that turns a payout into a year.
 *
 * It was 52, from calling a distribution cycle "about a week" and then
 * annualising the week rather than the cycle. 1050 burn blocks is 7.3 days, so
 * a year holds fifty of them, and the APY on the page was about 4% too high
 * for as long as it said otherwise. Checked here against the block arithmetic
 * rather than written down twice, so the constant has to keep agreeing with
 * where it came from.
 */

import { describe, expect, it } from 'vitest';
import {
  apyPercent,
  BITCOIN_BLOCK_MINUTES,
  DISTRIBUTION_CYCLES_PER_YEAR,
  FALLBACK_DISTRIBUTION_BLOCKS,
  payoutDueAt,
  payoutHappenedAt,
} from './rate-view';

describe('distribution cycles a year', () => {
  it('is what the block times say it is', () => {
    const minutesPerCycle = FALLBACK_DISTRIBUTION_BLOCKS * BITCOIN_BLOCK_MINUTES;
    const cyclesPerYear = (365.25 * 24 * 60) / minutesPerCycle;

    // 50.1, which pox-5 itself rounds to 50 when it annualises its target
    // rate. A year of weeks would be 52, and that is the mistake this guards.
    expect(cyclesPerYear).toBeCloseTo(DISTRIBUTION_CYCLES_PER_YEAR, 0);
    expect(DISTRIBUTION_CYCLES_PER_YEAR).toBe(50);
  });

  it('is what the APY compounds over', () => {
    // A rate of 1% per distribution cycle, priced so the arithmetic is plain.
    const apy = apyPercent({
      rateSatsPer1000Stx: 1_000n,
      stxPriceSats: 100n,
    });
    expect(apy).not.toBeNull();
    expect(apy!).toBeCloseTo((Math.pow(1.01, DISTRIBUTION_CYCLES_PER_YEAR) - 1) * 100, 6);
  });
});

describe('when a payout happened', () => {
  const now = Date.parse('2026-08-28T21:00:00.000Z');

  it('counts back at the same ten minutes a block the countdown counts forward', () => {
    const back = payoutHappenedAt({ now, blocksSince: 231 });
    // 231 blocks is 38.5 hours.
    expect(back.toISOString()).toBe('2026-08-27T06:30:00.000Z');

    const forward = payoutDueAt({ now, blocksLeft: 231 });
    expect(forward.getTime() - now).toBe(now - back.getTime());
  });

  it('is now when the last payout was this block', () => {
    expect(payoutHappenedAt({ now, blocksSince: 0 }).getTime()).toBe(now);
  });
});
