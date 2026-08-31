/**
 * What the filters over the pool list mean.
 *
 * These lived in `App.tsx` while the web page was the only thing that had
 * filters. The phone app now shows the same judgements — a fee of 95% is a
 * fee of 95% on either screen — and two copies of a threshold is how one of
 * them ends up at 90% for a release nobody notices. So the rules are here,
 * beside the staking rules and the rate arithmetic that both apps already
 * share, and each app keeps only its own chips, copy and layout.
 *
 * Every rule is written so that a number the guide could not read is never
 * evidence of anything. A pool whose fee is unreadable is neither cheap nor
 * ruinous; a pool with no amounts on file is not unused. Silence is not a
 * value, and a filter that treats it as one hides pools for a rate limit.
 */

import { inUse } from './activity';
import type { LockedTotals, Signer } from './types';

/** A fee we would call low. Not a promise — the pool can change it. */
export const LOW_FEE_BIPS = 500; // 5%

/** A ceiling we would call reassuring. Juice Pool enforces exactly this. */
export const CAPPED_FEE_BIPS = 2000; // 20%

/**
 * A fee that leaves the staker nothing worth having.
 *
 * Four pools charge 99.99% today, and none of them is a contract with a
 * ceiling — the fee is simply set that high, and each of them is holding a
 * million STX. The threshold is 95% rather than 100% because a pool that keeps
 * ninety-five percent of the rewards has done the same thing to the staker as
 * one that keeps all of it, and rounding is not a defence.
 */
export const HIGH_FEE_BIPS = 9500; // 95%

export type FilterId =
  | 'inUse'
  | 'bitcoin'
  | 'lowFee'
  | 'cappedFee'
  | 'highFee'
  | 'feeNotice'
  | 'open';

/** Every filter, in the order they are offered. */
export const FILTER_IDS: FilterId[] = [
  'inUse',
  'bitcoin',
  'lowFee',
  'cappedFee',
  'highFee',
  'feeNotice',
  'open',
];

/**
 * The one filter that starts on.
 *
 * Half the registered signers hold nothing and never have, and a reader
 * choosing a pool is not helped by scrolling past them. Everything else here
 * narrows a list the reader has already been shown; this one decides what the
 * list is, so it is the only one that has any business being on by default —
 * and the count beside it says what it is keeping out.
 */
export const DEFAULT_FILTERS: FilterId[] = ['inUse'];

/**
 * Does this pool keep almost the whole reward?
 *
 * Its own function because it is the one judgement here that is worth making
 * outside a filter: the phone app has no chips, and a fee this size has to be
 * legible in a row somebody is only scrolling past.
 */
export function isHighFee(signer: Signer): boolean {
  return signer.feeBips !== null && signer.feeBips >= HIGH_FEE_BIPS;
}

/** The other end of the same rule. */
export function isLowFee(signer: Signer): boolean {
  return signer.feeBips !== null && signer.feeBips <= LOW_FEE_BIPS;
}

export function matches(
  signer: Signer,
  active: Set<FilterId>,
  totals?: LockedTotals,
): boolean {
  // Totals are optional so a caller with none is not silently told a pool is
  // unused: with nothing to check against, this filter keeps everything.
  if (active.has('inUse') && totals && !inUse(signer, totals)) return false;
  if (active.has('bitcoin') && !signer.bitcoinRewards) return false;
  if (active.has('open') && !signer.openToAnyone) return false;
  if (active.has('cappedFee')) {
    // A ceiling the code enforces, unlike the fee itself which can move.
    if (signer.maxFeeBips === null || signer.maxFeeBips > CAPPED_FEE_BIPS) {
      return false;
    }
  }
  if (active.has('feeNotice') && !signer.feeChangeNotice) return false;
  if (active.has('lowFee')) {
    // A pool with no fee in its own contract is not counted as low: the fee
    // may simply live somewhere else. Better to leave it out than to promise.
    if (!isLowFee(signer)) return false;
  }
  if (active.has('highFee')) {
    // The mirror of the rule above, and for the same reason: a fee this page
    // could not read is not evidence of a fee this high. Only a number the
    // contract actually gave up counts.
    if (!isHighFee(signer)) return false;
  }
  return true;
}
