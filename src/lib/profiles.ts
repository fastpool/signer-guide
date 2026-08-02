/**
 * Signer contracts we have read, keyed by their GROUP hash
 * (`strictCanonicalizeClaritySource`), not the sidekick-compatible canonical
 * one.
 *
 * Same idea as signer-sidekick's reviewed manager artifacts: a signer is
 * recognised by what its code hashes to, not by what it is called. Anyone can
 * deploy a contract named "…signer-manager"; only the hash says whether it is
 * the same code as one that has been looked at.
 *
 * Most of the deployed signers are redeployments of just a few contracts, so
 * this list stays short. A signer whose hash is missing here is shown as
 * unreviewed rather than being given a badge.
 *
 * The group hash is used because contracts get reformatted: Fast Pool's
 * signer is the Standard contract with three spaces moved, and keying on the
 * canonical hash listed it as a separate contract. The group hash ignores
 * whitespace beside parens, so a reformatted redeployment lands in the right
 * entry on its own.
 *
 * Regenerate with `pnpm generate:signers`, which prints the hash of anything
 * it cannot match.
 */
import profiles from '../data/profiles.json';
export interface ManagerProfile {
  id: string;
  /** Short capitalised name, e.g. "Standard". Rendered as "… signer contract". */
  name: string;
  /** One sentence, plain language, no Clarity. */
  summary: string;
  /** A paragraph or two for the contract's own page. */
  detail: string;
}

export const PROFILES: Record<string, ManagerProfile> = profiles;

export function profileFor(groupSha256: string): ManagerProfile | null {
  return PROFILES[groupSha256] ?? null;
}

export function profileById(id: string): ManagerProfile | null {
  return Object.values(PROFILES).find((p) => p.id === id) ?? null;
}
