import { describe, expect, it } from 'vitest';
import { formatStx } from './format.js';
import { classify, type Reading, type CycleMembership } from './members.js';
import {
  groupName,
  matchGroups,
  matchSigners,
  parseArgs,
} from './signer-members.js';
import { groupBySignerKey } from '../src/lib/signer-groups.js';
import type { Signer } from '../src/lib/types.js';

/*
 * The parts of the report that decide what it says, with no node in them. The
 * one that matters most is `classify`: the difference between "not a member"
 * and "the node did not answer" is a person missing from a list of who is
 * owed rewards, and nothing downstream can recover it once it is lost.
 */

const MAX500 =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';
const V1 =
  'SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP.fastpool-1-signer-manager';

const signer = (contractId: string, displayName: string, key: string): Signer =>
  ({ contractId, displayName, signerKey: key }) as Signer;

const POOLS = [
  signer(MAX500, 'Fast Pool Max500', '0xaa'),
  signer(V1, 'Fast Pool v1', '0xbb'),
  signer('SP3DHX7ZHNTCE1WQHJH0T0HY9NNSVT4SWTY2FRCCT.hiro', 'Hiro', '0xcc'),
  signer(
    'SP1Q1CZV7X4N1MCW5G96FR3B1MT8XGFB0YTZWAX85.signer-manager-stackslabs-3',
    'L2-Labs-3',
    '0xcc',
  ),
];

describe('naming a pool', () => {
  it('takes a contract id as exactly that pool', () => {
    expect(matchSigners(MAX500, POOLS).map((s) => s.displayName)).toEqual([
      'Fast Pool Max500',
    ]);
  });

  it('finds a pool by part of its name, spaces and case aside', () => {
    expect(matchSigners('max500', POOLS).map((s) => s.displayName)).toEqual([
      'Fast Pool Max500',
    ]);
    expect(
      matchSigners('FAST POOL v1', POOLS).map((s) => s.displayName),
    ).toEqual(['Fast Pool v1']);
  });

  it('reports every pool an ambiguous name matches', () => {
    // "fast pool" is two pools. Answering with one of them would be a guess
    // about which of somebody's pools they meant.
    expect(matchSigners('fast pool', POOLS).map((s) => s.displayName)).toEqual([
      'Fast Pool Max500',
      'Fast Pool v1',
    ]);
  });

  it('finds nothing rather than everything for an empty query', () => {
    expect(matchSigners('', POOLS)).toEqual([]);
    expect(matchSigners('---', POOLS)).toEqual([]);
  });
});

describe('what the chain said about a staker', () => {
  const member: Reading<CycleMembership> = {
    read: true,
    value: { signer: MAX500, ustx: 1_000_000n },
  };

  it('counts them when the cycle names one of this signer’s contracts', () => {
    expect(classify(member, [MAX500])).toEqual({
      kind: 'member',
      ustx: 1_000_000n,
      contract: MAX500,
    });
  });

  it('keeps them for the signer when they moved between its contracts', () => {
    // Two contracts, one signer key: moving from one to the other is not
    // leaving, and the column has to say which of the two they are with.
    expect(classify(member, [V1, MAX500])).toEqual({
      kind: 'member',
      ustx: 1_000_000n,
      contract: MAX500,
    });
  });

  it('says where they went when the cycle names another signer', () => {
    expect(classify(member, [V1])).toEqual({
      kind: 'elsewhere',
      signer: MAX500,
      ustx: 1_000_000n,
    });
  });

  it('separates holding nothing from not being answered for', () => {
    // Both are "no amount to add", and only one of them means the total below
    // is short. Collapsing them would make a wrong total look like a right one.
    expect(classify({ read: true, value: null }, [MAX500])).toEqual({
      kind: 'gone',
    });
    expect(classify({ read: false }, [MAX500])).toEqual({ kind: 'unknown' });
  });
});

describe('amounts as they are printed', () => {
  it('keeps all six decimals and groups the whole part', () => {
    expect(formatStx(41_530_653_232_810n)).toBe('41,530,653.232810');
    expect(formatStx(1n)).toBe('0.000001');
    expect(formatStx(0n)).toBe('0.000000');
    expect(formatStx(1_000_000n)).toBe('1.000000');
  });
});

describe('pools behind one signer key', () => {
  it('makes one signer of the contracts that share a key', () => {
    const groups = groupBySignerKey(POOLS);
    expect(groups.map(groupName)).toEqual([
      'Fast Pool Max500',
      'Fast Pool v1',
      'Hiro + L2-Labs-3',
    ]);
    expect(groups[2].signerKey).toBe('0xcc');
  });

  it('leaves a contract with no key on its own rather than piling them up', () => {
    // An unknown key is not evidence of a shared one; merging on it would
    // report two unrelated pools as one signer.
    const keyless = [
      signer('SP1.a', 'A', ''),
      signer('SP1.b', 'B', ''),
    ] as Signer[];
    expect(groupBySignerKey(keyless).map((g) => g.contracts.length)).toEqual([
      1, 1,
    ]);
  });

  it('answers a query about one contract with the whole signer', () => {
    // Asking about L2-Labs-3 and being told about half its signer is the
    // fragmentation this grouping exists to remove.
    expect(matchGroups('stackslabs-3', POOLS).map(groupName)).toEqual([
      'Hiro + L2-Labs-3',
    ]);
    // And naming both halves is still one signer, not two reports.
    expect(matchGroups('SP', POOLS).map(groupName)).toEqual([
      'Fast Pool Max500',
      'Fast Pool v1',
      'Hiro + L2-Labs-3',
    ]);
  });
});

describe('the command line', () => {
  it('takes several pools and the options in any order', () => {
    expect(parseArgs(['max500', '--top', '5', 'fastpool-1', '--json'])).toEqual(
      {
        queries: ['max500', 'fastpool-1'],
        cycle: null,
        top: 5,
        amounts: true,
        json: true,
      },
    );
  });

  it('reads a cycle and the flag that asks the chain nothing', () => {
    expect(parseArgs(['max500', '--cycle', '141', '--no-amounts'])).toEqual({
      queries: ['max500'],
      cycle: 141,
      top: null,
      amounts: false,
      json: false,
    });
  });

  it('refuses an option it does not know rather than reading it as a pool', () => {
    expect(() => parseArgs(['--tpo', '5'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--cycle', 'soon'])).toThrow(/cycle number/);
    expect(() => parseArgs(['--top', '0'])).toThrow(/count/);
  });
});
