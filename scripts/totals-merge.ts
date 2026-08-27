import type { LockedTotals } from '../src/lib/types.js';

type Amounts = LockedTotals['ustx'];

/**
 * What a previous file knows about one cycle, whichever block it kept it in.
 *
 * A refresh reads two cycles and remembers a third, so the cycle that is
 * current now is the one the last run recorded as next, and the one before it
 * is the one that run had as current. Matching on the cycle rather than on the
 * position means an amount is only ever carried forward onto the cycle it was
 * read for — a 141 amount reprinted under 142 would be a wrong number, not a
 * stale one.
 */
function knownFor(
  previous: LockedTotals | null,
  cycle: number,
): Amounts | null {
  if (!previous) return null;
  if (previous.cycle === cycle) return previous.ustx;
  if (previous.next?.cycle === cycle) return previous.next.ustx;
  if (previous.previous?.cycle === cycle) return previous.previous.ustx;
  return null;
}

function carryForward(
  latest: Amounts,
  known: Amounts | null,
): { ustx: Amounts; carriedForward: number } {
  const ustx: Amounts = { ...latest };
  let carriedForward = 0;
  if (!known) return { ustx, carriedForward };

  for (const [contractId, amount] of Object.entries(ustx)) {
    if (amount !== null) continue;
    const oldAmount = known[contractId];
    if (typeof oldAmount !== 'string') continue;
    ustx[contractId] = oldAmount;
    carriedForward += 1;
  }

  return { ustx, carriedForward };
}

export function preserveKnownTotals(
  latest: LockedTotals,
  previous: LockedTotals | null,
): { totals: LockedTotals; carriedForward: number } {
  if (!previous) return { totals: latest, carriedForward: 0 };

  const current = carryForward(latest.ustx, knownFor(previous, latest.cycle));
  const totals: LockedTotals = { ...latest, ustx: current.ustx };
  let carriedForward = current.carriedForward;

  if (latest.next) {
    const next = carryForward(
      latest.next.ustx,
      knownFor(previous, latest.next.cycle),
    );
    totals.next = { ...latest.next, ustx: next.ustx };
    carriedForward += next.carriedForward;
  }

  // The cycle before this one is over: nobody can join it and nothing in it
  // can move, so it is remembered rather than read again. It comes from
  // whatever the last file knew about that cycle — at a rollover, the block it
  // had as current — and is dropped when there is nothing to remember, because
  // an absent cycle and an empty one are different things to tell a reader.
  const settled = knownFor(previous, latest.cycle - 1);
  if (settled) {
    totals.previous = { cycle: latest.cycle - 1, ustx: settled };
  }

  return { totals, carriedForward };
}
