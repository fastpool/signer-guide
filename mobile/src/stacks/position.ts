import { useCallback, useEffect, useState } from 'react';
import { fetchCycleState, fetchStakedPosition, type StakedPosition } from '@guide/lib/staking';
import { fetchAccountBalance, STACKS_API_URL, type AccountBalance } from './api';

/**
 * Everything the first screen needs about one address, read from the chain.
 *
 * The position, the balance and where the cycle is are three independent
 * questions of three different endpoints, so they are asked at once and each
 * is allowed to fail on its own. A balance the node would not give up is not a
 * reason to hide a position it did.
 */

export type CycleState = { rewardCycleId: number; inPreparePhase: boolean };

export type ChainView = {
  position: StakedPosition | null;
  balance: AccountBalance | null;
  cycle: CycleState | null;
  loading: boolean;
  /** Set when the position itself could not be read — the one that matters. */
  error: string | null;
  reload: () => void;
};

export function useChainView(address: string | null): ChainView {
  const [position, setPosition] = useState<StakedPosition | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [cycle, setCycle] = useState<CycleState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!address) {
      setPosition(null);
      setBalance(null);
      setError(null);
      return;
    }

    let live = true;
    setLoading(true);
    setError(null);

    const settle = <T,>(promise: Promise<T>, onValue: (value: T) => void) =>
      promise.then(
        (value) => {
          if (live) onValue(value);
        },
        () => {},
      );

    const positionRead = fetchStakedPosition({
      address,
      network: 'mainnet',
      apiUrl: STACKS_API_URL,
    })
      .then((found) => {
        if (live) setPosition(found);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setPosition(null);
        setError(err instanceof Error ? err.message : String(err));
      });

    void Promise.all([
      positionRead,
      settle(fetchAccountBalance(address), setBalance),
      settle(fetchCycleState('mainnet'), setCycle),
    ]).finally(() => {
      if (live) setLoading(false);
    });

    return () => {
      live = false;
    };
  }, [address, nonce]);

  return { position, balance, cycle, loading, error, reload };
}
