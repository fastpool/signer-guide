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
 * Read every pool's total, for the cycle worth showing.
 *
 * pox-5 went live part-way through cycle 140, and nothing is locked with it
 * until 141 — so during that window the current cycle reads as zero
 * everywhere. A page of zeros tells a reader nothing, so when every pool we
 * could read has nothing, the cycle being filled is the one shown. Once a
 * pox-5 cycle is the current one this never runs.
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
  }

  return { cycle, ustx };
}
