/**
 * Implementations we have read, keyed by canonical source hash.
 *
 * Same idea as signer-sidekick's reviewed manager artifacts: a signer is
 * recognised by what its code hashes to, not by what it is called. Anyone can
 * deploy a contract named "…signer-manager"; only the hash says whether it is
 * the same code as one that has been looked at.
 *
 * Most of the ~27 deployed signers are redeployments of just five
 * implementations, so this list stays short. A signer whose hash is missing
 * here is shown as unreviewed rather than being given a feature badge.
 *
 * Regenerate the hashes with `pnpm generate:signers`, which prints the hash of
 * anything it cannot match.
 */

export interface ManagerProfile {
  id: string;
  /** Short name a non-technical reader can hold on to. */
  name: string;
  /** One sentence, plain language, no Clarity. */
  summary: string;
}

export const PROFILES: Record<string, ManagerProfile> = {
  '004da6bde5f91b9cdf555a020494cab73d29cc75733ad0c05e4f4b32a94e251b': {
    id: 'reference',
    name: 'Standard pool contract',
    summary:
      'The widely used contract. Open to everyone, can pay rewards to a Bitcoin address, and the pool sets its own fee.',
  },
  a8784bc243b75f1c5faf5b6fab08eee8f23bfa294af07f29022398ef636480d9: {
    id: 'fastpool',
    name: 'Fast Pool contract',
    summary:
      "Fast Pool's own version of the standard contract. Open to everyone, and can pay rewards to a Bitcoin address.",
  },
  '7fd58a7591ff0ae1643eb7e71ea2867385bcac237a3ea819f52301310c0d2e27': {
    id: 'xverse',
    name: 'Xverse contract',
    summary:
      "Xverse's version of the standard contract. Open to everyone, and can pay rewards to a Bitcoin address.",
  },
  '5cb86a1cff402c4f1f22c0121c13a329c5770e9f1d682eb0bda1841b0c7f0d1f': {
    id: 'invite-only',
    name: 'Invite-only contract',
    summary:
      'A small contract where the operator picks who may join. Rewards are paid as sBTC on Stacks, not to a Bitcoin address.',
  },
  '06a2f8f322083070486e232724443e37f6136dd6f6922943ba4115ebc6a1a8bd': {
    id: 'native-pool',
    name: 'Native Pool contract',
    summary:
      'You join through the Native Pool contract rather than staking directly. Rewards are paid as sBTC on Stacks.',
  },
  df6c31efb0bb9690cbd1a260e62ce8395f8f150942379835d7c1c4fe12aee7fe: {
    id: 'juice-pool',
    name: 'Juice Pool contract',
    summary:
      'Open to everyone and pays rewards as sBTC on Stacks. The pool can pause new joins, and a fee change has to be announced before it takes effect.',
  },
};

export function profileFor(canonicalSha256: string): ManagerProfile | null {
  return PROFILES[canonicalSha256] ?? null;
}
