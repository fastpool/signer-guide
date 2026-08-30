/**
 * What archiving a contract type is allowed to mean.
 *
 * `archived` takes a whole contract type out of the guide's lists: the type is
 * not offered among the ones to choose between, and every pool running it
 * disappears from the pool list with it. That is the strongest thing the flag
 * does, and it is why it may only be set once nothing that implements it is
 * still in use.
 *
 * It has been set on code that was in use. `signer-manager-bond-v2` replaced
 * six bond contracts, and the flag went onto the group hash they share — which
 * is also the hash of seven other pools that had not moved and were looking
 * after 80.5 million STX between them. All thirteen left the list at once, and
 * the line under the heading went on adding up the pools that were left, so
 * the guide printed a total 80.5 million STX short of what pox-5 was holding.
 * Nothing looked broken; the number was simply wrong.
 *
 * Deployed is not the same as in use, and the rule is about the second: the
 * six replaced bond contracts are empty in every cycle on file and do not hold
 * the type back. It is the seven pools still holding STX that do, and they
 * are the whole of the difference between a type nobody should be choosing and
 * a type that would take somebody's money off the page. Once they empty, the
 * flag becomes true of this type on its own, and this test stops objecting.
 *
 * That is also what keeps the total honest: a type with nothing in use behind
 * it holds nothing, so leaving it out of the lists cannot leave money out of
 * the sum. `scripts/staked-total.test.ts` checks the other end of it, against
 * what pox-5 says it is holding.
 *
 * A pool that starts being used again fails this, which is the point — the
 * hourly refresh runs it before it commits, and someone should look. Replaced
 * code that pools are still running is what the badge on the contract's own
 * page is for. It says so where somebody staked with it will read it, without
 * taking their pool off the page.
 */

import { describe, expect, it } from 'vitest';
import signersData from '../data/signers.json';
import totalsData from '../data/totals.json';
import { inUse } from './activity';
import { PROFILES } from './profiles';
import type { LockedTotals, SignerData } from './types';

const signers = (signersData as SignerData).signers;
const totals = totalsData as LockedTotals;

/**
 * The pools running one contract type that the guide cannot show to be idle.
 *
 * `inUse` is the page's own question, asked here for the same reason it is
 * asked there: an amount the refresh could not read is not evidence of an
 * empty pool, and a pool registered this week holds nothing because the cycles
 * on file were locked in before it existed. Neither is a reason to take a
 * contract type off the page.
 */
const stillUsed = (implementing: (signer: SignerData['signers'][number]) => boolean) =>
  signers
    .filter(implementing)
    .filter((signer) => inUse(signer, totals))
    .map((signer) => signer.contractId);

describe('an archived contract type', () => {
  it('is only ever code that nothing in use implements', () => {
    for (const [groupSha256, profile] of Object.entries(PROFILES)) {
      if (!profile.archived) continue;

      // By hash, which is what "implements this type" means here: a signer is
      // recognised by what its code adds up to, not by what it is called.
      const used = stillUsed((signer) => signer.groupSha256 === groupSha256);

      expect(
        used,
        `${profile.name} is archived, and these are still in use`,
      ).toEqual([]);
    }
  });

  it('has no pools in use grouped under it either', () => {
    // The lists are built from `profileId` rather than the hash — see
    // buildTemplates — so a type archived while pools in use point at it would
    // still take them off the page, however the hashes fell out.
    for (const profile of Object.values(PROFILES)) {
      if (!profile.archived) continue;

      const used = stillUsed((signer) => signer.profileId === profile.id);

      expect(
        used,
        `${profile.id} is archived, and these are still in use`,
      ).toEqual([]);
    }
  });
});
