import { describe, expect, it } from 'vitest';
import { membersFromPool, type PoolMembersFile } from './pool-members.js';

const A = 'SP000.pool-a';
const B = 'SP000.pool-b';
const BOND = 'SP111.bond-staker';

const file: PoolMembersFile = {
  cycle: 147,
  members: [
    { stacker: 'SP1', amount: 60, signer: A },
    { stacker: 'SP2', amount: 25, signer: A, bond: { staker: BOND, bondIndex: 1 } },
    { stacker: 'SP3', amount: 15, signer: A, bond: { staker: BOND, bondIndex: 1 } },
    { stacker: 'SP4', amount: 7, signer: B },
  ],
};

describe('membersFromPool', () => {
  it('takes the list when every contract adds up, with depositors summed into their bond staker', () => {
    expect(membersFromPool(file, [A, B], { [A]: '100', [B]: '7' })).toEqual([
      { staker: 'SP1', ustx: '60', contractId: A },
      { staker: BOND, ustx: '40', contractId: A, bondIndex: 1 },
      { staker: 'SP4', ustx: '7', contractId: B },
    ]);
  });

  it('refuses a list that is short for any one contract', () => {
    expect(membersFromPool(file, [A, B], { [A]: '101', [B]: '7' })).toBeNull();
    expect(membersFromPool(file, [A, B], { [A]: '100', [B]: '8' })).toBeNull();
  });

  it('refuses a signer the file does not know, an unread amount, and no file', () => {
    expect(membersFromPool(file, ['SP999.other'], { 'SP999.other': '5' })).toBeNull();
    expect(membersFromPool(file, [A], { [A]: null })).toBeNull();
    expect(membersFromPool(null, [A], { [A]: '100' })).toBeNull();
  });
});
