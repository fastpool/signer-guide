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
  '09aa95c7bdeb5ba47970ef47eec3122bf1e1c38ac796799622bc9a4a48c0867e': {
    id: 'standard',
    name: 'Standard',
    summary:
      'The most widely used signer contract. Open to everyone, can pay rewards to a Bitcoin address, and the pool sets its own fee.',
    detail:
      'This is the reference contract most pools run unchanged. It turns nobody away: anyone can stake with a pool using it, without an invitation. If you give it a Bitcoin address when you stake, it remembers it and your rewards go to Bitcoin rather than arriving as sBTC on Stacks. Each pool running it sets its own fee and can change that fee later.',
  },
  '1b7c3674ac0dbb5da092b5e2e07684c06c7079cfb0053bd7c8b7e36211bdd74c': {
    id: 'xverse',
    name: 'Xverse',
    summary:
      "Xverse's version of the Standard contract. Open to everyone, and can pay rewards to a Bitcoin address.",
    detail:
      'The build used by the Xverse signers. For anyone staking it behaves like the Standard contract: open to everyone, and rewards can go to a Bitcoin address. It is close to the Standard contract but not the same — when it pays a staker out it reports only the amount, where the Standard contract also reports the Bitcoin withdrawal it opened. That is a real difference in the code, not just formatting, so it is listed on its own.',
  },
  d5718c4d8771628da0a24e4345534b4c9ec630f7942cdfd47c5fe3075c69b6b4: {
    id: 'invite-only',
    name: 'Invite-only',
    summary:
      'A small signer contract where the operator chooses who may join. Rewards arrive as sBTC on Stacks.',
    detail:
      'A short contract that checks you against a list the operator controls before letting you stake. If you are not on it, staking is refused. It has no Bitcoin payout option, so rewards arrive as sBTC on Stacks, and it carries no fee of its own — which does not mean staking is free, because a fee may be taken elsewhere.',
  },
  '8925fa8554e7d42ccce00f760b26d31d6c672a9a9c5b1d04755971b6c820e62f': {
    id: 'native-pool',
    name: 'Native Pool',
    summary:
      'You join through the Native Pool contract rather than staking directly. Rewards arrive as sBTC on Stacks.',
    detail:
      'This signer only accepts you if you have already joined through the Native Pool contract, so you sign up there rather than staking with the signer directly. Rewards arrive as sBTC on Stacks. It carries no fee of its own; any fee is handled by the Native Pool contract it works with.',
  },
  d6c5e82af733250d80b38be57d02c5ff6677ec2712e31d00381899e3fecc6874: {
    id: 'capped-fee',
    name: 'Capped Fee',
    summary:
      'Open to everyone, can pay rewards to a Bitcoin address, and the fee can never go above 5% — with a month\u2019s warning before any rise.',
    detail:
      'Open to everyone, with no invitation needed, and it can pay your rewards to a Bitcoin address rather than as sBTC on Stacks. What sets it apart is that it ties the operator\u2019s hands about money. The fee can never exceed 5% however the operator behaves, because the contract refuses a higher one. A rise in the fee has to be queued two reward cycles ahead, roughly a month, so you have time to move before it applies — a cut takes effect at once. You can also change where your Bitcoin goes, and the smallest payout you will accept, without staking again.',
  },
  '2aea99cfe42ccb9b9dd541d34c21cd852c5726f1c0933f4cc15c77202fcd30ac': {
    id: 'juice-pool',
    name: 'Juice Pool',
    summary:
      'Open to everyone and pays rewards as sBTC on Stacks. Fee changes have to be announced before they take effect.',
    detail:
      'Open to everyone, with no invitation needed. Rewards arrive as sBTC on Stacks rather than to a Bitcoin address. Two things set it apart: the operator can pause new staking, and a change of fee has to be proposed first and confirmed in a second step, so it cannot change without warning.',
  },
};

export function profileFor(groupSha256: string): ManagerProfile | null {
  return PROFILES[groupSha256] ?? null;
}

export function profileById(id: string): ManagerProfile | null {
  return Object.values(PROFILES).find((p) => p.id === id) ?? null;
}
