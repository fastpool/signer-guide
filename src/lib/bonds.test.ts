/**
 * What the bond page is allowed to work out from the file.
 *
 * Two subtractions and a percentage, and each one is a claim about somebody's
 * bitcoin — so the cases worth testing are the ones where the honest answer
 * is "no answer": a total that could not be read, a bond with no ceiling to
 * measure against, and an allowlist that came back short.
 */

import { describe, expect, it } from 'vitest';
import committed from '../data/bonds.json' with { type: 'json' };
import {
  filledPercent,
  isBondsData,
  lastCycle,
  openSats,
  splitByRegistered,
} from './bonds';
import type { BondPeriod, BondsData } from './types';

function period(over: Partial<BondPeriod> = {}): BondPeriod {
  return {
    bondIndex: 1,
    firstRewardCycle: 143,
    unlockCycle: 155,
    startBurnHeight: 966_350,
    started: false,
    setUp: true,
    targetRate: 300,
    stxValueRatio: '310237',
    minUstxRatio: 500,
    allowlistedSats: '25000500000',
    registeredSats: '22000450000',
    allowlistComplete: true,
    stakers: [],
    ...over,
  };
}

describe('what is still open on a bond', () => {
  it('is the ceiling less what has been locked', () => {
    expect(openSats(period())).toBe(3_000_050_000n);
  });

  it('is nothing to say when the locked total could not be read', () => {
    // Not "all of it is open": one half of the subtraction is missing.
    expect(openSats(period({ registeredSats: null }))).toBeNull();
  });

  it('never goes negative on a short allowlist', () => {
    // A bond holding more than the names we recovered is a gap in the file,
    // not a bond that has overflowed its own ceiling.
    expect(
      openSats(
        period({
          allowlistedSats: '100',
          registeredSats: '500',
          allowlistComplete: false,
        }),
      ),
    ).toBe(0n);
  });
});

describe('how full the bar is drawn', () => {
  it('measures what is locked against the ceiling', () => {
    expect(filledPercent(period())).toBe(88);
    expect(
      filledPercent(period({ allowlistedSats: '100', registeredSats: '25' })),
    ).toBe(25);
  });

  it('draws no bar for a bond with no ceiling', () => {
    // A period nobody set up, or an allowlist that could not be recovered. A
    // bar against a ceiling of nothing would show as full.
    expect(filledPercent(period({ allowlistedSats: '0' }))).toBeNull();
    expect(filledPercent(period({ registeredSats: null }))).toBeNull();
  });

  it('stops at full rather than running past the track', () => {
    expect(
      filledPercent(period({ allowlistedSats: '100', registeredSats: '500' })),
    ).toBe(100);
  });
});

describe('the cycles a bond covers', () => {
  it('ends the cycle before the one the STX unlocks in', () => {
    expect(lastCycle(period())).toBe(154);
  });
});

describe('who turned up', () => {
  it('keeps the stakers who locked something apart from those who did not', () => {
    const stakers = [
      { staker: 'SP1', maxSats: '10', registeredSats: '10', amountUstx: '1', isL1Lock: false, signer: 'SP.x' },
      { staker: 'SP2', maxSats: '10', registeredSats: '0', amountUstx: null, isL1Lock: null, signer: null },
    ];
    const split = splitByRegistered(period({ stakers }));
    expect(split.locked.map((s) => s.staker)).toEqual(['SP1']);
    expect(split.invited.map((s) => s.staker)).toEqual(['SP2']);
  });
});

describe('what the page will read', () => {
  it('accepts the committed file', () => {
    expect(isBondsData(committed as BondsData)).toBe(true);
  });

  it('refuses a file whose amounts are not amounts', () => {
    // The page does BigInt arithmetic on these, so a shape that changed under
    // a cached build should read as "nothing on file" rather than throw on
    // the first render.
    const data = committed as unknown as BondsData;
    expect(isBondsData({ ...data, next: { ...data.next, allowlistedSats: 1 } })).toBe(false);
    expect(isBondsData({ ...data, next: undefined })).toBe(false);
    expect(isBondsData({ ...data, generatedAt: 'whenever' })).toBe(false);
    expect(isBondsData(null)).toBe(false);
  });

  it('accepts a file with no current period, which is a real state', () => {
    expect(isBondsData({ ...(committed as BondsData), current: null })).toBe(
      true,
    );
  });
});
