/**
 * How a signer has answered the miners, and what may be said about it.
 *
 * Weight is the number this guide has always had: pox-5 shares the signer set
 * out by the STX behind each key, and says nothing whatever about whether the
 * node then does the job. This is the other half — for every block a miner
 * proposed, whether the signer answered, what it said, and how long the miner
 * waited — and the arithmetic over it is here rather than in a component
 * because the distinctions are the whole point.
 *
 * **Rejecting is not failing.** A signer that reads a proposal and refuses it
 * is doing exactly what it is there for; a signer that says nothing is not.
 * So the headline is whether it *answered*, and what it answered is a second
 * number underneath. Leading with acceptance would rank a node that rubber
 * stamps everything above one that checks.
 *
 * **A mean over nothing is not a fast mean.** `responseMs` is null for a
 * signer that answered nothing at all, and null here is never rendered as a
 * number. The API these come from reports zero for that case, which would sort
 * the absent node to the top of any list of the quick.
 *
 * **An open cycle is a cycle so far.** `final` is false while the cycle is
 * still being signed, and a page that shows the current cycle has to say so:
 * a hundred missed blocks two hours in is not a hundred missed in a fortnight.
 */

import summary from '../data/performance.json';
import { useRemoteJson, type Remote } from './remote-json';
import type {
  PerformanceData,
  SignerCyclePerformance,
  SignerPerformance,
} from './types';

export type { Remote };

export const PERFORMANCE = summary as PerformanceData;

/** Bare hex, no `0x` — how the files are keyed. See scripts/signer-performance.ts. */
export function bareKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const bare = value.toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{66}$/.test(bare) ? bare : null;
}

/** This cycle's record for a key, or null for one the file does not carry. */
export function performanceFor(
  signerKey: string | null | undefined,
): SignerCyclePerformance | null {
  const key = bareKey(signerKey);
  if (key === null) return null;
  return PERFORMANCE.signers[key] ?? null;
}

/** Every proposal it was asked about: answered one way or the other, or not. */
export function proposals(row: SignerCyclePerformance): number {
  return row.accepted + row.rejected + row.missed;
}

/** The ones it answered at all, whichever way. */
export function answered(row: SignerCyclePerformance): number {
  return row.accepted + row.rejected;
}

/**
 * The share of proposals it answered, 0–1, or null when it was asked none.
 *
 * The number this page leads with. A signer is in the set to respond; whether
 * it agreed is the next question, not this one.
 */
export function answeredRate(row: SignerCyclePerformance): number | null {
  const total = proposals(row);
  return total === 0 ? null : answered(row) / total;
}

/** Of what it answered, the share it accepted — or null if it answered none. */
export function acceptedRate(row: SignerCyclePerformance): number | null {
  const said = answered(row);
  return said === 0 ? null : row.accepted / said;
}

/**
 * A signer holding a seat that has never been heard from.
 *
 * Its own state because it is not a bad score, it is an absence: a key that
 * was seated when the cycle was locked in and whose node has never spoken.
 * Every rotation makes one for a fortnight, and so does an operator who
 * registered and never started the software.
 */
export function neverAnswered(row: SignerCyclePerformance): boolean {
  return answered(row) === 0 && row.lastSeen === null;
}

/**
 * Seconds, to one decimal — or null, which callers must render as words.
 *
 * Milliseconds are the wrong unit for a page: the spread across the set runs
 * from four seconds to thirty, and nobody reads 31711 as thirty-one.
 */
export function responseSeconds(row: SignerCyclePerformance): number | null {
  return row.responseMs === null ? null : row.responseMs / 1000;
}

/**
 * The middle of the set this cycle, for a reader with one number and no scale.
 *
 * A median rather than a mean, and over the signers that answered anything:
 * the absent ones have no response time, and counting them as zero would drag
 * the comparison somewhere no node actually is.
 */
export function medianResponseMs(): number | null {
  const times = Object.values(PERFORMANCE.signers)
    .map((row) => row.responseMs)
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  if (times.length === 0) return null;
  const middle = Math.floor(times.length / 2);
  return times.length % 2 === 0
    ? Math.round((times[middle - 1] + times[middle]) / 2)
    : times[middle];
}

/*
 * Written by a script in this repo and served from its own branch, so this is
 * not a trust boundary — but a shape that changed under a build still sitting
 * in somebody's cache should read as "nothing on file" rather than throw half
 * way down a page.
 */
export function isSignerPerformance(
  value: unknown,
): value is SignerPerformance {
  if (typeof value !== 'object' || value === null) return false;
  const history = value as Partial<SignerPerformance>;
  return (
    typeof history.signerKey === 'string' &&
    Array.isArray(history.cycles) &&
    history.cycles.every(
      (cycle) =>
        typeof cycle === 'object' &&
        cycle !== null &&
        typeof cycle.cycle === 'number' &&
        typeof cycle.accepted === 'number' &&
        typeof cycle.rejected === 'number' &&
        typeof cycle.missed === 'number',
    )
  );
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
