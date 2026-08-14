/**
 * Fetching one signer's history, and only when a reader asks for it.
 *
 * The rest of the guide ships as two committed files that every reader
 * downloads, which works because they are small and everybody wants all of
 * them. History is neither: a busy signer's member list runs to thousands of
 * addresses, and a reader on the list page wants none of them. So it is split,
 * and each piece costs a request only when somebody opens it:
 *
 *   signers/<slug>.json          the summary — cycles, amounts, member counts
 *   signers/<slug>/<cycle>.json  one cycle's members
 *
 * Opening a signer costs the first. Opening a cycle within it costs one more.
 * A reader who opens neither pays nothing, and that is nearly all of them.
 *
 * Which contracts make up a signer, and what its files are called, is in
 * src/lib/signer-groups.ts — shared with the script that writes them.
 *
 * These come from the branch like the rest of the data, which means a working
 * copy reads the *published* history rather than the one just generated. To
 * see your own:
 *
 *   pnpm generate:history --only "fast pool"
 *   VITE_DATA_BASE_URL=/src/data pnpm dev
 */

import { useEffect, useState } from 'react';
import { RAW_BASE } from './data-source';
import type { SignerCycleMembers, SignerHistory } from './types';

/**
 * A read that has not finished, has failed, or has an answer.
 *
 * `missing` is a state of its own on purpose. A signer whose history the
 * refresh has not built yet answers 404, and that is not a failure to ask a
 * reader to retry — it is "nothing on file for this one", which the page can
 * say plainly.
 */
export type Remote<T> =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed' }
  | { state: 'ready'; value: T };

class NotFound extends Error {}

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${RAW_BASE}/${path}`, { signal, cache: 'no-cache' });
  if (res.status === 404) throw new NotFound();
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

function useRemoteJson<T>(
  path: string | null,
  isValid: (value: unknown) => value is T,
): Remote<T> {
  const [result, setResult] = useState<Remote<T>>({ state: 'loading' });

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    let live = true;

    setResult({ state: 'loading' });
    fetchJson(path, controller.signal)
      .then((value) => {
        if (!live) return;
        setResult(
          isValid(value) ? { state: 'ready', value } : { state: 'failed' },
        );
      })
      .catch((err: unknown) => {
        // An abort is this component going away, not a failure to report.
        if (!live) return;
        setResult({ state: err instanceof NotFound ? 'missing' : 'failed' });
      });

    return () => {
      live = false;
      controller.abort();
    };
    // On the path alone. `isValid` is a module-level function in both callers,
    // and listing it would invite an inline one that refetches every render.
  }, [path]);

  return path === null ? { state: 'missing' } : result;
}

/*
 * These files are written by a script in this repo and served from its own
 * branch, so this is not a trust boundary — but a shape that changed under a
 * build still sitting in somebody's cache should read as "nothing on file"
 * rather than white-screen the page half way down a member list.
 */

export function isSignerHistory(value: unknown): value is SignerHistory {
  if (typeof value !== 'object' || value === null) return false;
  const history = value as Partial<SignerHistory>;
  return (
    Array.isArray(history.contractIds) &&
    // A number, or absent. A file written before this field existed still has
    // every amount and member count it ever had, and rejecting the lot over a
    // missing label would tell a reader "that would not load" — and to retry,
    // which could never help — about data that loaded perfectly. What it costs
    // is the standings, and `cycleStanding` reports those as unknown.
    (history.currentCycle === undefined ||
      typeof history.currentCycle === 'number') &&
    Array.isArray(history.cycles) &&
    history.cycles.every(
      (cycle) =>
        typeof cycle === 'object' &&
        cycle !== null &&
        typeof cycle.cycle === 'number' &&
        typeof cycle.ustx === 'object' &&
        cycle.ustx !== null,
    )
  );
}

export function isCycleMembers(value: unknown): value is SignerCycleMembers {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as Partial<SignerCycleMembers>;
  if (typeof file.cycle !== 'number' || !Array.isArray(file.members)) {
    return false;
  }
  // The page does BigInt arithmetic on these, so an amount that is not a plain
  // uSTX count has to be caught here rather than at the first render.
  return file.members.every(
    (member) =>
      typeof member === 'object' &&
      member !== null &&
      typeof member.staker === 'string' &&
      typeof member.contractId === 'string' &&
      typeof member.ustx === 'string' &&
      /^\d+$/.test(member.ustx),
  );
}

/** One signer's summary: cycles, amounts, and how many members each had. */
export function useSignerHistory(slug: string | null): Remote<SignerHistory> {
  return useRemoteJson(
    slug === null ? null : `signers/${slug}.json`,
    isSignerHistory,
  );
}

/** One cycle's members — fetched only once a reader opens that cycle. */
export function useCycleMembers(
  slug: string | null,
  cycle: number | null,
): Remote<SignerCycleMembers> {
  return useRemoteJson(
    slug === null || cycle === null ? null : `signers/${slug}/${cycle}.json`,
    isCycleMembers,
  );
}
