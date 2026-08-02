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

  it('returns latest unchanged when there is no previous file', () => {
    const latest = base({ A: null, B: '3' });

    const { totals, carriedForward } = preserveKnownTotals(latest, null);

    expect(totals).toEqual(latest);
    expect(carriedForward).toBe(0);
  });
});
