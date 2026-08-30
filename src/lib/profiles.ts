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
  /**
   * Superseded code that nothing is using any more, readable but not offered.
   *
   * Two things, and the second is the one to be careful about. The code has
   * been replaced — the operator redeployed and moved on — *and* no signer
   * contract that implements it is still in use. Empty contracts do not hold
   * the type back; pools with STX in them do. Setting this takes the type out
   * of the lists and every pool running it off the page with it, so on code
   * pools are still using it, it hides somebody’s money: the line under the
   * heading adds up the pools that are left, and quietly stops matching what
   * pox-5 is holding. `src/lib/profiles.test.ts` holds the flag to that, and
   * `scripts/staked-total.test.ts` holds the total to pox-5.
   *
   * Replaced code that pools are still using is what `badge.archived` on the
   * contract’s own page is for: said where the people in it will read it,
   * without taking their pool off the page.
   *
   * The page stays where it was either way, because somebody staked with it is
   * entitled to read what they are in; it is the lists that stop leading
   * people there, and `isArchived` is what those lists ask.
   */
  archived?: boolean;
}

export const PROFILES: Record<string, ManagerProfile> = profiles;

export function profileFor(groupSha256: string): ManagerProfile | null {
  return PROFILES[groupSha256] ?? null;
}

export function profileById(id: string): ManagerProfile | null {
  return Object.values(PROFILES).find((p) => p.id === id) ?? null;
}

/** Whether a pool runs a contract type that has been superseded. */
export function isArchived(signer: { groupSha256: string }): boolean {
  return profileFor(signer.groupSha256)?.archived === true;
}
