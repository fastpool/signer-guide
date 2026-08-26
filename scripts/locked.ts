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
import { API_URL, nodeHeaders, SPACING_MS } from './node.js';

const POX5 = 'SP000000000000000000002Q6VF78.pox-5';

/** Waits before a retry, growing: a limit that bites needs more than a blink. */
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callReadOnly(
  functionName: string,
  args: string[],
): Promise<string | null> {
  const [address, name] = POX5.split('.');

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(
        `${API_URL}/v2/contracts/call-read/${address}/${name}/${functionName}`,
        {
          method: 'POST',
          headers: nodeHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ sender: address, arguments: args }),
        },
      );

      // Being told to slow down is worth waiting out: the alternative is
      // telling a reader we do not know what a pool holds when we could.
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (!response.ok) return null;

      const body = (await response.json()) as {
        okay?: boolean;
        result?: string;
      };
      return body.okay && body.result ? body.result : null;
    } catch {
      // Offline or blocked — no amount of retrying fixes that.
      return null;
    }
  }
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

async function fetchCurrentCycle(): Promise<number | null> {
  try {
    const response = await fetch(`${API_URL}/v2/pox`, {
      headers: nodeHeaders(),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      current_cycle?: { id?: number };
    };
    return body.current_cycle?.id ?? null;
  } catch {
    return null;
  }
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

  return { cycle, ustx, next: { cycle: nextCycle, ustx: nextUstx } };
}
