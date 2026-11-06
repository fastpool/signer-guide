import { describe, expect, it } from 'vitest';
import { activeBondIndexes, bondTargetYield, splitPayout } from './bond-payout';

describe('activeBondIndexes', () => {
  // pox-5 mainnet: first bond period at cycle 141, a period every 2 cycles.
  it('matches the bond periods pox-5 paid', () => {
    expect(activeBondIndexes(141, 141, 2)).toEqual([0]);
    expect(activeBondIndexes(143, 141, 2)).toEqual([0, 1]);
    expect(activeBondIndexes(146, 141, 2)).toEqual([0, 1, 2]);
    expect(activeBondIndexes(147, 141, 2)).toEqual([0, 1, 2, 3]);
  });

  it('drops a bond after six periods', () => {
    expect(activeBondIndexes(152, 141, 2)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(activeBondIndexes(153, 141, 2)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has none before the first period', () => {
    expect(activeBondIndexes(140, 141, 2)).toEqual([]);
  });
});

describe('bondTargetYield', () => {
  it("reproduces bond 1's payout in cycle 143", () => {
    // 230.17 BTC at 3% over fifty payouts: 13,810,222 sats, as printed.
    expect(bondTargetYield(23_017_037_628n, 300n)).toBe(13_810_222n);
  });
});

describe('splitPayout', () => {
  it('pays the bonds, then 15% to the foundation', () => {
    // Cycle 143's first payout, as pox-5 printed it.
    expect(splitPayout(230_327_835n, 13_810_222n, 1500n)).toEqual({
      bond: 13_810_222n,
      foundation: 32_477_641n,
      stxOnly: 184_039_972n,
    });
  });

  it('gives the bonds everything there is when they are owed more', () => {
    expect(splitPayout(100n, 500n, 1500n)).toEqual({
      bond: 100n,
      foundation: 0n,
      stxOnly: 0n,
    });
  });
});
