import { describe, expect, it } from 'vitest';
import {
  applyChange,
  membershipChange,
  membersOf,
  type MembershipEvent,
  type MembershipState,
} from './pox5-membership.js';

/*
 * The rules are pox-5's, read off the contract. What is worth pinning down is
 * the arithmetic each print implies. These are real sequences from mainnet,
 * the first of which the committed history got wrong: the staker moved from
 * one of a signer's contracts to the other, the signer's total did not move,
 * so the member list was never walked again and still names the old contract.
 */

const POX5_MGR = 'SP20XZGWBWSMRE94WDJ6YJ1EKPJ55RGRGK4JDJHNK.signer-manager-pox5';
const SENSEI = 'SP20XZGWBWSMRE94WDJ6YJ1EKPJ55RGRGK4JDJHNK.signer-manager-senseinode';
const STAKER = 'SM1TNJ9YHZ5RC1YY6Y8W5NN9DMZ2BJM1BWV8TH6D3';

const replay = (events: MembershipEvent[]): MembershipState => {
  const state: MembershipState = new Map();
  for (const event of events) {
    const change = membershipChange(event);
    if (change) applyChange(state, change);
  }
  return state;
};

const moved: MembershipEvent[] = [
  {
    topic: 'stake',
    data: {
      signer: POX5_MGR,
      staker: STAKER,
      'amount-ustx': '360000500110',
      'first-reward-cycle': '141',
      'unlock-cycle': '166',
      'num-cycles': '25',
    },
  },
  {
    // In cycle 143: raises the stake from 144 on and extends by one.
    topic: 'stake-update',
    data: {
      signer: POX5_MGR,
      'old-signer': POX5_MGR,
      staker: STAKER,
      'amount-ustx': '1000000500110',
      'unlock-cycle': '167',
      'num-cycles': '23',
      'prev-unlock-height': '166',
    },
  },
  {
    // Still in cycle 143: moves to the signer's other contract.
    topic: 'stake-update',
    data: {
      signer: SENSEI,
      'old-signer': POX5_MGR,
      staker: STAKER,
      'amount-ustx': '1000000500110',
      'unlock-cycle': '168',
      'num-cycles': '24',
      'prev-unlock-height': '167',
    },
  },
  { topic: 'claim-staker-rewards-for-signer', data: { staker: STAKER } },
];

describe('membershipChange', () => {
  it('keeps the cycles before an update as they were', () => {
    const state = replay(moved);
    expect(membersOf(state, [POX5_MGR], 143)).toEqual([
      { staker: STAKER, signer: POX5_MGR, ustx: 360000500110n },
    ]);
  });

  it('moves every cycle from the next one on to the new signer', () => {
    const state = replay(moved);
    expect(membersOf(state, [POX5_MGR], 144)).toEqual([]);
    expect(membersOf(state, [SENSEI], 144)).toEqual([
      { staker: STAKER, signer: SENSEI, ustx: 1000000500110n },
    ]);
    expect(membersOf(state, [SENSEI], 167)).toHaveLength(1);
    expect(membersOf(state, [SENSEI], 168)).toEqual([]);
  });

  it('ends a stake at the cycle an unstake names, and no earlier', () => {
    const state = replay([
      ...moved,
      {
        topic: 'unstake',
        data: {
          signer: SENSEI,
          staker: STAKER,
          'amount-ustx': '1000000500110',
          'first-reward-cycle': '141',
          'unlock-cycle': '150',
        },
      },
    ]);
    expect(membersOf(state, [SENSEI], 149)).toHaveLength(1);
    expect(membersOf(state, [SENSEI], 150)).toEqual([]);
  });

  it('counts a bond towards its signer for the bond’s term', () => {
    const state = replay([
      {
        topic: 'register-for-bond',
        data: {
          signer: SENSEI,
          staker: STAKER,
          'amount-ustx': '15511850',
          'first-reward-cycle': '143',
          'unlock-cycle': '155',
        },
      },
    ]);
    expect(membersOf(state, [SENSEI], 143)).toHaveLength(1);
    expect(membersOf(state, [SENSEI], 154)).toHaveLength(1);
    expect(membersOf(state, [SENSEI], 155)).toEqual([]);
  });

  it('reads camelCased fields as well as pox-5’s own', () => {
    const change = membershipChange({
      topic: 'stake',
      data: {
        signer: SENSEI,
        staker: STAKER,
        amountUstx: 5n,
        firstRewardCycle: 141n,
        unlockCycle: 143n,
      },
    });
    expect(change?.set.map((row) => row.cycle)).toEqual([141, 142]);
  });

  it('refuses a print it cannot read rather than guessing', () => {
    expect(() =>
      membershipChange({ topic: 'stake', data: { staker: STAKER } }),
    ).toThrow(/signer|first-reward-cycle/);
  });
});
