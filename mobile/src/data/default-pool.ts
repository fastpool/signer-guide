import type { Signer } from '@guide/lib/types';
import type { Template } from '@guide/lib/templates';
import { isJoinable, stakedUstx, templatesFrom } from './signers';
import type { Snapshot } from './snapshot';

/**
 * The pool offered to somebody who has not asked to choose one.
 *
 * It is Fast Pool Max500, and Fast Pool wrote this app. That is a preference,
 * not a rule, and the screen says so in those words — the alternative was to
 * dress it up as a neutral filter that happened to land on its author's own
 * pool, which is the one thing a guide that ranks its rivals cannot do.
 *
 * What can be said for it on the merits, and is checkable on the pool's own
 * page: it runs the **Capped Fee** contract, so the fee cannot go above 5% and
 * a rise has to be announced a month ahead; it takes a stake from anyone; and
 * it can pay rewards to a Bitcoin address. Everything about that is read off
 * the chain by the same detectors that read every other pool.
 *
 * Changing it is one tap, from the row that names it.
 *
 * If it is ever unregistered or closed, the fallback below picks by rule
 * instead — a contract that has been read, open to anyone, lowest fee, largest
 * on a tie. A default that has stopped working is worse than one somebody
 * disagrees with.
 */
export const PREFERRED_POOL =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';

export type DefaultPool = {
  signer: Signer;
  template: Template;
  stakedUstx: bigint | null;
  /** How many other pools would have been offerable. */
  alternatives: number;
  /**
   * True when this is the pool the app prefers, false when it fell back to
   * the rule because that pool is not currently offerable.
   */
  preferred: boolean;
};

export function defaultPool(snapshot: Snapshot): DefaultPool | null {
  const templates = templatesFrom(snapshot);

  /*
   * Walking the templates rather than the signers is what keeps the fallback
   * to contracts that have been read: `buildTemplates` only groups pools whose
   * contract has a profile, so a pool running code nobody here has read is
   * never in this list to begin with.
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

  const preferred = candidates.find(
    (candidate) => candidate.signer.contractId === PREFERRED_POOL,
  );

  candidates.sort((a, b) => {
    const fee = (a.signer.feeBips ?? 0) - (b.signer.feeBips ?? 0);
    if (fee !== 0) return fee;
    const left = stakedUstx(snapshot.totals, a.signer.contractId) ?? 0n;
    const right = stakedUstx(snapshot.totals, b.signer.contractId) ?? 0n;
    if (left !== right) return right > left ? 1 : -1;
    return a.signer.contractId.localeCompare(b.signer.contractId);
  });

  const chosen = preferred ?? candidates[0];
  return {
    signer: chosen.signer,
    template: chosen.template,
    stakedUstx: stakedUstx(snapshot.totals, chosen.signer.contractId),
    alternatives: candidates.length - 1,
    /** False when the preferred pool was not offerable and the rule chose. */
    preferred: preferred !== undefined,
  };
}
