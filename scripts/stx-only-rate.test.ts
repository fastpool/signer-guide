import { describe, expect, it } from 'vitest';
import {
  payoutPosition,
  recordDistribution,
  publishedRate,
  rateFromRewardsPerUstx,
  realisedPayoutRate,
} from './stx-only-rate.js';

/**
 * The numbers here are mainnet's, from the first `calculate-rewards` ever run:
 * transaction 0xfeedce2f… at burn height 963,201, which computed cycle 141 up
 * to height 963,199 and set `accrued-rewards-per-ustx` to 350,915,540,939.
 */
const FIRST_BURN = 666_050;
const DISTRIBUTION_BLOCKS = 1_050;
const CYCLE_141_RPU = 350_915_540_939n;

describe('rateFromRewardsPerUstx', () => {
  it('reads pox-5 fixed point as sats per 1000 STX', () => {
    // 350,915,540,939 / 1e18 per uSTX, times 1e9 uSTX, is 350.9 sats.
    expect(rateFromRewardsPerUstx(CYCLE_141_RPU)).toBe(350n);
  });

  it('is zero for a cycle nothing has been computed for', () => {
    expect(rateFromRewardsPerUstx(0n)).toBe(0n);
  });
});

describe('payoutPosition', () => {
  it('places the first mainnet payout in cycle 141, first of two', () => {
    expect(
      payoutPosition({
        burnHeight: 963_199,
        firstBurnchainBlockHeight: FIRST_BURN,
        distributionBlocks: DISTRIBUTION_BLOCKS,
      }),
    ).toEqual({ cycle: 141, index: 282, isFirstOfCycle: true });
  });

  it('places the payout one distribution later in the same cycle', () => {
    expect(
      payoutPosition({
        burnHeight: 963_199 + DISTRIBUTION_BLOCKS,
        firstBurnchainBlockHeight: FIRST_BURN,
        distributionBlocks: DISTRIBUTION_BLOCKS,
      }),
    ).toEqual({ cycle: 141, index: 283, isFirstOfCycle: false });
  });

  it('rolls into the next cycle two distributions later', () => {
    expect(
      payoutPosition({
        burnHeight: 963_199 + DISTRIBUTION_BLOCKS * 2,
        firstBurnchainBlockHeight: FIRST_BURN,
        distributionBlocks: DISTRIBUTION_BLOCKS,
      }),
    ).toEqual({ cycle: 142, index: 284, isFirstOfCycle: true });
  });
});

describe('realisedPayoutRate', () => {
  const first = {
    cumulativeRewardsPerUstx: CYCLE_141_RPU,
    cycle: 141,
    isFirstOfCycle: true,
    lastRewardBurnHeight: 963_199,
  };

  it('takes the cumulative figure whole for a cycle first payout', () => {
    expect(realisedPayoutRate({ ...first, previous: null })).toBe(350n);
  });

  it('subtracts the first payout from the second one in a cycle', () => {
    const rate = realisedPayoutRate({
      cumulativeRewardsPerUstx: CYCLE_141_RPU * 2n,
      cycle: 141,
      isFirstOfCycle: false,
      lastRewardBurnHeight: 963_199 + DISTRIBUTION_BLOCKS,
      previous: {
        lastRewardBurnHeight: 963_199,
        lastPayoutCycle: 141,
        lastPayoutRateSatsPer1000Stx: '350',
        cumulativeRewardsPerUstx: CYCLE_141_RPU.toString(),
      },
    });
    expect(rate).toBe(350n);
  });

  it('does not know the second payout without the file between the two', () => {
    expect(
      realisedPayoutRate({
        cumulativeRewardsPerUstx: CYCLE_141_RPU * 2n,
        cycle: 141,
        isFirstOfCycle: false,
        lastRewardBurnHeight: 963_199 + DISTRIBUTION_BLOCKS,
        previous: null,
      }),
    ).toBeNull();
  });

  it('refuses a previous file left over from another cycle', () => {
    expect(
      realisedPayoutRate({
        cumulativeRewardsPerUstx: CYCLE_141_RPU,
        cycle: 142,
        isFirstOfCycle: false,
        lastRewardBurnHeight: 963_199 + DISTRIBUTION_BLOCKS * 3,
        previous: {
          lastRewardBurnHeight: 963_199,
          lastPayoutCycle: 141,
          lastPayoutRateSatsPer1000Stx: '350',
          cumulativeRewardsPerUstx: CYCLE_141_RPU.toString(),
        },
      }),
    ).toBeNull();
  });

  it('keeps what it published while no new payout has been computed', () => {
    // The cumulative figure would say 350 on its own; the point is that a run
    // between two payouts does not recompute, it reads back.
    const rate = realisedPayoutRate({
      ...first,
      cumulativeRewardsPerUstx: CYCLE_141_RPU,
      previous: {
        lastRewardBurnHeight: 963_199,
        lastPayoutCycle: 141,
        lastPayoutRateSatsPer1000Stx: '349',
        cumulativeRewardsPerUstx: CYCLE_141_RPU.toString(),
      },
    });
    expect(rate).toBe(349n);
  });

  it('knows nothing before the first payout', () => {
    expect(
      realisedPayoutRate({
        cumulativeRewardsPerUstx: null,
        cycle: null,
        isFirstOfCycle: false,
        lastRewardBurnHeight: null,
        previous: null,
      }),
    ).toBeNull();
  });

  it('ignores a previous file whose numbers are not numbers', () => {
    expect(
      realisedPayoutRate({
        ...first,
        isFirstOfCycle: false,
        previous: {
          lastRewardBurnHeight: 963_199,
          lastPayoutCycle: 141,
          lastPayoutRateSatsPer1000Stx: 'nonsense',
          cumulativeRewardsPerUstx: null,
        },
      }),
    ).toBeNull();
  });
});

