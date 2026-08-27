import { describe, expect, it } from 'vitest';
import { sumAcrossCycles } from './generate-signers.js';

/*
 * The bug this exists for: "what is pox-5 still holding for this pool" was
 * asked about the current cycle alone. `get-earned` is keyed by the cycle the
 * rewards were earned in, so a pool sitting on an uncollected payout from the
 * cycle before answered 0 — and the page told a reader that Fast Pool Max500
 * had collected everything while pox-5 held 22 million sats for it.
 */
describe('sumAcrossCycles', () => {
  it('adds every cycle up, not just the last one', async () => {
    const earned = new Map([
      [141, 22_087_087n],
      [142, 0n],
    ]);

    expect(
      await sumAcrossCycles([141, 142], async (c) => earned.get(c) ?? 0n),
    ).toBe(22_087_087n);
  });

  it('says it does not know rather than reporting a short total', async () => {
    // A cycle the node would not answer for is not a cycle owed nothing, and
    // the difference is somebody's money going unmentioned.
    expect(
      await sumAcrossCycles([141, 142], async (c) => (c === 141 ? null : 0n)),
    ).toBeNull();
  });

  it('is zero across no cycles at all, which is what pox-5 held then', async () => {
    expect(await sumAcrossCycles([], async () => 1n)).toBe(0n);
  });
});
