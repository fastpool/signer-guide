import { describe, expect, it } from 'vitest';
import { byCycle, isStxOnlyHistory } from './stx-only-history';
import type { StxOnlyDistribution } from './types';

/*
 * The numbers are mainnet's first two distributions: cycle 141 paid 350 sats
 * per 1000 STX at burn height 963,199 and 407 at 964,249. Their cumulative
 * figures are what pox-5 answered for cycle 141 at each of those moments.
 */
const FIRST: StxOnlyDistribution = {
  cycle: 141,
  distributionIndex: 282,
  firstOfCycle: true,
  burnHeight: 963_199,
  cumulativeRewardsPerUstx: '350915540939',
  rateSatsPer1000Stx: '350',
};
const SECOND: StxOnlyDistribution = {
  cycle: 141,
  distributionIndex: 283,
  firstOfCycle: false,
  burnHeight: 964_249,
  cumulativeRewardsPerUstx: '758607677183',
  rateSatsPer1000Stx: '407',
};
const NEXT_CYCLE: StxOnlyDistribution = {
  cycle: 142,
  distributionIndex: 284,
  firstOfCycle: true,
  burnHeight: 965_299,
  cumulativeRewardsPerUstx: '400000000000',
  rateSatsPer1000Stx: '400',
};

describe('byCycle', () => {
  it('puts the newest cycle first and its payouts in order', () => {
    const grouped = byCycle([SECOND, NEXT_CYCLE, FIRST]);

    expect(grouped.map((c) => c.cycle)).toEqual([142, 141]);
    expect(grouped[1].payouts.map((p) => p.burnHeight)).toEqual([
      963_199, 964_249,
    ]);
  });

  it('totals a finished cycle from the chain, not by adding the halves', () => {
    // 350 + 407 is 757, and cycle 141 paid 758: each half loses up to a sat
    // to rounding on its own, and the cumulative figure loses one for the two.
    const [cycle] = byCycle([FIRST, SECOND]);

    expect(cycle.complete).toBe(true);
    expect(cycle.totalSatsPer1000Stx).toBe(758n);
  });

  it('will not total a cycle that has only paid once', () => {
    const [cycle] = byCycle([NEXT_CYCLE]);

    expect(cycle.complete).toBe(false);
    // Not 400: the cycle has not finished paying, and a total that says it has
    // is a number somebody might compare against a finished one.
    expect(cycle.totalSatsPer1000Stx).toBeNull();
  });
});

describe('isStxOnlyHistory', () => {
  it('accepts a file with a rate nobody could work out', () => {
    expect(
      isStxOnlyHistory({
        generatedAt: '2026-08-27T08:46:49.682Z',
        distributions: [{ ...SECOND, rateSatsPer1000Stx: null }],
      }),
    ).toBe(true);
  });

  it('refuses an amount the page would do BigInt arithmetic on and crash', () => {
    expect(
      isStxOnlyHistory({
        generatedAt: '2026-08-27T08:46:49.682Z',
        distributions: [{ ...FIRST, cumulativeRewardsPerUstx: '3.5e11' }],
      }),
    ).toBe(false);
    expect(
      isStxOnlyHistory({
        generatedAt: '2026-08-27T08:46:49.682Z',
        distributions: [{ ...FIRST, rateSatsPer1000Stx: '350.5' }],
      }),
    ).toBe(false);
  });

  it('refuses something that is not the file at all', () => {
    expect(isStxOnlyHistory(null)).toBe(false);
    expect(isStxOnlyHistory({ distributions: 'none' })).toBe(false);
  });
});
