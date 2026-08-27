import { describe, expect, it } from 'vitest';
import { hasStake, inUse, isKnownEmpty, isNewSigner } from './activity';
import type { LockedTotals, Signer } from './types';

const signer = (over: Partial<Signer> = {}): Signer =>
  ({
    contractId: 'SP0.pool',
    displayName: 'pool',
    displayNameSource: 'contract',
    implementationName: null,
    registered: true,
    sourceSha256: '',
    canonicalSha256: '',
    groupSha256: '',
    identiconHash: '',
    match: 'unknown',
    profileId: null,
    bitcoinRewards: false,
    openToAnyone: true,
    feeBips: null,
    maxFeeBips: null,
    feeChangeNotice: null,
    feeExemption: null,
    evidence: { bitcoinRewards: null, openToAnyone: null, maxFee: null },
    ...over,
  }) as Signer;

const totals = (over: Partial<LockedTotals> = {}): LockedTotals => ({
  cycle: 142,
  ustx: { 'SP0.pool': '0' },
  ...over,
});

describe('hasStake', () => {
  it('counts the cycle before and the one filling, not only this one', () => {
    // A pool that emptied this cycle is still a pool people used, and one
    // taking its first stake is in use before its cycle has begun.
    expect(
      hasStake(
        'SP0.pool',
        totals({ previous: { cycle: 141, ustx: { 'SP0.pool': '500' } } }),
      ),
    ).toBe(true);
    expect(
      hasStake(
        'SP0.pool',
        totals({ next: { cycle: 143, ustx: { 'SP0.pool': '500' } } }),
      ),
    ).toBe(true);
  });

  it('is false for a pool that is empty in every cycle on file', () => {
    expect(hasStake('SP0.pool', totals())).toBe(false);
  });

  it('is false for a pool the amounts have never heard of', () => {
    expect(hasStake('SP0.missing', totals())).toBe(false);
  });
});

describe('isKnownEmpty', () => {
  it('is true only when every cycle on file was read and was zero', () => {
    expect(
      isKnownEmpty(
        'SP0.pool',
        totals({
          previous: { cycle: 141, ustx: { 'SP0.pool': '0' } },
          next: { cycle: 143, ustx: { 'SP0.pool': '0' } },
        }),
      ),
    ).toBe(true);
  });

  it('will not call a pool empty on an amount nobody could read', () => {
    // Null is the node refusing to answer, and hiding a pool over that would
    // be a rate limit deciding what a reader gets to see.
    expect(
      isKnownEmpty('SP0.pool', totals({ ustx: { 'SP0.pool': null } })),
    ).toBe(false);
    expect(
      isKnownEmpty(
        'SP0.pool',
        totals({
          ustx: { 'SP0.pool': '0' },
          next: { cycle: 143, ustx: { 'SP0.pool': null } },
        }),
      ),
    ).toBe(false);
  });

  it('will not call a pool empty that the file has never covered', () => {
    expect(isKnownEmpty('SP0.missing', totals())).toBe(false);
    expect(inUse(signer({ contractId: 'SP0.missing' }), totals())).toBe(true);
  });
});

describe('isNewSigner', () => {
  it('counts this cycle and the one before it', () => {
    // Stacking for a cycle is locked in before the cycle begins, so a pool
    // first seen during 141 could not appear in 141's amounts at all.
    expect(isNewSigner(signer({ firstSeenCycle: 142 }), 142)).toBe(true);
    expect(isNewSigner(signer({ firstSeenCycle: 141 }), 142)).toBe(true);
    expect(isNewSigner(signer({ firstSeenCycle: 140 }), 142)).toBe(false);
  });

  it('treats a pool with no sighting on file as not new', () => {
    // The field is written by every refresh, so its absence means the entry
    // predates it — which is evidence of age, not of newness.
    expect(isNewSigner(signer(), 142)).toBe(false);
  });
});

describe('inUse', () => {
  it('keeps a new pool that nobody has staked with yet', () => {
    expect(inUse(signer({ firstSeenCycle: 142 }), totals())).toBe(true);
  });

  it('drops an old pool that nobody has staked with', () => {
    expect(inUse(signer({ firstSeenCycle: 140 }), totals())).toBe(false);
  });
});
