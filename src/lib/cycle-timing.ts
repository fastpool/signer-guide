/**
 * Where the chain is in the reward cycle, and when staking for the next one
 * closes.
 *
 * A reward cycle is 2100 burn blocks; the last 100 are its prepare phase,
 * when pox-5 freezes who is in the next cycle and refuses `stake-update` and
 * `unstake`. So the date a reader needs is not when the next cycle starts but
 * when its prepare phase does: stake after that and you are in the cycle
 * after.
 *
 * All of it is counted from the burn height at the last refresh, at ten
 * minutes a block, which is the same approximation the payout countdown
 * makes. Bitcoin blocks are not that regular, so every time here is "about".
 *
 * Pure; the phone app can use it as it is.
 */

import { BITCOIN_BLOCK_MINUTES } from './rate-view';
import type { StxOnlyCalculations } from './types';

export interface CycleTiming {
  /** The reward cycle the chain is in. */
  cycle: number;
  cycleStartHeight: number;
  /** The first block of the next cycle. */
  nextCycleStartHeight: number;
  /** The first block of this cycle's prepare phase. */
  prepareStartHeight: number;
  /** The burn height at the refresh these figures are counted from. */
  burnHeight: number;
  /** True during the prepare phase: the next cycle is already fixed. */
  inPrepare: boolean;
  /** Blocks until the prepare phase, zero once it has begun. */
  blocksUntilPrepare: number;
  blocksUntilNextCycle: number;
  /** Approximate dates, counted from the refresh. */
  cycleStartedAt: Date;
  prepareStartsAt: Date;
  nextCycleStartsAt: Date;
}

const MS_PER_BLOCK = BITCOIN_BLOCK_MINUTES * 60 * 1000;

/** Null when the file is from before the geometry was written into it. */
export function cycleTiming(
  calculations: StxOnlyCalculations,
): CycleTiming | null {
  const first = calculations.firstBurnchainBlockHeight;
  const length = calculations.rewardCycleLength;
  const prepare = calculations.prepareCycleLength;
  const height = calculations.currentBurnHeight;
  const at = Date.parse(calculations.generatedAt);
  if (
    first == null ||
    length == null ||
    prepare == null ||
    height == null ||
    length <= prepare ||
    height < first ||
    Number.isNaN(at)
  ) {
    return null;
  }

  const cycle = Math.floor((height - first) / length);
  const cycleStartHeight = first + cycle * length;
  const nextCycleStartHeight = cycleStartHeight + length;
  const prepareStartHeight = nextCycleStartHeight - prepare;
  const when = (target: number) =>
    new Date(at + (target - height) * MS_PER_BLOCK);

  return {
    cycle,
    cycleStartHeight,
    nextCycleStartHeight,
    prepareStartHeight,
    burnHeight: height,
    inPrepare: height >= prepareStartHeight,
    blocksUntilPrepare: Math.max(0, prepareStartHeight - height),
    blocksUntilNextCycle: nextCycleStartHeight - height,
    cycleStartedAt: when(cycleStartHeight),
    prepareStartsAt: when(prepareStartHeight),
    nextCycleStartsAt: when(nextCycleStartHeight),
  };
}

/**
 * "1d 17h", "5h", "40m" — a countdown from now, rounded to what matters.
 * Null once the moment has passed: the figures are an hour old at most, and a
 * countdown below zero says the file is staler than that.
 */
export function countdownParts(
  target: Date,
  now: number = Date.now(),
): { days: number; hours: number; minutes: number } | null {
  const ms = target.getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes - days * 24 * 60) / 60);
  return { days, hours, minutes: minutes - days * 24 * 60 - hours * 60 };
}
