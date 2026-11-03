import { describe, expect, it } from 'vitest';
import { stxOnlySummary } from './stx-only-summary';
import type { StxOnlyCalculations } from './types';

const base = {
  generatedAt: '2026-10-26T14:28:00.000Z',
  rateSatsPer1000Stx: '800',
  stxPriceSats: '700',
  blocksIntoCycle: 598,
  blocksLeftInCycle: 452,
  distributionBlocks: 1050,
} as unknown as StxOnlyCalculations;

describe('stxOnlySummary', () => {
  it('works out how far the distribution cycle has got', () => {
    const summary = stxOnlySummary(base, Date.parse('2026-10-27T00:00:00Z'));
    expect(summary?.progressPercent).toBeCloseTo((598 / 1050) * 100);
    expect(summary?.overdue).toBe(false);
  });

  it('says an estimate whose date has passed is overdue', () => {
    // Read on 26 October and due about three days later. On 3 November,
    // "in about 3 days" is a claim about a week ago.
    const summary = stxOnlySummary(base, Date.parse('2026-11-03T12:00:00Z'));
    expect(summary?.overdue).toBe(true);
  });

  it('has nothing to say without a rate', () => {
    expect(
      stxOnlySummary({ ...base, rateSatsPer1000Stx: null } as never),
    ).toBeNull();
  });
});
