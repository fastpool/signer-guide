/**
 * The live amounts, read once an hour and remembered in between.
 *
 * Held at the top of the app rather than per card: every card wants the same
 * answer, and asking the node once per card would be two dozen requests for
 * one number.
 */

import { useEffect, useState } from 'react';
import {
  isFresh,
  readCache,
  readLockedTotals,
  writeCache,
  type LockedTotals,
} from './locked';

export interface LockedState {
  totals: LockedTotals | null;
  /** True while a read is in flight and there is nothing to show yet. */
  isLoading: boolean;
}

export function useLockedTotals(contractIds: string[]): LockedState {
  // Straight from storage on the first render, so a reader who was here in
  // the last hour sees the numbers immediately rather than a flicker.
  const [totals, setTotals] = useState<LockedTotals | null>(() => readCache());
  const [isLoading, setIsLoading] = useState(false);

  const key = contractIds.join(',');

  useEffect(() => {
    const cached = readCache();
    if (cached && isFresh(cached)) {
      setTotals(cached);
      return;
    }

    let cancelled = false;
    // Stale numbers stay on screen while the new ones are fetched; an
    // hour-old total is closer to the truth than an empty space.
    setIsLoading(!cached);

    readLockedTotals(key.split(','))
      .then((fresh) => {
        if (cancelled) return;
        if (fresh) {
          writeCache(fresh);
          setTotals(fresh);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { totals, isLoading };
}
