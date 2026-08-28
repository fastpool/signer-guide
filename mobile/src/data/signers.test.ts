import { BUNDLED } from './snapshot';
import {
  allSigners,
  isJoinable,
  joinableSigners,
  poolName,
  signerFor,
  stakedUstx,
  templatesFrom,
  templateStakedUstx,
} from './signers';
import type { Signer } from '@guide/lib/types';

/*
 * Reading the guide's own data, on the terms the guide sets: a name that was
 * inferred is marked as inferred, an amount that could not be read is unknown
 * rather than zero, and the pools offered on the way to staking are only the
 * ones that would take a stake.
 */

const snapshot = BUNDLED;

function fake(overrides: Partial<Signer>): Signer {
  return {
    contractId: 'SP000000000000000000002Q6VF78.test',
    displayName: 'Test',
    displayNameSource: 'contract',
    implementationName: null,
    registered: true,
    sourceSha256: '',
    canonicalSha256: '',
    groupSha256: '',
    identiconHash: null,
    match: null,
    profileId: null,
    bitcoinRewards: false,
    openToAnyone: true,
    feeBips: 0,
    maxFeeBips: null,
    feeChangeNotice: null,
    feeExemption: null,
    evidence: { bitcoinRewards: null, openToAnyone: null, maxFee: null },
    ...overrides,
  } as Signer;
}

describe('poolName', () => {
  it('marks a name the generator worked out as a guess', () => {
    expect(poolName(fake({ displayName: 'Pox5' }), 'x.y')).toEqual({
      name: 'Pox5',
      guessed: true,
    });
  });

  it('does not mark a name somebody put in and sourced', () => {
    expect(
      poolName(fake({ displayName: 'Fast Pool', displayNameSource: 'manual' }), 'x.y'),
    ).toEqual({ name: 'Fast Pool', guessed: false });
  });

  it('falls back to the contract name, and says that is a guess too', () => {
    expect(poolName(null, 'SP123.fastpool-1-signer-manager')).toEqual({
      name: 'Fastpool 1 Signer Manager',
      guessed: true,
    });
  });
});

describe('stakedUstx', () => {
  it('reads a plain count', () => {
    expect(
      stakedUstx(snapshot.totals, 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager'),
    ).toBe(82_681_580_000_000n);
  });

  it('is unknown, not zero, for a pool that is not in the file', () => {
    expect(stakedUstx(snapshot.totals, 'SP000.nothing')).toBeNull();
  });

  it('refuses an amount that is not a count rather than throwing on BigInt', () => {
    expect(
      stakedUstx({ cycle: 1, ustx: { 'a.b': 'lots' } } as never, 'a.b'),
    ).toBeNull();
  });
});

describe('the pool list', () => {
  it('puts the biggest first', () => {
    const amounts = allSigners(snapshot)
      .map((s) => stakedUstx(snapshot.totals, s.contractId) ?? -1n);
    const sorted = [...amounts].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
    expect(amounts).toEqual(sorted);
  });

  it('holds every pool in the file, including the ones nobody can join', () => {
    expect(allSigners(snapshot)).toHaveLength(snapshot.signers.signers.length);
  });
});

describe('joinable pools', () => {
  it('excludes a pool that is not registered for this cycle', () => {
    expect(isJoinable(fake({ registered: false }))).toBe(false);
  });

  it('excludes a pool that decides who may join', () => {
    expect(isJoinable(fake({ openToAnyone: false }))).toBe(false);
  });

  it('leaves them out of the list offered on the way to staking', () => {
    const template = templatesFrom(snapshot)[0];
    const offered = joinableSigners(template, snapshot.totals);
    expect(offered.every(isJoinable)).toBe(true);
    expect(offered.length).toBeLessThanOrEqual(template.signers.length);
  });
});

describe('templates', () => {
  it('groups the pools by the code they run, most-used first', () => {
    const templates = templatesFrom(snapshot);
    expect(templates.length).toBeGreaterThan(0);
    const counts = templates.map((t) => t.signers.length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('adds up what every pool running one contract holds', () => {
    const template = templatesFrom(snapshot)[0];
    const total = templateStakedUstx(template, snapshot.totals);
    const parts = template.signers
      .map((s) => stakedUstx(snapshot.totals, s.contractId))
      .filter((a): a is bigint => a !== null);
    expect(total).toBe(parts.reduce((sum, a) => sum + a, 0n));
  });
});

describe('signerFor', () => {
  it('finds a pool by its contract id', () => {
    const id = snapshot.signers.signers[0].contractId;
    expect(signerFor(snapshot, id)?.contractId).toBe(id);
  });

  it('answers null rather than guessing for one it does not hold', () => {
    expect(signerFor(snapshot, 'SP000.nothing')).toBeNull();
  });
});
