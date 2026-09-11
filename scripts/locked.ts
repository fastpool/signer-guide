/**
 * How much STX each pool is looking after, read from pox-5.
 *
 * This runs in the refresh, not in the browser: `scripts/generate-totals.ts`
 * asks pox-5 once an hour and commits the answers as `src/data/totals.json`,
 * which the page then imports like any other data. The alternative — every
 * visitor asking the node about every pool — puts the guide's whole readership
 * on a public endpoint to fetch a number that barely moves between blocks, and
 * needs a proxy and a key the moment more than a few people read it. One read
 * an hour for everyone costs nothing and needs nothing.
 *
 * Anything that fails reads as "not known" rather than as zero. A pool shown
 * as empty when it is not would be a lie about somebody's money.
 */

import {
  parseUint,
  serializeContractPrincipal,
  serializeUint,
} from '../src/lib/clarity.js';
import type { LockedTotals } from '../src/lib/types.js';
import { sleep, SPACING_MS } from './node.js';
import { callReadOnly, fetchCurrentCycle } from './pox5.js';

/**
 * Whether the next cycle's staked amounts can still move.
 *
 * pox-5 freezes the next reward cycle's staker set for the last
 * `pox-prepare-cycle-length` blocks of the current one, and refuses every call
 * that would change it — `stake`, `stake-update`, `unstake`, `unstake-sbtc`,
 * `register-for-bond`, `update-bond-registration` and `announce-l1-early-exit`
 * all assert on it. So during that window `next` is not a running total that
 * happens to be current: it is the final figure, and a page calling it "still
 * filling" understates a settled number.
 *
 * Asked of pox-5 rather than worked out from block heights here, because the
 * contract's own answer is the one that decides whether a stake goes through.
 * Null when it could not be read — the page then says nothing about it rather
 * than guessing, which is the same rule as every other reading in this file.
 */
export async function fetchNextCycleLockedIn(
  currentCycle: number,
): Promise<boolean | null> {
  const result = await callReadOnly('is-in-prepare-phase', [
    `0x${serializeUint(currentCycle)}`,
  ]);
  // Clarity bools on the wire: 0x03 is true, 0x04 is false.
  if (result === '0x03') return true;
  if (result === '0x04') return false;
  return null;
}

/** uSTX pox-5 will count for this signer in this cycle; null if unreadable. */
export async function fetchAmountDelegated(
  contractId: string,
  rewardCycle: number,
): Promise<bigint | null> {
  let signerArg: string;
  try {
    signerArg = serializeContractPrincipal(contractId);
  } catch {
    return null;
  }
  const result = await callReadOnly('get-amount-delegated-for-signer', [
    `0x${signerArg}`,
    `0x${serializeUint(rewardCycle)}`,
  ]);
  return result === null ? null : parseUint(result);
}

/**
 * One pool at a time, spaced out. Asking two at once with no gap got nine
 * pools in and then earned a 429 for the remaining fourteen, which the page
 * would have shown as "amount not known" for an hour — a rate limit reported
 * as ignorance about somebody's money. How long the gap is depends on whether
 * we are anonymous; see `SPACING_MS` in node.ts.
 */
async function readCycle(
  contractIds: string[],
  rewardCycle: number,
): Promise<Record<string, string | null>> {
  const ustx: Record<string, string | null> = {};

  for (const contractId of contractIds) {
    const amount = await fetchAmountDelegated(contractId, rewardCycle);
    ustx[contractId] = amount === null ? null : amount.toString();
    await sleep(SPACING_MS);
  }

  return ustx;
}

/**
 * Read every pool's total, for the cycle worth showing and the one after it.
 *
 * pox-5 went live part-way through cycle 140, and nothing is locked with it
 * until 141 — so during that window the current cycle reads as zero
 * everywhere. A page of zeros tells a reader nothing, so when every pool we
 * could read has nothing, the cycle being filled is the one shown. Once a
 * pox-5 cycle is the current one this never runs.
 *
 * The next cycle is worth reading because it is not a copy: pox-5 answers for
 * a future cycle with what is delegated for it *so far*, so somebody who
 * unstaked this cycle is already gone from it. Only one cycle ahead, though —
 * a cycle after that answers the same as the next one, since nothing can yet
 * have changed between them, and printing the same number twice under two
 * headings would tell a reader something that is not true.
 *
 * When the fallback above ran, the cycle being shown is already the one
 * filling, so there is no further cycle to show and `next` is left out.
 */
export async function readLockedTotals(
  contractIds: string[],
): Promise<LockedTotals | null> {
  const currentCycle = await fetchCurrentCycle();
  if (currentCycle === null) return null;

  let cycle = currentCycle;
  let ustx = await readCycle(contractIds, cycle);

  const answered = Object.values(ustx).filter((v) => v !== null);
  if (answered.length === 0) return null;
  if (answered.every((v) => v === '0')) {
    cycle = currentCycle + 1;
    ustx = await readCycle(contractIds, cycle);
    return { cycle, ustx };
  }

  const nextCycle = cycle + 1;
  const nextUstx = await readCycle(contractIds, nextCycle);
  // A cycle nobody would answer for is one we do not know about, and saying
  // nothing beats a second line built out of a handful of pools.
  if (Object.values(nextUstx).every((v) => v === null)) return { cycle, ustx };

  // Off the current cycle, not the next one: it is the current cycle's
  // prepare phase that freezes the next cycle's set.
  const lockedIn = await fetchNextCycleLockedIn(currentCycle);

  return {
    cycle,
    ustx,
    next: {
      cycle: nextCycle,
      ustx: nextUstx,
      // Left out rather than written as false when it could not be read: the
      // page has a sentence for "still filling" and a sentence for "locked
      // in", and a failed read must not pick one of them.
      ...(lockedIn === null ? {} : { lockedIn }),
    },
  };
}
