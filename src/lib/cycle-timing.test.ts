import { describe, expect, it } from 'vitest';
import { countdownParts, cycleTiming } from './cycle-timing';
import type { StxOnlyCalculations } from './types';

const base = {
  firstBurnchainBlockHeight: 666050,
  rewardCycleLength: 2100,
  prepareCycleLength: 100,
  currentBurnHeight: 974404,
  generatedAt: '2026-11-03T16:00:00.000Z',
} as StxOnlyCalculations;

describe('cycleTiming', () => {
  it("places the chain in pox-5's cycles, as the node reports them", () => {
    const timing = cycleTiming(base)!;
    expect(timing.cycle).toBe(146);
    expect(timing.nextCycleStartHeight).toBe(974750);
    expect(timing.prepareStartHeight).toBe(974650);
    expect(timing.blocksUntilPrepare).toBe(246);
    expect(timing.inPrepare).toBe(false);
  });

  it('counts dates at ten minutes a block from the refresh', () => {
    const timing = cycleTiming(base)!;
    expect(timing.prepareStartsAt.toISOString()).toBe(
      new Date(Date.parse(base.generatedAt) + 246 * 600_000).toISOString(),
    );
  });

  it('knows the prepare phase, when the next cycle is already fixed', () => {
    const timing = cycleTiming({ ...base, currentBurnHeight: 974700 })!;
    expect(timing.inPrepare).toBe(true);
    expect(timing.blocksUntilPrepare).toBe(0);
  });

  it('is null for a file written before the geometry was', () => {
    const { firstBurnchainBlockHeight: _, ...old } = base;
    expect(cycleTiming(old as StxOnlyCalculations)).toBeNull();
  });
});

describe('countdownParts', () => {
  it('splits into days, hours and minutes', () => {
    const now = 0;
    const target = new Date((41 * 60 + 5) * 60_000);
    expect(countdownParts(target, now)).toEqual({
      days: 1,
      hours: 17,
      minutes: 5,
    });
  });

  it('is null once the moment has passed', () => {
    expect(countdownParts(new Date(0), 1)).toBeNull();
  });
});
