import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Whether this phone has been shown the app before.
 *
 * One flag, and it only decides whether the welcome screen appears. Nothing
 * else in the app branches on it — a first-time staker and a returning one see
 * the same screens afterwards, because the second thing somebody learns should
 * not be that the app has been hiding something from them.
 */
const KEY = 'signer-guide:seen-welcome:v1';

export type Onboarding = {
  /** Null while it is still being read off the device. */
  seen: boolean | null;
  markSeen: () => void;
};

export function useOnboarding(): Onboarding {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(KEY)
      .then((value) => {
        if (!cancelled) setSeen(value === '1');
      })
      // A store that will not answer means showing the welcome again, which is
      // a smaller cost than hiding the app behind a failed read.
      .catch(() => {
        if (!cancelled) setSeen(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    void AsyncStorage.setItem(KEY, '1').catch(() => {});
  }, []);

  return { seen, markSeen };
}
