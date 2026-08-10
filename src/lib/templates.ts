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
   * The icon most pools in the group show, or null when none of them has one
   * or two are equally common.
   *
   * The only field here not simply taken off the first pool. Grouping is on
   * our own hash; the identicon hash is SIP-043's, taken from a different
   * standardisation of the source. The two can disagree without either being
   * wrong: ours drops comments, SIP-043's keeps them, so one pool deploying
   * the group's code with the header comment stripped shares the group and
   * not the icon.
   *
   * That is why this is a majority and not a unanimous vote. Requiring
   * agreement meant a single such pool took the icon away from the twenty-one
   * others, and it took it away by showing the placeholder — which says *new
   * code, nobody has standardised it yet*, of a contract that is neither.
   * Saying nothing was the loudest wrong thing available. The pools that do
   * not show it are counted in `identiconOutliers` so the page can say so
   * rather than let the icon speak for them.
   */
  identiconHash: string | null;
  /**
   * How many pools in the group show something other than `identiconHash` —
   * a different icon, or none yet. Zero when they all agree.
   */
  identiconOutliers: number;
}

/**
 * The most common identicon hash in the group, and how many pools do not have
 * it.
 *
 * Pools with no hash of their own cannot vote — a missing hash means the
 * formatter has not been run on that source yet, not that its icon differs —
 * but they still count as outliers, because they are pools the icon does not
 * speak for.
 *
 * A tie is not a majority. Two icons with equal claim and no way to choose
 * between them is the one case where the placeholder is honest, so it is what
 * happens.
 */
function majorityIdenticon(signers: Signer[]): {
  hash: string | null;
  outliers: number;
} {
  const counts = new Map<string, number>();
  for (const signer of signers) {
    if (signer.identiconHash === null) continue;
    counts.set(
      signer.identiconHash,
      (counts.get(signer.identiconHash) ?? 0) + 1,
    );
  }

  let hash: string | null = null;
  let best = 0;
  let tied = false;
  for (const [candidate, count] of counts) {
    if (count > best) {
      hash = candidate;
      best = count;
      tied = false;
    } else if (count === best) {
      tied = true;
    }
  }

  if (hash === null || tied) return { hash: null, outliers: signers.length };
  return { hash, outliers: signers.length - best };
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
    const identicon = majorityIdenticon(group);
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
      identiconHash: identicon.hash,
      identiconOutliers: identicon.outliers,
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
