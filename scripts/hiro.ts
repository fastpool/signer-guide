/**
 * A GET against the API, with the one retry policy this repo has.
 *
 * `scripts/pox5.ts` does this for read-only calls; the reports need the same
 * for the indexed endpoints (balances, the staking index, token metadata).
 * Same rule as everywhere else here: a 429 is waited out, and what comes back
 * on failure is null — "the API did not answer" — never an empty object that
 * a caller could mistake for an address holding nothing.
 */

import { nodeHeaders, RETRY_DELAYS_MS, sleep } from './node.js';

export interface GetJsonResult<T> {
  /** Null when the API would not answer, including after its retries. */
  value: T | null;
  /** True for a 404 — the API answered, and the answer is "no such thing". */
  missing: boolean;
}

export async function getJson<T>(url: string): Promise<GetJsonResult<T>> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: nodeHeaders() });
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (response.status === 404) return { value: null, missing: true };
      if (!response.ok) return { value: null, missing: false };
      return { value: (await response.json()) as T, missing: false };
    } catch {
      // Offline or blocked — no amount of retrying fixes that.
      return { value: null, missing: false };
    }
  }
}
