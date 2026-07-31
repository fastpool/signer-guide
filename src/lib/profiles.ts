/**
 * Signer contracts we have read, keyed by canonical source hash.
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
 * Regenerate with `pnpm generate:signers`, which prints the hash of anything
 * it cannot match.
 */

export interface ManagerProfile {
  id: string;
  /** Short capitalised name, e.g. "Standard". Rendered as "… signer contract". */
  name: string;
  /** One sentence, plain language, no Clarity. */
  summary: string;
  /** A paragraph or two for the contract's own page. */
  detail: string;
}

export const PROFILES: Record<string, ManagerProfile> = {
  '004da6bde5f91b9cdf555a020494cab73d29cc75733ad0c05e4f4b32a94e251b': {
    id: 'standard',
    name: 'Standard',
    summary:
      'The most widely used signer contract. Open to everyone, can pay rewards to a Bitcoin address, and the pool sets its own fee.',
    detail:
      'This is the reference contract most pools run unchanged. It turns nobody away: anyone can stake with a pool using it, without an invitation. If you give it a Bitcoin address when you stake, it remembers it and your rewards go to Bitcoin rather than arriving as sBTC on Stacks. Each pool running it sets its own fee and can change that fee later.',
  },
  a8784bc243b75f1c5faf5b6fab08eee8f23bfa294af07f29022398ef636480d9: {
    id: 'fast-pool',
    name: 'Fast Pool',
    summary:
      "Fast Pool's own version of the Standard contract. Open to everyone, and can pay rewards to a Bitcoin address.",
    detail:
      "Fast Pool's own build. It behaves like the Standard contract for anyone staking: no invitation needed, and rewards can be sent to a Bitcoin address if you give one. The code is not byte-identical to the Standard contract, so it is listed separately rather than lumped in with it.",
  },
  '7fd58a7591ff0ae1643eb7e71ea2867385bcac237a3ea819f52301310c0d2e27': {
    id: 'xverse',
    name: 'Xverse',
    summary:
      "Xverse's version of the Standard contract. Open to everyone, and can pay rewards to a Bitcoin address.",
    detail:
      'The build used by the Xverse signers. Like the Standard contract it is open to everyone and can pay rewards to a Bitcoin address. Its code differs from the Standard contract, so it is shown as its own entry.',
  },
  '5cb86a1cff402c4f1f22c0121c13a329c5770e9f1d682eb0bda1841b0c7f0d1f': {
    id: 'invite-only',
    name: 'Invite-only',
    summary:
      'A small signer contract where the operator chooses who may join. Rewards arrive as sBTC on Stacks.',
    detail:
      'A short contract that checks you against a list the operator controls before letting you stake. If you are not on it, staking is refused. It has no Bitcoin payout option, so rewards arrive as sBTC on Stacks, and it carries no fee of its own — which does not mean staking is free, because a fee may be taken elsewhere.',
  },
  '06a2f8f322083070486e232724443e37f6136dd6f6922943ba4115ebc6a1a8bd': {
    id: 'native-pool',
    name: 'Native Pool',
    summary:
      'You join through the Native Pool contract rather than staking directly. Rewards arrive as sBTC on Stacks.',
    detail:
      'This signer only accepts you if you have already joined through the Native Pool contract, so you sign up there rather than staking with the signer directly. Rewards arrive as sBTC on Stacks. It carries no fee of its own; any fee is handled by the Native Pool contract it works with.',
  },
  df6c31efb0bb9690cbd1a260e62ce8395f8f150942379835d7c1c4fe12aee7fe: {
    id: 'juice-pool',
    name: 'Juice Pool',
    summary:
      'Open to everyone and pays rewards as sBTC on Stacks. Fee changes have to be announced before they take effect.',
    detail:
      'Open to everyone, with no invitation needed. Rewards arrive as sBTC on Stacks rather than to a Bitcoin address. Two things set it apart: the operator can pause new staking, and a change of fee has to be proposed first and confirmed in a second step, so it cannot change without warning.',
  },
};

export function profileFor(canonicalSha256: string): ManagerProfile | null {
  return PROFILES[canonicalSha256] ?? null;
}

export function profileById(id: string): ManagerProfile | null {
  return Object.values(PROFILES).find((p) => p.id === id) ?? null;
}
