/**
 * What every distribution has paid, cycle by cycle — the reading of it.
 *
 * pox-5 computes rewards every 1050 burn blocks — half a reward cycle — so a
 * cycle is paid in two goes, and `src/data/stx-only-history.json` keeps a line
 * for each of them. It is written by the hourly refresh, because the chain
 * does not keep it: `rewards-per-token-for-cycle` accumulates across a cycle,
 * so after the second payout there is no way to tell what the first one paid.
 * Only a run that happened in between ever saw it.
 *
 * Pure, and separate from the hook that fetches the file, so that the phone
 * app can group and validate the same data without pulling in a browser's
 * `fetch`-on-mount and the build-time environment behind it.
 */

import { rateFromRewardsPerUstx } from './rewards-rate';
import type { StxOnlyDistribution, StxOnlyHistory } from './types';

/*
 * Written by a script in this repo and served from its own branch, so this is
 * not a trust boundary — but a shape that changed under a build still sitting
 * in somebody's cache should read as "nothing on file" rather than white-screen
 * the page.
 */
export function isStxOnlyHistory(value: unknown): value is StxOnlyHistory {
  if (typeof value !== 'object' || value === null) return false;
  const history = value as Partial<StxOnlyHistory>;
  if (!Array.isArray(history.distributions)) return false;
  return history.distributions.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.cycle === 'number' &&
      typeof entry.burnHeight === 'number' &&
      typeof entry.firstOfCycle === 'boolean' &&
      // The page does BigInt arithmetic on these, so anything that is not a
      // plain count — or an honest null, for a rate nobody could work out —
      // has to be caught here rather than at the first render.
      /^\d+$/.test(String(entry.cumulativeRewardsPerUstx)) &&
      (entry.rateSatsPer1000Stx === null ||
        /^\d+$/.test(String(entry.rateSatsPer1000Stx))),
  );
}

export interface CycleDistributions {
  cycle: number;
  /** The cycle's two payouts, in the order they happened. */
  payouts: StxOnlyDistribution[];
  /**
   * What the whole cycle paid, in sats per 1000 STX, or null while it is
   * still paying.
   *
   * Taken from the last payout's cumulative figure rather than by adding the
   * two rates up: each of those is rounded down to a whole sat on its own, so
   * adding them loses up to a sat that the cycle really did pay.
   */
  totalSatsPer1000Stx: bigint | null;
  /** True once both of the cycle's payouts have been computed. */
  complete: boolean;
}

/**
 * The distributions grouped into their cycles, newest cycle first.
 *
 * A cycle is complete when both its payouts are on file. Until then the page
 * says so rather than presenting half a cycle as a cycle — the difference
 * between "this cycle paid 350" and "this cycle has paid 350 so far" is the
 * difference between a fact and a number somebody might act on.
 */
export function byCycle(
  distributions: readonly StxOnlyDistribution[],
): CycleDistributions[] {
  const cycles = new Map<number, StxOnlyDistribution[]>();
  for (const entry of distributions) {
    const kept = cycles.get(entry.cycle) ?? [];
    kept.push(entry);
    cycles.set(entry.cycle, kept);
  }

  return [...cycles.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cycle, unsorted]) => {
      const payouts = [...unsorted].sort((a, b) => a.burnHeight - b.burnHeight);
      const complete =
        payouts.length >= 2 &&
        payouts.some((p) => p.firstOfCycle) &&
        payouts.some((p) => !p.firstOfCycle);
      const last = payouts[payouts.length - 1];
      return {
        cycle,
        payouts,
        complete,
        totalSatsPer1000Stx: complete
          ? rateFromRewardsPerUstx(BigInt(last.cumulativeRewardsPerUstx))
          : null,
      };
    });
}