describe('publishedRate', () => {
  const base = {
    blocksIntoCycle: 5,
    distributionBlocks: DISTRIBUTION_BLOCKS,
  };

  it('leans on the last payout in the first blocks of a cycle', () => {
    // Five blocks of deposits extrapolate to 100; the payout that has actually
    // been settled paid 350, and five blocks in it is nearly all of the answer.
    expect(
      publishedRate({
        ...base,
        projectedRateSatsPer1000Stx: 100n,
        lastPayoutRateSatsPer1000Stx: 350n,
      }),
    ).toBe(348n);
  });

  it('is this cycle alone once the cycle has run out', () => {
    expect(
      publishedRate({
        ...base,
        blocksIntoCycle: DISTRIBUTION_BLOCKS,
        projectedRateSatsPer1000Stx: 100n,
        lastPayoutRateSatsPer1000Stx: 350n,
      }),
    ).toBe(100n);
  });

  it('meets in the middle halfway through', () => {
    expect(
      publishedRate({
        ...base,
        blocksIntoCycle: DISTRIBUTION_BLOCKS / 2,
        projectedRateSatsPer1000Stx: 100n,
        lastPayoutRateSatsPer1000Stx: 350n,
      }),
    ).toBe(225n);
  });

  it('does not let a long overdue computation weigh past the whole cycle', () => {
    expect(
      publishedRate({
        ...base,
        blocksIntoCycle: DISTRIBUTION_BLOCKS * 3,
        projectedRateSatsPer1000Stx: 100n,
        lastPayoutRateSatsPer1000Stx: 350n,
      }),
    ).toBe(100n);
  });

  it('stands on the projection alone before any payout', () => {
    expect(
      publishedRate({
        ...base,
        projectedRateSatsPer1000Stx: 100n,
        lastPayoutRateSatsPer1000Stx: null,
      }),
    ).toBe(100n);
  });

  it('stands on the last payout alone when the chain would not answer', () => {
    expect(
      publishedRate({
        ...base,
        blocksIntoCycle: null,
        projectedRateSatsPer1000Stx: null,
        lastPayoutRateSatsPer1000Stx: 350n,
      }),
    ).toBe(350n);
  });

  it('has no rate when it has neither', () => {
    expect(
      publishedRate({
        ...base,
        projectedRateSatsPer1000Stx: null,
        lastPayoutRateSatsPer1000Stx: null,
      }),
    ).toBeNull();
  });
});

/*
 * The history file is the only record of what a single distribution paid: the
 * chain keeps a cycle's two payouts added together, and the first of a pair is
 * visible only to a run that happens between them. So the rule that matters is
 * that a recorded payout is never rewritten by a later run that knows less.
 */
describe('recordDistribution', () => {
  const first = {
    cycle: 141,
    distributionIndex: 282,
    firstOfCycle: true,
    burnHeight: 963_199,
    cumulativeRewardsPerUstx: '350915540939',
    rateSatsPer1000Stx: '350',
  };
  const second = {
    cycle: 141,
    distributionIndex: 283,
    firstOfCycle: false,
    burnHeight: 964_249,
    cumulativeRewardsPerUstx: '758607677183',
    rateSatsPer1000Stx: '407',
  };

  it('adds a payout it has not seen, oldest first', () => {
    expect(recordDistribution([second], first)).toEqual([first, second]);
  });

  it('leaves a payout it already has alone', () => {
    const already = recordDistribution([first, second], {
      ...second,
      rateSatsPer1000Stx: '999',
    });
    expect(already).toEqual([first, second]);
  });

  it('fills in a rate that was not worked out at the time', () => {
    const unknown = { ...second, rateSatsPer1000Stx: null };
    expect(recordDistribution([first, unknown], second)).toEqual([
      first,
      second,
    ]);
  });

  it('does not blank a rate it knows because a later run does not', () => {
    const forgotten = { ...second, rateSatsPer1000Stx: null };
    expect(recordDistribution([first, second], forgotten)).toEqual([
      first,
      second,
    ]);
  });

  it('has nothing to add when there was no payout to record', () => {
    expect(recordDistribution([first], null)).toEqual([first]);
  });
});
