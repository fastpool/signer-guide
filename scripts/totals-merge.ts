import type { LockedTotals } from '../src/lib/types.js';

export function preserveKnownTotals(
  latest: LockedTotals,
  previous: LockedTotals | null,
): { totals: LockedTotals; carriedForward: number } {
  if (!previous) return { totals: latest, carriedForward: 0 };

  const ustx: LockedTotals['ustx'] = { ...latest.ustx };
  let carriedForward = 0;

  for (const [contractId, amount] of Object.entries(ustx)) {
    if (amount !== null) continue;
    const oldAmount = previous.ustx[contractId];
    if (typeof oldAmount !== 'string') continue;
    ustx[contractId] = oldAmount;
    carriedForward += 1;
  }

  return {
    totals: {
      ...latest,
      ustx,
    },
    carriedForward,
  };
}
