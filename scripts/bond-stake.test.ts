import { describe, expect, it } from 'vitest';
import {
  contractBondSplit,
  cycleBondStake,
  replay,
  withBondStake,
} from './bond-stake.js';
import type { LockedTotals } from '../src/lib/types.js';

const XVERSE = 'SP8.xverse-signer-manager-3';
const LABS = 'SP3.stacks-labs';

const events = [
  {
    topic: 'stake',
    data: {
      staker: 'SPA',
      signer: XVERSE,
      'amount-ustx': '1000',
      'first-reward-cycle': '141',
      'unlock-cycle': '160',
    },
  },
  {
    topic: 'register-for-bond',
    data: {
      staker: 'SPB',
      signer: XVERSE,
      'amount-ustx': '300',
      'first-reward-cycle': '145',
      'unlock-cycle': '157',
      'bond-index': '2',
    },
  },
  {
    topic: 'register-for-bond',
    data: {
      staker: 'SPC',
      signer: LABS,
      'amount-ustx': '50',
      'first-reward-cycle': '143',
      'unlock-cycle': '155',
      'bond-index': '1',
    },
  },
  {
    topic: 'register-for-bond',
    data: {
      staker: 'SPD',
      signer: LABS,
      'amount-ustx': '700',
      'first-reward-cycle': '147',
      'unlock-cycle': '159',
      'bond-index': '3',
    },
  },
];

describe('contractBondSplit', () => {
  const state = replay(events);

  it('splits a contract bond by bond once its rows add up', () => {
    expect(contractBondSplit(state, XVERSE, 146, '1300')).toEqual({
      '2': '300',
    });
    expect(contractBondSplit(state, LABS, 147, '750')).toEqual({
      '1': '50',
      '3': '700',
    });
  });

  it('is a checked "none" for a contract with STX-only rows alone', () => {
    expect(contractBondSplit(state, XVERSE, 144, '1000')).toEqual({});
  });

  it('refuses when the rows do not add up to the chain', () => {
    expect(contractBondSplit(state, XVERSE, 146, '1299')).toBeNull();
    expect(contractBondSplit(state, XVERSE, 146, null)).toBeNull();
  });
});

describe('cycleBondStake', () => {
  it('lists pools it cannot check rather than calling them empty', () => {
    const state = replay(events);
    expect(
      cycleBondStake(state, 146, {
        [XVERSE]: '1300',
        [LABS]: '999',
        'SP9.empty': '0',
      }),
    ).toEqual({ ustx: { [XVERSE]: { '2': '300' } }, unknown: [LABS] });
  });
});

describe('withBondStake', () => {
  const totals: LockedTotals = {
    cycle: 146,
    ustx: { [XVERSE]: '1300', [LABS]: '50' },
    next: { cycle: 147, ustx: { [XVERSE]: '1300', [LABS]: '750' } },
  };

  it('fills in every cycle the file holds', () => {
    const filled = withBondStake(totals, replay(events), null);
    expect(Object.keys(filled.bond ?? {})).toEqual(['146', '147']);
    expect(filled.bond?.['147'].ustx[LABS]).toEqual({ '1': '50', '3': '700' });
  });

  it('keeps an earlier split without a replay, only for the same amounts', () => {
    const earlier = withBondStake(totals, replay(events), null);
    const moved: LockedTotals = {
      ...totals,
      next: { cycle: 147, ustx: { [XVERSE]: '1300', [LABS]: '800' } },
    };
    const kept = withBondStake(moved, null, earlier);
    expect(Object.keys(kept.bond ?? {})).toEqual(['146']);
  });
});
