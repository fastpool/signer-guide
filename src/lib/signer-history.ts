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
 * src/lib/signer-nodes.ts — shared with the script that writes them.
 *
 * The fetching itself is `remote-json.ts`, which the rewards history uses too.
 * `Remote` is re-exported here because this module's callers name it.
 */

import { useRemoteJson, type Remote } from './remote-json';
import type { SignerCycleMembers, SignerHistory } from './types';

export type { Remote };

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
