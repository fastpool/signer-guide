import { describe, expect, it } from 'vitest';
import { matches, type FilterId } from './App';
import data from './data/signers.json';
import type { Signer, SignerData } from './lib/types';

/*
 * The filters are what a reader actually touches, and each one is a claim
 * about their money. These run against the real generated data, so a filter
 * that quietly stops matching anything shows up here rather than on the page.
 */

const signers = (data as SignerData).signers;
const withFilter = (...ids: FilterId[]) =>
  signers.filter((s) => matches(s, new Set(ids)));

const base: Signer = {
  contractId: 'SP000.test',
  displayName: 'Test',
  implementationName: null,
  registered: true,
  sourceSha256: 'a',
  canonicalSha256: 'b',
  groupSha256: 'c',
  match: 'unknown',
  profileId: null,
  bitcoinRewards: false,
  openToAnyone: false,
  feeBips: null,
  maxFeeBips: null,
  feeChangeDelayBlocks: null,
  evidence: {
    bitcoinRewards: null,
    openToAnyone: null,
    maxFee: null,
    feeChangeDelay: null,
  },
};

describe('filters', () => {
  it('shows everything when nothing is picked', () => {
    expect(withFilter()).toHaveLength(signers.length);
  });

  it('keeps only pools whose contract delays a fee change', () => {
    const shown = withFilter('feeNotice');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((s) => s.feeChangeDelayBlocks !== null)).toBe(true);
    // Juice Pool is the one contract that does this today.
    expect(shown.map((s) => s.contractId)).toContain(
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer',
    );
  });

  it('does not let a fee ceiling stand in for notice of a change', () => {
    // Different promises: a cap bounds how bad it gets, notice buys you time.
    expect(matches({ ...base, maxFeeBips: 2000 }, new Set(['feeNotice']))).toBe(
      false,
    );
    expect(
      matches({ ...base, feeChangeDelayBlocks: 144 }, new Set(['cappedFee'])),
    ).toBe(false);
  });

  it('combines filters, so picking two narrows rather than widens', () => {
    const both = withFilter('feeNotice', 'open');
    expect(both.length).toBeLessThanOrEqual(withFilter('feeNotice').length);
    expect(both.every((s) => s.openToAnyone)).toBe(true);
  });

  it('leaves out a pool with no fee of its own rather than calling it cheap', () => {
    expect(matches(base, new Set(['lowFee']))).toBe(false);
  });
});
