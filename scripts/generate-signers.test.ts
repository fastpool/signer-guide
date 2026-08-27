import { describe, expect, it } from 'vitest';
import { summariseEarned } from './generate-signers.js';

/*
 * Two rules meet here, and the second exists to pay for the first.
 *
 * The first: "what is pox-5 still holding for this pool" was once asked about
 * the current cycle alone. `get-earned` is keyed by the cycle the rewards were
 * earned in, so a pool sitting on an uncollected payout from the cycle before
 * answered 0 — and the page told a reader that Fast Pool Max500 had collected
 * everything while pox-5 held 22 million sats for it. So every cycle is asked.
 *
 * The second: that is a call per pool per cycle, growing by one a fortnight
 * for ever. A settled cycle a pool has emptied can never owe it anything
 * again, so the floor moves up past it and those cycles are never asked about
 * again. What must not happen is the floor moving over a cycle that could
 * still turn out to owe somebody.
 */

const ALL_SETTLED = () => true;

describe('summariseEarned', () => {
  it('adds every cycle up, not just the last one', () => {
    const { sats } = summariseEarned(
      [
        { cycle: 141, earned: 22_087_087n },
        { cycle: 142, earned: 0n },
      ],
      ALL_SETTLED,
      141,
    );

    expect(sats).toBe(22_087_087n);
  });

  it('moves the floor past a settled cycle the pool has emptied', () => {
    const { from } = summariseEarned(
      [
        { cycle: 141, earned: 0n },
        { cycle: 142, earned: 500n },
      ],
      ALL_SETTLED,
      141,
    );

    expect(from).toBe(142);
  });

  it('leaves the floor under a cycle that still owes something', () => {
    // Max500 today: 141 is settled and unclaimed, so next time starts there.
    const { from } = summariseEarned(
      [
        { cycle: 141, earned: 22_087_087n },
        { cycle: 142, earned: 0n },
      ],
      ALL_SETTLED,
      141,
    );

    expect(from).toBe(141);
  });

  it('leaves the floor under a cycle whose rewards are not all computed', () => {
    // A zero in an unsettled cycle is "not worked out yet", not "collected" —
    // the second of a cycle's two distributions lands on its last block. Moving
    // past it would skip that payout for good.
    const settled = (cycle: number) => cycle < 142;
    const { from } = summariseEarned(
      [
        { cycle: 141, earned: 0n },
        { cycle: 142, earned: 0n },
      ],
      settled,
      141,
    );

    expect(from).toBe(142);
  });

  it('only ever drops a leading run, never a gap in the middle', () => {
    // 141 is finished with; 142 owes; 143 is empty and settled. The floor
    // stops at 142, because it is a floor and not a verdict on each cycle.
    const { from, sats } = summariseEarned(
      [
        { cycle: 141, earned: 0n },
        { cycle: 142, earned: 7n },
        { cycle: 143, earned: 0n },
      ],
      ALL_SETTLED,
      141,
    );

    expect(from).toBe(142);
    expect(sats).toBe(7n);
  });

  it('keeps the floor where it was when there was nothing to ask', () => {
    expect(summariseEarned([], ALL_SETTLED, 142)).toEqual({
      sats: 0n,
      from: 142,
    });
  });
});
