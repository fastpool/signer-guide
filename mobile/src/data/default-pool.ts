import type { Signer } from '@guide/lib/types';
import type { Template } from '@guide/lib/templates';
import { isJoinable, stakedUstx, templatesFrom } from './signers';
import type { Snapshot } from './snapshot';

/**
 * The pool to offer somebody who has not asked to choose one.
 *
 * A default is a recommendation whether it is called one or not, so the rule
 * is written down here rather than left to whatever the list happened to sort
 * first, and the screen that uses it says what the rule was.
 *
 * In order, and each one a filter rather than a score:
 *
 *  1. **The contract has been read.** A pool whose code nobody here has looked
 *     at may be perfectly good; it is not something to hand a newcomer without
 *     being able to say what it does.
 *  2. **Registered, and open to anyone.** Anything else is a stake the chain
 *     would refuse after the fee was paid.
 *  3. **The lowest fee**, because it is the one number where less is plainly
 *     better for the person staking and nothing is traded away for it.
 *  4. **Then the largest**, as the tie-break. Size is not quality, but among
 *     pools that are otherwise equal it is the one that has been running
 *     longest under the most eyes.
 *
 * Fast Pool wrote this app and runs some of these pools. That is exactly why
 * the rule is a rule and not a preference: it is applied to every pool the same
 * way, it does not know who deployed anything, and the screen shows which pool
 * it landed on and offers to change it.
 */
export type DefaultPool = {
  signer: Signer;
  template: Template;
  stakedUstx: bigint | null;
  /** How many other pools passed the same filters. */
  alternatives: number;
};

export function defaultPool(snapshot: Snapshot): DefaultPool | null {
  const templates = templatesFrom(snapshot);

  /*
   * Walking the templates rather than the signers is what enforces rule 1:
   * `buildTemplates` only groups pools whose contract has a profile, so a pool
   * running code nobody here has read is never in this loop to begin with.
   */
  const candidates: { signer: Signer; template: Template }[] = [];
  for (const template of templates) {
    for (const signer of template.signers) {
      if (!isJoinable(signer)) continue;
      if (signer.feeBips === null || signer.feeBips === undefined) continue;
      candidates.push({ signer, template });
    }
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const fee = (a.signer.feeBips ?? 0) - (b.signer.feeBips ?? 0);
    if (fee !== 0) return fee;
    const left = stakedUstx(snapshot.totals, a.signer.contractId) ?? 0n;
    const right = stakedUstx(snapshot.totals, b.signer.contractId) ?? 0n;
    if (left !== right) return right > left ? 1 : -1;
    return a.signer.contractId.localeCompare(b.signer.contractId);
  });

  const [best] = candidates;
  return {
    signer: best.signer,
    template: best.template,
    stakedUstx: stakedUstx(snapshot.totals, best.signer.contractId),
    alternatives: candidates.length - 1,
  };
}
