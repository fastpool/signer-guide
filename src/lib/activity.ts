/**
 * Whether a pool is being used, and whether it has had a chance to be.
 *
 * A third of the registered signers hold nothing and never have. They are real
 * contracts and the guide should not pretend otherwise, but a reader choosing
 * where to stake is not helped by scrolling past them — so the list hides them
 * by default and says how many of the total it is showing.
 *
 * Hiding is the strongest thing this page does to a pool, so it takes more
 * than an absence to earn it. Two things have to be true: every cycle on file
 * says the pool is empty — not "we could not read it", and not "it is not in
 * this file" — and the guide has had a cycle in which somebody could have
 * staked with it. A pool registered this week holds nothing because stacking
 * for the cycles on file was locked in before it existed, and hiding it would
 * make a new pool's first impression of this guide be that it does not exist.
 */

import type { LockedTotals, Signer } from './types';

/** Cycles the guide has amounts for: the one before, now, and the one filling. */
function amountsIn(totals: LockedTotals): Record<string, string | null>[] {
  return [totals.previous?.ustx, totals.ustx, totals.next?.ustx].filter(
    (ustx): ustx is Record<string, string | null> => ustx !== undefined,
  );
}

/** Anything staked with this pool in any cycle the guide has amounts for. */
export function hasStake(contractId: string, totals: LockedTotals): boolean {
  return amountsIn(totals).some((ustx) => {
    const amount = ustx[contractId];
    return (
      typeof amount === 'string' && /^\d+$/.test(amount) && BigInt(amount) > 0n
    );
  });
}

/**
 * Every cycle on file says this pool is empty, and every one of them was read.
 *
 * The distinction is the whole point. `null` is the node refusing to answer
 * and a missing entry is a pool the file has never covered; neither is
 * evidence that nobody stakes there, and hiding a pool on either would be a
 * rate limit deciding what a reader gets to see.
 */
export function isKnownEmpty(
  contractId: string,
  totals: LockedTotals,
): boolean {
  const readings = amountsIn(totals).map((ustx) => ustx[contractId]);
  if (readings.length === 0) return false;
  return readings.every(
    (amount) =>
      typeof amount === 'string' && /^\d+$/.test(amount) && BigInt(amount) === 0n,
  );
}

/**
 * Whether the guide has only just started seeing this pool.
 *
 * "Just" is this cycle or the one before it, because stacking for a cycle is
 * locked in before that cycle begins: a pool first seen during 141 could not
 * be in 141's amounts however popular it is.
 *
 * A pool with no first sighting on file was written before the guide recorded
 * one, which is itself evidence that it is not new.
 */
export function isNewSigner(signer: Signer, cycle: number): boolean {
  return (
    typeof signer.firstSeenCycle === 'number' &&
    signer.firstSeenCycle >= cycle - 1
  );
}

/** What the "in use" filter keeps: everything it cannot show to be idle. */
export function inUse(signer: Signer, totals: LockedTotals): boolean {
  return (
    !isKnownEmpty(signer.contractId, totals) ||
    isNewSigner(signer, totals.cycle)
  );
}
