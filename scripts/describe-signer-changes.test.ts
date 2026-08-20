import { describe, expect, it } from 'vitest';
import { describeChanges } from './describe-signer-changes.js';
import type { Signer, SignerData } from '../src/lib/types.js';

const signer = (overrides: Partial<Signer> = {}): Signer => ({
  contractId: 'SP000.signer-manager',
  displayName: 'Test',
  displayNameSource: 'contract',
  implementationName: 'Standard',
  registered: true,
  sourceSha256: 'a',
  canonicalSha256: 'b',
  groupSha256: 'c',
  identiconHash: 'd',
  match: 'canonical',
  profileId: 'standard',
  bitcoinRewards: true,
  openToAnyone: true,
  feeBips: 0,
  maxFeeBips: null,
  feeChangeNotice: null,
  feeExemption: null,
  undistributedSats: null,
  unclaimedFromPoxSats: null,
  earnedFeesSats: null,
  evidence: {
    bitcoinRewards: null,
    openToAnyone: null,
    maxFee: null,
  },
  ...overrides,
});

const data = (signers: Signer[], cycle = 141): SignerData => ({
  generatedAt: '2026-07-31T00:00:00.000Z',
  cycle,
  standardisedWith: 'clarinet 3.23.1',
  signers,
});

describe('describeChanges', () => {
  it('does not count a new timestamp as a change', () => {
    // The refresh runs daily and usually finds nothing. Committing on the
    // timestamp alone would bury the runs that matter.
    const before = data([signer()]);
    const after = { ...data([signer()]), generatedAt: '2026-08-01T00:00:00Z' };
    expect(describeChanges(before, after).changed).toBe(false);
  });

  it('reports a pool that has just registered, and what it runs', () => {
    const { changed, lines } = describeChanges(
      data([]),
      data([signer({ contractId: 'SP111.new-signer', feeBips: 250 })]),
    );
    expect(changed).toBe(true);
    expect(lines[0]).toContain('+ registered  SP111.new-signer');
    expect(lines[0]).toContain('Standard');
    expect(lines[0]).toContain('2.5%');
  });

  it('reports a pool that has gone', () => {
    const { lines } = describeChanges(data([signer()]), data([]));
    expect(lines).toEqual(['- deregistered  SP000.signer-manager']);
  });

  it('reports a fee move in percent rather than basis points', () => {
    const { lines } = describeChanges(
      data([signer({ feeBips: 0 })]),
      data([signer({ feeBips: 500 })]),
    );
    expect(lines).toEqual(['~ fee  SP000.signer-manager  0% -> 5%']);
  });

  it('reports a contract we have since reviewed', () => {
    const { lines } = describeChanges(
      data([signer({ profileId: null, implementationName: null })]),
      data([signer()]),
    );
    expect(lines[0]).toContain('now matches Standard');
  });

  it('flags a feature reading that changed under us', () => {
    // A deployed contract cannot change. If its answers do, our own detector
    // changed, and that deserves a human rather than a silent commit.
    const { lines } = describeChanges(
      data([signer()]),
      data([signer({ openToAnyone: false })]),
    );
    expect(lines).toEqual([
      '~ openToAnyone  SP000.signer-manager  true -> false',
    ]);
  });

  it('flags stakers who stop being exempt from the fee', () => {
    // The pool can take somebody off that list, and the page would quietly
    // start telling a different story about who pays. Worth a line.
    const exempt = signer({
      feeExemption: {
        test: 'is-og',
        source: 'og-stakers',
        operatorChooses: true,
        evidence: '(if (is-og staker) u0 (var-get fee-bips))',
      },
    });
    const { lines } = describeChanges(data([exempt]), data([signer()]));
    expect(lines).toEqual([
      '~ feeExemption  SP000.signer-manager  is-og via og-stakers -> none',
    ]);
  });

  it('lists contracts nobody has read yet', () => {
    const { unreviewed } = describeChanges(
      data([]),
      data([
        signer({ contractId: 'SP222.mystery', profileId: null }),
        signer(),
      ]),
    );
    expect(unreviewed).toEqual(['SP222.mystery']);
  });

  it('keeps a contract id that is not a contract id out of the shell', () => {
    const { unreviewed } = describeChanges(
      data([]),
      data([signer({ contractId: 'SP333.x; rm -rf /', profileId: null })]),
    );
    expect(unreviewed).toEqual([]);
  });
});

describe('the reward figures', () => {
  const data = (...signers: Signer[]): SignerData => ({
    generatedAt: '2026-08-20T00:00:00.000Z',
    cycle: 141,
    standardisedWith: null,
    signers,
  });

  it('counts the pools whose sBTC moved rather than listing them', () => {
    // A line each would be most of the pools, every hour.
    const before = data(
      signer({ contractId: 'SP000.a', undistributedSats: '100' }),
      signer({ contractId: 'SP000.b', earnedFeesSats: '0' }),
    );
    const after = data(
      signer({ contractId: 'SP000.a', undistributedSats: '0' }),
      signer({ contractId: 'SP000.b', earnedFeesSats: '7' }),
    );
    const { changed, lines } = describeChanges(before, after);
    expect(changed).toBe(true);
    expect(lines).toEqual([
      '~ rewards  2 pool(s) claimed, paid out or charged sBTC',
    ]);
  });

  it('counts a pool that collected a payout it was behind on', () => {
    const before = data(signer({ unclaimedFromPoxSats: '19011164' }));
    const after = data(signer({ unclaimedFromPoxSats: '0' }));
    expect(describeChanges(before, after).lines).toHaveLength(1);
  });

  it('says nothing when they held still', () => {
    // Which is the point of counting: an hour where nobody claimed anything
    // must not turn into a commit.
    const before = data(signer({ undistributedSats: '59' }));
    const after = data(signer({ undistributedSats: '59' }));
    expect(describeChanges(before, after).changed).toBe(false);
  });
});
