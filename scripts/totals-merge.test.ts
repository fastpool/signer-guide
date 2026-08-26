import { describe, expect, it } from 'vitest';
import type { LockedTotals } from '../src/lib/types.js';
import { preserveKnownTotals } from './totals-merge.js';

const base = (ustx: LockedTotals['ustx']): LockedTotals => ({
  cycle: 141,
  ustx,
});

describe('preserveKnownTotals', () => {
  it('keeps old value when fresh read is null', () => {
    const latest = base({ A: null, B: '10' });
    const previous = base({ A: '500', B: '9' });

    const { totals, carriedForward } = preserveKnownTotals(latest, previous);

    expect(totals.ustx).toEqual({ A: '500', B: '10' });
    expect(carriedForward).toBe(1);
  });

  it('keeps null when there is no previous value', () => {
    const latest = base({ A: null });
    const previous = base({ A: null });

    const { totals, carriedForward } = preserveKnownTotals(latest, previous);

    expect(totals.ustx.A).toBeNull();
    expect(carriedForward).toBe(0);
  });

  it('carries the last run\u2019s next cycle onto this run\u2019s current one', () => {
    // Cycle 142 rolled over: what the last run read as next is what this run
    // is showing as current, and it is a reading of the same cycle.
    const latest: LockedTotals = { cycle: 142, ustx: { A: null, B: '7' } };
    const previous: LockedTotals = {
      cycle: 141,
      ustx: { A: '1', B: '1' },
      next: { cycle: 142, ustx: { A: '600', B: '5' } },
    };

    const { totals, carriedForward } = preserveKnownTotals(latest, previous);

    expect(totals.ustx).toEqual({ A: '600', B: '7' });
    expect(carriedForward).toBe(1);
  });

  it('never carries an amount onto a cycle it was not read for', () => {
    // 141's amount printed under 142 is a wrong number, not a stale one.
    const latest: LockedTotals = { cycle: 142, ustx: { A: null } };
    const previous: LockedTotals = { cycle: 141, ustx: { A: '500' } };

    const { totals, carriedForward } = preserveKnownTotals(latest, previous);

    expect(totals.ustx.A).toBeNull();
    expect(carriedForward).toBe(0);
  });

  it('carries the next cycle the same way as the current one', () => {
    const latest: LockedTotals = {
      cycle: 141,
      ustx: { A: '9' },
      next: { cycle: 142, ustx: { A: null } },
    };
    const previous: LockedTotals = {
      cycle: 141,
      ustx: { A: '9' },
      next: { cycle: 142, ustx: { A: '42' } },
    };

    const { totals, carriedForward } = preserveKnownTotals(latest, previous);

    expect(totals.next?.ustx.A).toBe('42');
    expect(carriedForward).toBe(1);
  });

  it('returns latest unchanged when there is no previous file', () => {
    const latest = base({ A: null, B: '3' });

    const { totals, carriedForward } = preserveKnownTotals(latest, null);

    expect(totals).toEqual(latest);
    expect(carriedForward).toBe(0);
  });
});
