import { describe, expect, it } from 'vitest';
import { buildTemplates } from './templates';
import type { Signer } from './types';

/*
 * The icon a contract page shows is the majority of its pools' icons, and the
 * count of pools it does not speak for is what lets the page say so. Both are
 * easy to get subtly wrong — an off-by-one in the count reads as an accusation
 * about a pool that did nothing — so they are pinned here rather than only in
 * the real data, which has one outlier today and might have none tomorrow.
 */

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const signer = (contractId: string, identiconHash: string | null): Signer => ({
  contractId,
  displayName: contractId,
  displayNameSource: 'contract',
  implementationName: null,
  registered: true,
  sourceSha256: 'source',
  canonicalSha256: 'canonical',
  groupSha256: 'group',
  identiconHash,
  match: 'canonical',
  profileId: 'standard',
  bitcoinRewards: false,
  openToAnyone: true,
  feeBips: null,
  maxFeeBips: null,
  feeChangeNotice: null,
  feeExemption: null,
  evidence: { bitcoinRewards: null, openToAnyone: null, maxFee: null },
});

const identiconOf = (...hashes: (string | null)[]) => {
  const [template] = buildTemplates(
    hashes.map((hash, index) => signer(`SP000.pool-${index}`, hash)),
  );
  return {
    hash: template.identiconHash,
    outliers: template.identiconOutliers,
  };
};

describe('a contract page icon', () => {
  it('is the icon when every pool shows it', () => {
    expect(identiconOf(HASH_A, HASH_A, HASH_A)).toEqual({
      hash: HASH_A,
      outliers: 0,
    });
  });

  it('is the majority icon, and counts the pools it leaves out', () => {
    // The case this rule exists for: one pool deploys the group's code with
    // the header comment stripped, which our fingerprint ignores and SIP-043
    // does not. It used to take the icon away from the other two.
    expect(identiconOf(HASH_A, HASH_A, HASH_B)).toEqual({
      hash: HASH_A,
      outliers: 1,
    });
  });

  it('counts a pool with no icon of its own as one it does not speak for', () => {
    expect(identiconOf(HASH_A, HASH_A, null)).toEqual({
      hash: HASH_A,
      outliers: 1,
    });
  });

  it('shows none when two icons are equally common', () => {
    // No majority, so nothing to show. The placeholder is honest here.
    expect(identiconOf(HASH_A, HASH_B)).toEqual({ hash: null, outliers: 2 });
  });

  it('shows none when no pool has one yet', () => {
    expect(identiconOf(null, null)).toEqual({ hash: null, outliers: 2 });
  });

  it('does not let pools without an icon outvote the ones that have it', () => {
    // A missing hash means the formatter has not run on that source, not that
    // the icon differs — so it cannot be a majority of its own.
    expect(identiconOf(HASH_A, null, null)).toEqual({
      hash: HASH_A,
      outliers: 2,
    });
  });
});
