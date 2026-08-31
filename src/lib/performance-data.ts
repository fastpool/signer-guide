/**
 * Where the conduct figures come from, in a browser.
 *
 * The arithmetic is in `performance.ts`, which the phone app shares. This is
 * the half that cannot be: a bundled import and a hook. The summary — the
 * current cycle for every seated signer — ships with the guide because every
 * pool page wants it and it is twenty-six rows; the history behind it is a
 * file per key and costs a request only when somebody opens one.
 */

import summary from '../data/performance.json';
import {
  bareKey,
  isSignerPerformance,
  medianResponseIn,
  performanceIn,
} from './performance';
import { useRemoteJson, type Remote } from './remote-json';
import type {
  PerformanceData,
  SignerCyclePerformance,
  SignerPerformance,
} from './types';

export type { Remote };

export const PERFORMANCE = summary as PerformanceData;

/** This cycle's record for a key, or null for one the file does not carry. */
export function performanceFor(
  signerKey: string | null | undefined,
): SignerCyclePerformance | null {
  return performanceIn(PERFORMANCE, signerKey);
}

/** The middle of the signer set this cycle. */
export function medianResponseMs(): number | null {
  return medianResponseIn(PERFORMANCE);
}

/**
 * One key's whole record, fetched when a reader asks for it.
 *
 * The summary that ships with the guide is the current cycle only — the
 * question a reader has on a pool page. Fifty-nine cycles of it is a file per
 * key, and costs a request only when somebody opens the history.
 */
export function useSignerPerformance(
  signerKey: string | null | undefined,
): Remote<SignerPerformance> {
  const key = bareKey(signerKey);
  return useRemoteJson(
    key === null ? null : `performance/${key}.json`,
    isSignerPerformance,
  );
}
