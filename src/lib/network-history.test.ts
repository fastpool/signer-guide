import { describe, expect, it } from 'vitest';
import {
  buildNetworkHistory,
  cycleApyPercent,
  cycleComplete,
  cycleRateSatsPer1000Stx,
  isNetworkHistory,
} from './network-history';
import type { StxOnlyDistribution } from './types';

const payout = (
  cycle: number,
  firstOfCycle: boolean,
  cumulative: string,
  burnHeight: number,
  stxPriceSats: string | null = '400',
): StxOnlyDistribution => ({
  cycle,
  distributionIndex: cycle * 2 + (firstOfCycle ? 0 : 1),
  firstOfCycle,
  burnHeight,
  cumulativeRewardsPerUstx: cumulative,
  // Deliberately wrong, as cycle 145's once was: the builder must not use it.
  rateSatsPer1000Stx: '0',
  stxPriceSats,
  btcPriceUsd: 80_000,
});

const groups = [
  {
    id: 'stacking-dao',
    kind: 'stake',
    members: [{ contractId: 'SP4.native' }, { contractId: 'SP4.native-v2' }],
  },
  {
    id: 'fast-pool',
    kind: 'operator',
    members: [{ contractId: 'SP1.fast' }, { contractId: 'SP2.max' }],
  },
];

const history = buildNetworkHistory({
  generatedAt: '2026-11-03T00:00:00.000Z',
  groups,
  keyHistories: [
    {
      signerKey: '0xdao',
      cycles: [
        {
          cycle: 145,
          ustx: { 'SP4.native': '1000000000', 'SP4.native-v2': '1000000000' },
        },
      ],
    },
    {
      signerKey: '0xfast',
      cycles: [
        { cycle: 145, ustx: { 'SP1.fast': '1000000000' } },
        { cycle: 146, ustx: { 'SP1.fast': '1000000000' } },
      ],
    },
    {
      signerKey: '0xmax',
      cycles: [{ cycle: 145, ustx: { 'SP2.max': '1000000000' } }],
    },
    {
      signerKey: '0xbond',
      cycles: [
        { cycle: 145, ustx: { 'SP5.signer-manager-bond-1': '1000000000' } },
      ],
    },
    {
      signerKey: '0xempty',
      cycles: [{ cycle: 145, ustx: { 'SP6.empty': '0', 'SP6.unread': null } }],
    },
  ],
  distributions: [
    payout(145, true, '787380836277', 971599),
    payout(145, false, '1617724895229', 972649),
    payout(146, true, '734472027352', 973699, null),
  ],
});

describe('buildNetworkHistory', () => {
  const [c146, c145] = history.cycles;

  it('is newest first, one line per cycle anybody staked in', () => {
    expect(history.cycles.map((c) => c.cycle)).toEqual([146, 145]);
  });

  it('adds up every contract, bond signers included', () => {
    expect(c145.stakedUstx).toBe('5000000000');
    expect(c145.bondUstx).toBe('1000000000');
  });

  it('counts signer keys with stake, and Stacking DAO as one pool', () => {
    expect(c145.signers).toBe(4);
    // Stacking DAO once, Fast Pool's two separately, and the bond pool.
    expect(c145.pools).toBe(4);
  });

  it('works out each payout from the cumulative figures, not the stored rate', () => {
    expect(c145.payouts.map((p) => p.rateSatsPer1000Stx)).toEqual([
      '787',
      '830',
    ]);
    expect(cycleRateSatsPer1000Stx(c145)).toBe(1617n);
  });

  it('pays STX-only stake only: the bond share is not on file', () => {
    // 4,000 STX at 1617.72 sats per 1000 STX.
    expect(c145.stxOnlyRewardsSats).toBe('6470');
  });

  it('knows a cycle still being paid', () => {
    expect(cycleComplete(c145)).toBe(true);
    expect(cycleComplete(c146)).toBe(false);
  });
});

describe('cycleApyPercent', () => {
  it('averages the payouts that have a price', () => {
    const [c146, c145] = history.cycles;
    expect(cycleApyPercent(c145)).toBeGreaterThan(9);
    expect(cycleApyPercent(c145)).toBeLessThan(12);
    expect(cycleApyPercent(c146)).toBeNull();
  });
});

describe('isNetworkHistory', () => {
  it('accepts what the builder writes and refuses what it does not', () => {
    expect(isNetworkHistory(history)).toBe(true);
    expect(isNetworkHistory({ cycles: [{ cycle: 1 }] })).toBe(false);
    expect(isNetworkHistory(null)).toBe(false);
  });
});
