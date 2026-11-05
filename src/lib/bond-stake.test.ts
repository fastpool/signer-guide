import { describe, expect, it } from 'vitest';
import {
  bondParts,
  bondUstxOf,
  poolsInBond,
  poolsWithBondStake,
  totalBondUstx,
} from './bond-stake';

const stake = {
  ustx: {
    'SP3.stacks-labs': { '3': '13764611000000', '1': '465425303325', '?': '5' },
    'SP2.hashkeycloud-v1': { '1': '620474000000' },
  },
  unknown: ['SP9.unread'],
};

describe('bondParts', () => {
  it('orders bonds oldest first, an unnamed one last', () => {
    expect(
      bondParts(stake.ustx, ['SP3.stacks-labs']).map((p) => p.bondIndex),
    ).toEqual([1, 3, null]);
  });

  it('adds up the contracts of one key bond by bond', () => {
    const [first] = bondParts(stake.ustx, [
      'SP3.stacks-labs',
      'SP2.hashkeycloud-v1',
    ]);
    expect(first).toEqual({ bondIndex: 1, ustx: 1_085_899_303_325n });
  });
});

describe('bondUstxOf', () => {
  it('is zero for a pool checked and holding none', () => {
    expect(bondUstxOf(stake, ['SP1.ordinary'])).toBe(0n);
  });

  it('is null — never zero — when not known', () => {
    expect(bondUstxOf(stake, ['SP9.unread'])).toBeNull();
    expect(bondUstxOf(undefined, ['SP1.ordinary'])).toBeNull();
  });
});

describe('the bonds page figures', () => {
  it('lists pools by bond stake, and the pools in one bond', () => {
    expect(poolsWithBondStake(stake).map((p) => p.contractId)).toEqual([
      'SP3.stacks-labs',
      'SP2.hashkeycloud-v1',
    ]);
    expect(poolsInBond(stake, 1).map((p) => p.contractId)).toEqual([
      'SP2.hashkeycloud-v1',
      'SP3.stacks-labs',
    ]);
    expect(totalBondUstx(stake)).toBe(14_850_510_303_330n);
  });
});
