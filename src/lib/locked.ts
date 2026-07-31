/**
 * How much STX each pool is looking after, read from pox-5 in the browser.
 *
 * The rest of the guide is a committed file, refreshed daily. This one number
 * moves with every stake, so it is read live — but a couple of dozen
 * read-only calls per visit is not something a public node should be asked
 * for, so the answers are kept in localStorage for an hour. A reader who
 * comes back within the hour costs the node nothing.
 *
 * Anything that fails reads as "not known" rather than as zero. A pool shown
 * as empty when it is not would be a lie about somebody's money.
 */

import {
  parseUint,
  serializeContractPrincipal,
  serializeUint,
} from './clarity';

const API_URL = 'https://api.hiro.so';
const POX5 = 'SP000000000000000000002Q6VF78.pox-5';

export const CACHE_KEY = 'signer-guide:locked:v1';
export const TTL_MS = 60 * 60 * 1000;

/**
 * A burst of read-only calls from one address earns a 429 — the node allows
 * roughly 50 a minute per IP, and one page load asks about every pool. Two at
 * a time, with a retry, keeps a first visit inside that.
 */
const READ_CONCURRENCY = 2;

/** Waits before a retry. A 429 answers again in well under a second. */
const RETRY_DELAYS_MS = [700, 2_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface LockedTotals {
  /** Reward cycle the amounts are for. */
  cycle: number;
  /** uSTX per contract id as a string; null for a pool we could not read. */
  ustx: Record<string, string | null>;
  /** Epoch ms of the read, so we know when it goes stale. */
  readAt: number;
}

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
          headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch(`${API_URL}/v2/pox`);
    if (!response.ok) return null;
    const body = (await response.json()) as {
      current_cycle?: { id?: number };
    };
    return body.current_cycle?.id ?? null;
  } catch {
    return null;
  }
}

async function readCycle(
  contractIds: string[],
  rewardCycle: number,
): Promise<Record<string, string | null>> {
  const ustx: Record<string, string | null> = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < contractIds.length) {
      const contractId = contractIds[cursor++];
      const amount = await fetchAmountDelegated(contractId, rewardCycle);
      ustx[contractId] = amount === null ? null : amount.toString();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, contractIds.length) }, () =>
      worker(),
    ),
  );

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
  now: number = Date.now(),
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

  return { cycle, ustx, readAt: now };
}

export function readCache(): LockedTotals | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockedTotals;
    if (
      typeof parsed?.cycle !== 'number' ||
      typeof parsed?.readAt !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    // Private mode, a full disk, or something else wrote to this key.
    return null;
  }
}

export function isFresh(totals: LockedTotals, now: number = Date.now()) {
  // A clock that has jumped backwards should mean a re-read, not an hour of
  // trusting whatever is in storage.
  const age = now - totals.readAt;
  return age >= 0 && age < TTL_MS;
}

export function writeCache(totals: LockedTotals) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(totals));
  } catch {
    // Not being able to remember is survivable; it just means reading again.
  }
}
