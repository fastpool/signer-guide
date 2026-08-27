import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  rateFor,
  summariseCycle,
  type MemberReward,
} from './reward-distribution.js';

const member = (over: Partial<MemberReward>): MemberReward => ({
  staker: 'SP1AAA',
  ustx: 1_000_000_000n,
  claimedSats: 0n,
  owedSats: 0n,
  earnedSats: 0n,
  rateSatsPer1000Stx: 0n,
  ...over,
});

describe('parseArgs', () => {
  it('takes the cycles as numbers and the rest as the pool', () => {
    const options = parseArgs(['native', 'pool', '141', '142']);

    expect(options.query).toBe('native pool');
    expect(options.cycles).toEqual([141, 142]);
  });

  it('takes them as a flag too, in any order, without repeats', () => {
    expect(parseArgs(['max500', '--cycles', '142,141,142']).cycles).toEqual([
      141, 142,
    ]);
  });
});

describe('rateFor', () => {
  it('is sats per 1000 STX, rounded down', () => {
    // A real member of Native Pool in cycle 141: 40,000 STX staked, 30,344
    // sats earned. That is 758.6 per 1000 STX, and the fraction is lost the
    // same way pox-5 loses it.
    expect(rateFor(30_344n, 40_000_000_000n)).toBe(758n);
  });

  it('will not divide by a stake of nothing', () => {
    expect(rateFor(5n, 0n)).toBeNull();
  });
});

/*
 * The rule that matters here is the one this script got wrong first time
 * round: it read the members concurrently, earned a 429 for a dozen of them,
 * and counted every refusal as a member who earned nothing — which named paid
 * stakers as unpaid and made the pool's rates look like they had a fee in
 * them. An unread member now makes the totals unknown instead.
 */
describe('summariseCycle', () => {
  it('adds up what was read', () => {
    const summary = summariseCycle(141, [
      member({ claimedSats: 100n, owedSats: 200n, earnedSats: 300n }),
      member({ staker: 'SP2BBB', owedSats: 700n, earnedSats: 700n }),
    ]);

    expect(summary.claimedSats).toBe(100n);
    expect(summary.owedSats).toBe(900n);
    expect(summary.earnedSats).toBe(1000n);
    expect(summary.claimedCount).toBe(1);
    expect(summary.unreadCount).toBe(0);
  });

  it('will not total a cycle it could not read all of', () => {
    const summary = summariseCycle(141, [
      member({ owedSats: 200n, earnedSats: 200n }),
      member({ staker: 'SP2BBB', owedSats: null, earnedSats: null }),
    ]);

    expect(summary.unreadCount).toBe(1);
    expect(summary.owedSats).toBeNull();
    expect(summary.earnedSats).toBeNull();
    expect(summary.poolRateSatsPer1000Stx).toBeNull();
  });

  it('reports the spread across the members it did read', () => {
    const summary = summariseCycle(141, [
      member({ rateSatsPer1000Stx: 758n, owedSats: 1n, earnedSats: 1n }),
      member({
        staker: 'SP2BBB',
        rateSatsPer1000Stx: 757n,
        owedSats: 1n,
        earnedSats: 1n,
      }),
    ]);

    expect(summary.lowestRate).toBe(757n);
    expect(summary.highestRate).toBe(758n);
  });
});
