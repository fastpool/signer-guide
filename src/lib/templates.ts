import { PROFILES, type ManagerProfile } from './profiles';
import type { Signer } from './types';

/**
 * A signer contract together with every pool running it.
 *
 * Features are read off the first pool rather than each: pools in a group
 * share a group hash, which means the same code, which means the same
 * answers. Grouping is the point — it turns "21 pools" into the handful of
 * contracts a reader actually has to understand.
 */
export interface Template {
  profile: ManagerProfile;
  signers: Signer[];
  bitcoinRewards: boolean;
  openToAnyone: boolean;
  maxFeeBips: number | null;
  feeChangeNotice: Signer['feeChangeNotice'];
  feeExemption: Signer['feeExemption'];
  evidence: Signer['evidence'];
  groupSha256: string;
  /**
   * The icon every pool in the group shows, or null when they do not all show
   * the same one.
   *
   * The only field here not simply taken off the first pool. Grouping is on
   * our own hash; the identicon hash is SIP-043's, taken from a different
   * standardisation of the source. They agree on everything deployed today,
   * and a page-level icon that quietly showed one pool's when they disagreed
   * would be a claim about the others that nobody checked.
   */
  identiconHash: string | null;
}

export function buildTemplates(signers: Signer[]): Template[] {
  const byProfile = new Map<string, Signer[]>();

  for (const signer of signers) {
    if (!signer.profileId) continue;
    const group = byProfile.get(signer.profileId) ?? [];
    group.push(signer);
    byProfile.set(signer.profileId, group);
  }

  const templates: Template[] = [];
  for (const [profileId, group] of byProfile) {
    const profile = Object.values(PROFILES).find((p) => p.id === profileId);
    if (!profile) continue;
    const first = group[0];
    templates.push({
      profile,
      signers: group,
      bitcoinRewards: first.bitcoinRewards,
      openToAnyone: first.openToAnyone,
      maxFeeBips: first.maxFeeBips,
      feeChangeNotice: first.feeChangeNotice,
      feeExemption: first.feeExemption,
      evidence: first.evidence,
      groupSha256: first.groupSha256,
      identiconHash: group.every((s) => s.identiconHash === first.identiconHash)
        ? first.identiconHash
        : null,
    });
  }

  // Most-used first: the contract most pools run is the one most readers need.
  return templates.sort((a, b) => b.signers.length - a.signers.length);
}

export function templateFor(
  templates: Template[],
  profileId: string,
): Template | null {
  return templates.find((t) => t.profile.id === profileId) ?? null;
}
