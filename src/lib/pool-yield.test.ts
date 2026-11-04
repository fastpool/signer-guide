import { describe, expect, it } from 'vitest';
import {
  afterFee,
  cycleRates,
  earnedSats,
  isBondPool,
  netApyPercent,
  poolEarnings,
} from './pool-yield';
import type { StxOnlyDistribution } from './types';

const dist = (
  cycle: number,
  firstOfCycle: boolean,
  cumulative: string,
  burnHeight: number,
): StxOnlyDistribution => ({
  cycle,
  distributionIndex: cycle * 2 + (firstOfCycle ? 0 : 1),
  firstOfCycle,
  burnHeight,
  cumulativeRewardsPerUstx: cumulative,
  rateSatsPer1000Stx: null,
});

describe('cycleRates', () => {
  it("takes each cycle's last cumulative figure, not a sum of rates", () => {
    const rates = cycleRates([
      dist(145, true, '787380836277', 971599),
      dist(145, false, '1617724895229', 972649),
      dist(146, true, '734472027352', 973699),
    ]);
    expect(rates.get(145)).toEqual({
      cycle: 145,
      rewardsPerUstx: 1617724895229n,
      complete: true,
    });
    expect(rates.get(146)?.complete).toBe(false);
  });
});

describe('earnedSats', () => {
  it("matches what a pool earned in a cycle, from pox-5's fixed point", () => {
    // Fast Pool v2 held 71,936,454 STX in cycle 145.
    expect(earnedSats(71_936_454_000_000n, 1617724895229n)).toBe(116373392n);
  });

  it('is zero for nothing staked', () => {
    expect(earnedSats(0n, 1617724895229n)).toBe(0n);
  });
});

describe('afterFee', () => {
  it('keeps what the fee leaves, rounding down', () => {
    expect(afterFee(10_000n, 450)).toBe(9_550n);
    expect(afterFee(10_000n, 9999)).toBe(1n);
    expect(afterFee(10_000n, 0)).toBe(10_000n);
  });
});

describe('netApyPercent', () => {
  it('is the published APY with the fee taken off the rate', () => {
    const gross = netApyPercent({
      rateSatsPer1000Stx: 724n,
      stxPriceSats: 427n,
      feeBips: 0,
    });
    const net = netApyPercent({
      rateSatsPer1000Stx: 724n,
      stxPriceSats: 427n,
      feeBips: 500,
    });
    expect(gross).not.toBeNull();
    expect(net!).toBeLessThan(gross!);
    expect(net!).toBeGreaterThan(gross! * 0.94);
  });

  it('cannot be said for a fee held somewhere else', () => {
    expect(
      netApyPercent({
        rateSatsPer1000Stx: 724n,
        stxPriceSats: 427n,
        feeBips: null,
      }),
    ).toBeNull();
  });
});

describe('poolEarnings', () => {
  const rates = cycleRates([
    dist(144, true, '646291401690', 969499),
    dist(144, false, '1440258939597', 970549),
    dist(145, true, '787380836277', 971599),
  ]);

  it('lists cycles the contract held stake in and pox-5 paid for, newest first', () => {
    const earnings = poolEarnings({
      contractId: 'SP1.pool',
      cycles: [
        { cycle: 143, ustx: { 'SP1.pool': '1000000000' } },
        { cycle: 144, ustx: { 'SP1.pool': '1000000000', 'SP1.other': '5' } },
        { cycle: 145, ustx: { 'SP1.pool': '1000000000' } },
        { cycle: 146, ustx: { 'SP1.pool': '1000000000' } },
      ],
      rates,
    });
    expect(earnings.map((e) => [e.cycle, e.partial])).toEqual([
      [145, true],
      [144, false],
    ]);
    // 1000 STX at 1,440 sats per 1000 STX.
    expect(earnings[1].sats).toBe(1440n);
  });

  it('leaves out a cycle with nothing staked or an amount not read', () => {
    expect(
      poolEarnings({
        contractId: 'SP1.pool',
        cycles: [
          { cycle: 144, ustx: { 'SP1.pool': '0' } },
          { cycle: 145, ustx: { 'SP1.pool': null } },
        ],
        rates,
      }),
    ).toEqual([]);
  });
});

describe('isBondPool', () => {
  it('falls back to the name when there is no split', () => {
    expect(isBondPool({ contractId: 'SP4.signer-manager-bond-1-v2' })).toBe(
      true,
    );
    expect(isBondPool({ contractId: 'SP4.signer-manager' })).toBe(false);
  });

  it('goes by the split when there is one', () => {
    const stake = {
      ustx: { 'SP8.xverse-signer-manager-3': { '2': '294122400045' } },
      unknown: ['SP9.unread'],
    };
    expect(
      isBondPool({ contractId: 'SP8.xverse-signer-manager-3' }, stake),
    ).toBe(true);
    // Checked and holding none, whatever the name says.
    expect(
      isBondPool({ contractId: 'SP4.signer-manager-bond-9-v2' }, stake),
    ).toBe(false);
    // Not known: the name stands in.
    expect(isBondPool({ contractId: 'SP9.unread' }, stake)).toBe(false);
  });
});

describe('poolEarnings and bond stake', () => {
  const rates = new Map([
    [146, { cycle: 146, rewardsPerUstx: 10n ** 12n, complete: true }],
  ]);

  it('pays only the STX-only part the STX-only rate', () => {
    const [entry] = poolEarnings({
      contractId: 'SP8.x3',
      cycles: [
        {
          cycle: 146,
          ustx: { 'SP8.x3': '3000000' },
          bondUstx: { 'SP8.x3': { '1': '500000', '2': '500000' } },
        },
      ],
      rates,
    });
    expect(entry.ustx).toBe(2_000_000n);
    expect(entry.bondUstx).toBe(1_000_000n);
    expect(entry.sats).toBe(2n);
  });

  it('leaves out a cycle that is all bond stake', () => {
    expect(
      poolEarnings({
        contractId: 'SP2.hashkeycloud-v1',
        cycles: [
          {
            cycle: 146,
            ustx: { 'SP2.hashkeycloud-v1': '620474000000' },
            bondUstx: { 'SP2.hashkeycloud-v1': { '1': '620474000000' } },
          },
        ],
        rates,
      }),
    ).toEqual([]);
  });

  it('treats a bond-only contract as bond stake when no split is on file', () => {
    expect(
      poolEarnings({
        contractId: 'SP4.signer-manager-bond-1-v2',
        cycles: [{ cycle: 146, ustx: { 'SP4.signer-manager-bond-1-v2': '5' } }],
        rates,
      }),
    ).toEqual([]);
  });
});
