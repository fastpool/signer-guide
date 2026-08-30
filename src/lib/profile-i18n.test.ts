/**
 * The name a reader is shown for the contract their pool runs.
 *
 * Two sources say what a contract type is called: `profiles.json`, where the
 * name is written, and `implementationName` in `signers.json`, a copy of it
 * taken when the file was generated. They disagree in two ways that reach the
 * page — the copy goes stale between a rename and the next refresh, and the
 * copy is always English — so `contractTypeName` decides between them once,
 * and every list that names a contract asks it.
 */

import { describe, expect, it } from 'vitest';
import { contractTypeName } from './profile-i18n';
import { PROFILES } from './profiles';

const [knownHash, known] = Object.entries(PROFILES)[0];

describe('contractTypeName', () => {
  it('says what profiles.json says, not what the data was written with', () => {
    // The stale copy is what the page used to print, for as long as it took
    // the hourly refresh to rewrite every signer that ran the renamed code.
    expect(
      contractTypeName(
        { groupSha256: knownHash, implementationName: 'The old name' },
        'en',
      ),
    ).toBe(known.name);
  });

  it('translates it, which the copy in the data never is', () => {
    // A pool card read "Invite-only 서명자 컨트랙트" and linked to a page
    // headed 초대 전용. Same contract, two names, one of them in the wrong
    // language.
    const korean = contractTypeName(
      { groupSha256: knownHash, implementationName: known.name },
      'ko',
    );
    expect(korean).not.toBe(known.name);
    expect(korean).toBeTruthy();
  });

  it('falls back to the name that came with the data', () => {
    // An installed phone app fetches signers.json but bundles profiles.json,
    // so a contract type added since that build is unknown here. The name in
    // the data is worth more than "code not reviewed", which is what the
    // callers say when there is no name at all.
    expect(
      contractTypeName(
        { groupSha256: 'a hash no profile has', implementationName: 'Standard' },
        'en',
      ),
    ).toBe('Standard');
  });

  it('has no name for code nothing has read', () => {
    expect(
      contractTypeName(
        { groupSha256: 'a hash no profile has', implementationName: null },
        'en',
      ),
    ).toBeNull();
  });
});
