import { MAX_LOCK_CYCLES } from '@guide/lib/staking';

/**
 * What a stake is set to before anybody changes it — in one place, because
 * there are two screens that offer to make one.
 *
 * They had drifted: the guided screen said two weeks and sBTC, the full form
 * said ninety-six cycles and a Bitcoin address, and the guided screen's own
 * "change this" link led to a form that disagreed with the row it came from.
 * A default that changes depending on which door you came through is not a
 * default, it is two.
 */

/**
 * The whole of pox-5's maximum, which is what the staking package's own
 * `MAX_NUM_CYCLES` says — `staking.test.ts` asserts the two agree.
 *
 * A four-year lock would be an alarming default if the period were a
 * commitment, and it is not: unstaking ends a position at the close of the
 * cycle whatever period was chosen, without penalty. So the period only
 * decides how long a stake keeps earning if it is left alone, and the longest
 * is the one that asks the least of somebody afterwards.
 */
export const DEFAULT_LOCK_CYCLES = MAX_LOCK_CYCLES;

/**
 * Rewards as sBTC, in the staker's own wallet.
 *
 * The other route needs a Bitcoin address, and a mistyped one is rewards
 * nobody can recover — not checkable until the first payout, and not fixable
 * afterwards for a payout already sent. sBTC needs no address at all, so there
 * is nothing to get wrong. Somebody who wants Bitcoin can say so on the full
 * form, where the address, the fee cap and the floor are all in front of them.
 */
export const DEFAULT_REWARDS: 'sbtc' | 'bitcoin' = 'sbtc';
