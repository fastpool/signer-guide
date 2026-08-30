import { readRate, earningsFor } from './rate';
import type { StxOnlyCalculations } from '@guide/lib/types';

/*
 * The numbers are mainnet's, from the file this app ships with: cycle 142,
 * a published rate of 408 sats per 1000 STX with the last completed payout at
 * 407 and this window's own accrual extrapolating to 421.
 *
 * The unit is the thing worth pinning down. 408 is per *payout* — 1050 burn
 * blocks, about a week — and a test that let it drift into meaning a cycle or
 * a year would let every figure in the app drift with it.
 */
const CALCULATIONS: StxOnlyCalculations = {
  cycle: 142,
  distributionBlocks: 1050,
  blocksIntoCycle: 102,
  blocksLeftInCycle: 948,
  currentBurnHeight: 964351,
  lastRewardBurnHeight: 964249,
  nextRewardBurnHeight: 965299,
  totalStakedUstx: '421543815427560',
  bondStakedUstx: '0',
  stxOnlyStakedUstx: '421543815427560',
  stxPriceSats: '318',
  sbtcBalanceSats: '118651391',
  accruedRewardsSats: '20283692',
  bondShareSats: '0',
  foundationShareSats: '3042553',
  stxOnlySoFarSats: '17241139',
  projectedCycleSats: '177482313',
  projectedRateSatsPer1000Stx: '421',
  lastPayoutCycle: 141,
  lastPayoutRateSatsPer1000Stx: '407',
  cumulativeRewardsPerUstx: '758607677183',
  rateSatsPer1000Stx: '408',
  generatedAt: '2026-08-27T20:36:35.914Z',
};

describe('readRate', () => {
  it('reads the published rate and what it is per', () => {
    const rate = readRate(CALCULATIONS);
    expect(rate.satsPer1000Stx).toBe(408n);
    expect(rate.satsPerStx).toBeCloseTo(0.408, 6);
    expect(rate.cycle).toBe(142);
  });

  it('keeps the fact and the projection apart from the blend', () => {
    const rate = readRate(CALCULATIONS);
    expect(rate.lastPayoutSatsPer1000Stx).toBe(407n);
    expect(rate.lastPayoutCycle).toBe(141);
    expect(rate.projectedSatsPer1000Stx).toBe(421n);
  });

  it('compounds over 50 distribution cycles, not 26 or one', () => {
    // Fifty, not the fifty-two this expected when the app called a
    // distribution cycle a week: 1050 burn blocks is 7.3 days, and pox-5
    // annualises by dividing by exactly 50. At 52 this read 6.89%.
    const rate = readRate(CALCULATIONS);
    // (1 + 408/318000)^50 - 1
    expect(rate.apy).toBeCloseTo(6.62, 1);
  });

  it('says how far through the distribution cycle the chain is', () => {
    const rate = readRate(CALCULATIONS);
    expect(rate.progress).toBeCloseTo(102 / 1050, 6);
    // 948 blocks at ten minutes each.
    expect(rate.hoursToPayout).toBe(158);
  });

  it('reports a figure it could not read as unknown rather than zero', () => {
    const rate = readRate({
      ...CALCULATIONS,
      rateSatsPer1000Stx: null,
      stxPriceSats: null,
    });
    expect(rate.satsPer1000Stx).toBeNull();
    expect(rate.satsPerStx).toBeNull();
    expect(rate.apy).toBeNull();
  });

  it('refuses a rate that is not a plain count', () => {
    expect(readRate({ ...CALCULATIONS, rateSatsPer1000Stx: '4.08' }).satsPer1000Stx)
      .toBeNull();
  });
});

describe('earningsFor', () => {
  const rate = readRate(CALCULATIONS);

  it('works out what a position earns per payout and per year', () => {
    // 100,000 STX is a hundred lots of 1000, so a hundred times the rate.
    const earnings = earningsFor(100_000_000_000n, rate);
    expect(earnings?.perPayout).toBe(40_800n);
    expect(earnings?.perYear).toBe(40_800n * 50n);
  });

  it('rounds down, so it never promises more than will arrive', () => {
    // 1 STX at 408 per 1000 is 0.408 sats.
    expect(earningsFor(1_000_000n, rate)?.perPayout).toBe(0n);
    // 2.5 STX is 1.02 sats.
    expect(earningsFor(2_500_000n, rate)?.perPayout).toBe(1n);
  });

  it('is unknown, not zero, when the rate could not be read', () => {
    const blind = readRate({ ...CALCULATIONS, rateSatsPer1000Stx: null });
    expect(earningsFor(100_000_000_000n, blind)).toBeNull();
  });

  it('is unknown when there is no position to measure', () => {
    expect(earningsFor(null, rate)).toBeNull();
  });
});
