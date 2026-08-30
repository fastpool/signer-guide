import { describe, expect, it } from 'vitest';
import realData from '../data/signers.json';
import {
  cycleStanding,
  groupBySignerKey,
  groupForContract,
  groupUstx,
  shareBips,
  signerSlug,
  sumCycleUstx,
  votingPowerBips,
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

describe('cycleStanding', () => {
  const at = (cycle: number, cycleFinal: boolean) => ({ cycle, cycleFinal });

  it('calls only the cycle nobody has closed yet open to join', () => {
    // Stacking for a cycle locks in before it begins, so exactly one is ever
    // joinable — the next one.
    expect(cycleStanding(at(142, false), 141)).toBe('filling');
  });

  it('does not call the cycle a reader is standing in a joinable one', () => {
    // The bug this exists to stop. `fileFinal` is false for the current cycle
    // because the generator still re-reads it, and a page that read that flag
    // told a reader they could join a cycle that closed before it started.
    expect(cycleStanding(at(141, true), 141)).toBe('active');
  });

  it('calls a closed cycle behind us done', () => {
    expect(cycleStanding(at(140, true), 141)).toBe('done');
  });

  it('trusts the cycle flag over the current cycle for openness', () => {
    // `cycleFinal` is the chain's own statement and is enough on its own to
    // say a cycle is still open — no arithmetic against a possibly stale
    // currentCycle can take that away.
    expect(cycleStanding(at(142, false), undefined)).toBe('filling');
  });

  it('says it does not know rather than guessing done', () => {
    // A file written before these flags existed. Reading a missing flag as a
    // comparison would mark every cycle done, including one still open.
    expect(cycleStanding({ cycle: 142 } as never, 141)).toBe('unknown');
    // Closed, but with no current cycle there is no telling which closed one.
    expect(cycleStanding(at(141, true), undefined)).toBe('unknown');
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

/*
 * What a signer weighs. pox-5 gives a signer a say in proportion to the STX
 * stacked behind it, so this is the number that tells one key from another —
 * and the guide listed the keys for months without it.
 */
describe('votingPowerBips', () => {
  const group = (...ids: string[]) => ({
    signerKey: KEY_A,
    contracts: ids.map((id) => signer(id, KEY_A)),
  });

  it('weighs the key against the whole cycle, not against itself', () => {
    const ustx = { 'SP1.one': '250', 'SP1.two': '250', 'SP2.other': '500' };
    // Half the cycle, and it takes both of the key's contracts to see it.
    expect(votingPowerBips(group('SP1.one', 'SP1.two'), ustx)).toBe(5_000);
    expect(votingPowerBips(group('SP1.one'), ustx)).toBe(2_500);
  });

  it('adds up every contract on the key', () => {
    const ustx = { 'SP1.one': '250', 'SP1.two': '250', 'SP2.other': '500' };
    expect(groupUstx(group('SP1.one', 'SP1.two'), ustx)).toBe(500n);
  });

  it('is unknown, not zero, when an amount could not be read', () => {
    // A rate limit deciding a signer has no say is the failure worth avoiding:
    // zero here reads as a signer nobody stakes with.
    const ustx = { 'SP1.one': null, 'SP2.other': '500' };
    expect(votingPowerBips(group('SP1.one'), ustx)).toBeNull();
    expect(groupUstx(group('SP1.one'), ustx)).toBeNull();
  });

  it('counts what it could read when only a sibling is missing', () => {
    const ustx = { 'SP1.one': '250', 'SP1.two': null, 'SP2.other': '750' };
    // 250 of the 1000 it can see. Short by whatever the sibling holds, which
    // is the same shortfall every total on the site carries for an unread
    // pool — and it is a floor, not a guess.
    expect(votingPowerBips(group('SP1.one', 'SP1.two'), ustx)).toBe(2_500);
  });

  it('says nothing rather than dividing by an empty cycle', () => {
    expect(votingPowerBips(group('SP1.one'), { 'SP1.one': '0' })).toBeNull();
    expect(votingPowerBips(group('SP1.one'), {})).toBeNull();
  });

  it('keeps its precision on the amounts pox-5 actually holds', () => {
    // 82,681,580 STX of 421,543,815 — sixteen digits of uSTX, which is where
    // Number stops being able to hold the answer.
    const ustx = {
      'SP1.one': '82681580000000',
      'SP2.other': '338862235427560',
    };
    expect(votingPowerBips(group('SP1.one'), ustx)).toBe(1_961);
  });
});

describe('the real signers', () => {
  it('never add up to more than the whole cycle between them', () => {
    // Every key's share of one cycle, added together, is the cycle. A weight
    // over 100% would mean a contract counted twice — which is exactly what
    // grouping by key is there to prevent.
    const signers = (realData as SignerData).signers;
    const ustx = Object.fromEntries(
      signers.map((s, index) => [s.contractId, String((index + 1) * 1_000)]),
    );
    const total = groupBySignerKey(signers).reduce(
      (sum, group) => sum + (votingPowerBips(group, ustx) ?? 0),
      0,
    );
    expect(total).toBeGreaterThan(9_900);
    expect(total).toBeLessThanOrEqual(10_000);
  });
});
