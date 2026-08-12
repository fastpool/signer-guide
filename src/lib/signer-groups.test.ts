import { describe, expect, it } from 'vitest';
import realData from '../data/signers.json';
import {
  groupBySignerKey,
  groupForContract,
  shareBips,
  signerSlug,
  sumCycleUstx,
} from './signer-groups';
import type { CycleMember, Signer, SignerData } from './types';

/*
 * Grouping is the claim the signer page rests on: that these contracts are one
 * signer and that one of them on its own is a part rather than a whole. Get it
 * wrong and the page tells somebody a pool holds a quarter of what it does, or
 * merges two signers that have nothing to do with each other.
 */

const KEY_A = '0x02aaaa';
const KEY_B = '0x02bbbb';

const signer = (contractId: string, signerKey?: string): Signer =>
  ({ contractId, displayName: contractId, signerKey }) as Signer;

describe('groupBySignerKey', () => {
  it('makes one signer of the contracts sharing a key', () => {
    const groups = groupBySignerKey([
      signer('SP1.one', KEY_A),
      signer('SP1.two', KEY_B),
      signer('SP1.three', KEY_A),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].contracts.map((c) => c.contractId)).toEqual([
      'SP1.one',
      'SP1.three',
    ]);
    expect(groups[1].contracts.map((c) => c.contractId)).toEqual(['SP1.two']);
  });

  it('never merges two contracts on a key neither of them has', () => {
    // An unknown key is not evidence of a shared one. Piling them together
    // would invent a signer, and the page would report one pool's members as
    // another's.
    const groups = groupBySignerKey([signer('SP1.one'), signer('SP1.two')]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.signerKey === null)).toBe(true);
  });

  it('finds the signer a contract belongs to, siblings attached', () => {
    const signers = [signer('SP1.one', KEY_A), signer('SP1.two', KEY_A)];
    const group = groupForContract(signers, 'SP1.two');
    expect(group?.contracts).toHaveLength(2);
    expect(groupForContract(signers, 'SP1.nope')).toBeNull();
  });
});

describe('signerSlug', () => {
  it('names a signer by its key, without the 0x', () => {
    expect(signerSlug({ signerKey: KEY_A, contracts: [] })).toBe('02aaaa');
  });

  it('falls back to the contract id when there is no key', () => {
    expect(
      signerSlug({ signerKey: null, contracts: [signer('SP1.one')] }),
    ).toBe('SP1.one');
  });

  it('cannot collide between the two', () => {
    // A key is lower-case hex; a contract id starts with an upper-case
    // address. The files live in one directory, so this is what keeps a
    // keyless contract from overwriting a signer.
    const key = signerSlug({ signerKey: KEY_A, contracts: [] });
    const id = signerSlug({
      signerKey: null,
      contracts: [signer('SP1.one')],
    });
    expect(key).not.toBe(id);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    expect(/^[0-9a-f]+$/.test(id)).toBe(false);
  });

  it('gives every signer in the real data its own slug', () => {
    const groups = groupBySignerKey((realData as SignerData).signers);
    const slugs = groups.map(signerSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every slug a name a path can hold', () => {
    // These become file names and go into the path of a fetch, so a slug with
    // a slash or a space in it would be a broken request rather than a
    // 404 the page knows how to report.
    for (const slug of groupBySignerKey((realData as SignerData).signers).map(
      signerSlug,
    )) {
      expect(slug, slug).toMatch(/^[A-Za-z0-9.-]+$/);
    }
  });
});

describe('sumCycleUstx', () => {
  it('adds what it could read and ignores what it could not', () => {
    expect(sumCycleUstx({ a: '100', b: null, c: '23' })).toBe(123n);
  });

  it('says nothing rather than zero when it read nothing', () => {
    // Zero is a signer holding nothing, which is a fact about somebody's
    // money. Null is not knowing, and the two must not print the same.
    expect(sumCycleUstx({ a: null })).toBeNull();
    expect(sumCycleUstx({})).toBeNull();
    expect(sumCycleUstx({ a: '0' })).toBe(0n);
  });
});

describe('shareBips', () => {
  const member = (ustx: string): CycleMember =>
    ({ staker: 'SP1', ustx, contractId: 'SP1.one' }) as CycleMember;

  it('reads a quarter as 25 per cent', () => {
    expect(shareBips(member('250'), 1000n)).toBe(2500);
  });

  it('keeps its precision on amounts too big for a double', () => {
    // 44 million STX is a fifteen-digit uSTX amount, and multiplying it by
    // 10,000 in floating point loses the low digits — which is the whole
    // reason this is done in BigInt.
    const total = 44_319_696_086_276n;
    expect(shareBips(member(total.toString()), total)).toBe(10000);
    expect(shareBips(member((total / 3n).toString()), total)).toBe(3333);
  });

  it('does not divide by an empty cycle', () => {
    expect(shareBips(member('0'), 0n)).toBe(0);
  });
});
