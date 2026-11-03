/**
 * The handful of facts every pool is compared on, worked out once.
 *
 * The list row, the phone row and the key-facts block on a pool's own page
 * all say the same things about a pool — who can join, what rewards arrive
 * in, what could go wrong with the fee — and each of them used to work it out
 * for itself from the raw flags. Three copies of "is this invite-only" is how
 * the list came to call Native Pool open and its own page call it closed.
 */

import { bitcoinPayout } from './features';
import { isHighFee } from './pool-filters';
import type { Signer } from './types';

/**
 * How somebody gets into a pool.
 *
 *   anyone      the contract turns nobody away
 *   invite      the contract checks a list the operator keeps
 *   nativePool  only staking that comes through Stacking DAO's Native Pool
 *               contract is accepted — open to anyone who joins there, but
 *               not something this guide's stake button can do
 */
export type JoinMode = 'anyone' | 'invite' | 'nativePool';

export function joinMode(signer: Signer): JoinMode {
  if (signer.callApi === 'nativePool') return 'nativePool';
  return signer.openToAnyone ? 'anyone' : 'invite';
}

/**
 * What a reward can arrive as.
 *
 * A list rather than a pair of flags, because it is going to grow: every
 * contract today pays sBTC and some can pay to Bitcoin, and pools paying in
 * STX are coming. A new currency is a new member here and one more rule
 * below — the row, the phone row and the facts block draw whatever list they
 * are given.
 */
export type RewardCurrency = 'btc' | 'sbtc' | 'stx';

/** In the order they are shown: Bitcoin first, the thing people ask about. */
export const REWARD_CURRENCIES: readonly RewardCurrency[] = [
  'btc',
  'sbtc',
  'stx',
];

export function rewardCurrencies(signer: Signer): RewardCurrency[] {
  // A payout the detectors cannot see, decided by hand with a note saying
  // why. Ordered like everything else, whatever order it was written in.
  if (signer.rewardsIn && signer.rewardsIn.length > 0) {
    const given = new Set(signer.rewardsIn);
    return REWARD_CURRENCIES.filter((currency) => given.has(currency));
  }
  const currencies: RewardCurrency[] = [];
  // Only where the contract itself pays to Bitcoin. A contract that just
  // records an address for the pool to pay from is a promise of the pool's,
  // and the facts block says so separately (see `bitcoinPayout`).
  if (bitcoinPayout(signer) === 'contract') currencies.push('btc');
  // Every signer manager pox-5 accepts is handed its rewards in sBTC.
  currencies.push('sbtc');
  return currencies;
}

/**
 * What a reader should be told before they stake, worst first.
 *
 *   highFee      the fee keeps almost the whole reward (see `isHighFee`)
 *   feeUnbounded the fee can be raised at any time, to anything: no ceiling
 *                in the code and no notice before a change
 *   unreviewed   code nobody here has read
 *
 * An invite list is not here: it is a fact about who can join, not a risk
 * to somebody who has joined.
 */
export type PoolWarning = 'highFee' | 'feeUnbounded' | 'unreviewed';

export function poolWarnings(signer: Signer): PoolWarning[] {
  const warnings: PoolWarning[] = [];
  if (isHighFee(signer)) warnings.push('highFee');
  // Only for a fee the contract actually holds. A pool whose fee lives
  // somewhere else may well have a ceiling there, and this page cannot see it.
  if (
    signer.feeBips !== null &&
    signer.maxFeeBips === null &&
    signer.feeChangeNotice === null
  ) {
    warnings.push('feeUnbounded');
  }
  if (!signer.profileId) warnings.push('unreviewed');
  return warnings;
}

/** Can the stake dialog here do the staking, or does it happen elsewhere? */
export function stakesHere(signer: Signer): boolean {
  return signer.openToAnyone && (!signer.callApi || signer.callApi === 'pox5');
}
