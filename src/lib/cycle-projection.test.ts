import { describe, expect, it } from 'vitest';
import { projectCycle } from './cycle-projection';
import type { NetworkCycle, StxOnlyCalculations } from './types';

const calc = {
  payoutCycle: 147,
  projectedCycleSats: '274000000',
  projectedBondSats: '104000000',
  projectedFoundationSats: '48000000',
  stxOnlyStakedUstx: '490000000000000',
  stxPriceSats: '442',
} as unknown as StxOnlyCalculations;

const cycle = (payouts: NetworkCycle['payouts'] = []): NetworkCycle => ({
  cycle: 147,
  stakedUstx: '514000000000000',
  bondUstx: '24000000000000',
  signers: 36,
  pools: 31,
  rewardsPerUstx: null,
  stxOnlyRewardsSats: payouts.length ? '300000000' : null,
  bondRewardsSats: payouts.length ? '100000000' : null,
  foundationRewardsSats: payouts.length ? '50000000' : null,
  payouts,
});

describe('projectCycle', () => {
  it('doubles the projected payout for a cycle not yet paid', () => {
    const p = projectCycle(cycle(), calc)!;
    expect(p.stxOnly).toBe(548_000_000n);
    expect(p.bond).toBe(208_000_000n);
    expect(p.foundation).toBe(96_000_000n);
    expect(p.total).toBe(852_000_000n);
    // 274M sats over 490M STX: 559 sats per 1000 STX a payout.
    expect(p.rateSatsPer1000Stx).toBe(1118n);
    expect(p.apyPercent).toBeGreaterThan(6);
  });

  it('adds one projected payout to the one already paid', () => {
    const p = projectCycle(
      cycle([
        {
          burnHeight: 975799,
          firstOfCycle: true,
          rateSatsPer1000Stx: '600',
          stxPriceSats: '442',
          btcPriceUsd: null,
        },
      ]),
      calc,
    )!;
    expect(p.stxOnly).toBe(574_000_000n);
    expect(p.bond).toBe(204_000_000n);
    expect(p.rateSatsPer1000Stx).toBe(1159n);
  });

  it('is null for any other cycle', () => {
    expect(projectCycle({ ...cycle(), cycle: 146 }, calc)).toBeNull();
  });
});
