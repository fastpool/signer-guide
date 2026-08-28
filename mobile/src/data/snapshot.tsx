import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import bundledSigners from '@guide/data/signers.json';
import bundledStxOnly from '@guide/data/stx-only-calculations.json';
import bundledTotals from '@guide/data/totals.json';
import {
  isLockedTotals,
  isSignerData,
  isStxOnlyCalculations,
} from '@guide/lib/snapshot-shape';
import type {
  LockedTotals,
  SignerData,
  StxOnlyCalculations,
} from '@guide/lib/types';

/**
 * The pool data, on a phone.
 *
 * Same three copies the web app keeps, and the same order of preference —
 * network, then the last network answer, then what shipped in the build — for
 * the same reason: an installed app holds whatever it last downloaded, and a
 * rate from four days ago presented as this cycle's is worse than no rate.
 *
 * What differs is only where the saved copy lives. `localStorage` is
 * synchronous and does not exist here; `AsyncStorage` is neither, so the first
 * frame renders from the bundled copy and the saved one arrives a tick later.
 * That is why this is a provider rather than the web app's `useSnapshot` hook:
 * every screen reads the same in-flight state instead of each starting its own
 * fetch.
 */

export const DATA_BASE_URL =
  process.env.EXPO_PUBLIC_DATA_BASE_URL ||
  'https://raw.githubusercontent.com/fastpool/signer-guide/main/src/data';

/** Bumped when the shape changes, so an old cache is ignored, not misread. */
const CACHE_KEY = 'signer-guide:snapshot:v2';

export type SnapshotOrigin = 'bundled' | 'cache' | 'network';

export type Snapshot = {
  signers: SignerData;
  totals: LockedTotals;
  stxOnlyCalculations: StxOnlyCalculations;
  origin: SnapshotOrigin;
  /** When it was read from the branch; null for what shipped with the build. */
  fetchedAt: number | null;
};

export const BUNDLED: Snapshot = {
  signers: bundledSigners as SignerData,
  totals: bundledTotals as LockedTotals,
  stxOnlyCalculations: bundledStxOnly as StxOnlyCalculations,
  origin: 'bundled',
  fetchedAt: null,
};

function generatedAt(snapshot: Snapshot): number {
  return Date.parse(snapshot.signers.generatedAt);
}

/**
 * Whether `candidate` is worth showing instead of `current`.
 *
 * Equal timestamps still count: the files are refreshed on different
 * schedules, so an equally-timestamped snapshot may carry fresher totals.
 */
export function isAtLeastAsFresh(candidate: Snapshot, current: Snapshot): boolean {
  return generatedAt(candidate) >= generatedAt(current);
}

export function parseCachedSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (
      !isSignerData(parsed.signers) ||
      !isLockedTotals(parsed.totals) ||
      !isStxOnlyCalculations(parsed.stxOnlyCalculations)
    ) {
      return null;
    }
    return {
      signers: parsed.signers,
      totals: parsed.totals,
      stxOnlyCalculations: parsed.stxOnlyCalculations,
      origin: 'cache',
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null,
    };
  } catch {
    return null;
  }
}

export async function readCachedSnapshot(): Promise<Snapshot | null> {
  try {
    return parseCachedSnapshot(await AsyncStorage.getItem(CACHE_KEY));
  } catch {
    // A device that will not give us its store costs the offline copy only.
    return null;
  }
}

export async function writeCachedSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        signers: snapshot.signers,
        totals: snapshot.totals,
        stxOnlyCalculations: snapshot.stxOnlyCalculations,
        fetchedAt: snapshot.fetchedAt,
      }),
    );
  } catch {
    // A full store costs the offline copy, not the session.
  }
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${DATA_BASE_URL}/${path}`, {
    signal,
    // The CDN holds these for five minutes; asking past that is the point.
    cache: 'no-cache',
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  const [signers, totals, stxOnlyCalculations] = await Promise.all([
    fetchJson('signers.json', signal),
    fetchJson('totals.json', signal),
    fetchJson('stx-only-calculations.json', signal),
  ]);
  if (
    !isSignerData(signers) ||
    !isLockedTotals(totals) ||
    !isStxOnlyCalculations(stxOnlyCalculations)
  ) {
    throw new Error('The published data is not in a shape this build knows');
  }
  return {
    signers,
    totals,
    stxOnlyCalculations,
    origin: 'network',
    fetchedAt: Date.now(),
  };
}

export type SnapshotState = {
  snapshot: Snapshot;
  /** True while a read of the branch is in flight. */
  refreshing: boolean;
  /** True once a read has failed and what is shown is a saved copy. */
  stale: boolean;
  refresh: () => void;
};

const SnapshotContext = createContext<SnapshotState>({
  snapshot: BUNDLED,
  refreshing: false,
  stale: false,
  refresh: () => {},
});

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(BUNDLED);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchSnapshot()
      .then((next) => {
        if (!live.current) return;
        void writeCachedSnapshot(next);
        // The branch is authoritative when it answers, so this is not guarded
        // on being newer: the totals move without `generatedAt` moving.
        setSnapshot(next);
        setStale(false);
      })
      .catch(() => {
        if (live.current) setStale(true);
      })
      .finally(() => {
        if (live.current) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The saved copy first, so a cold start with no signal still shows the
    // newest data this phone ever had rather than the build's.
    void readCachedSnapshot().then((cached) => {
      if (cancelled || !cached) return;
      setSnapshot((current) =>
        isAtLeastAsFresh(cached, current) ? cached : current,
      );
    });
    refresh();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return (
    <SnapshotContext.Provider value={{ snapshot, refreshing, stale, refresh }}>
      {children}
    </SnapshotContext.Provider>
  );
}

export function useSnapshot(): SnapshotState {
  return useContext(SnapshotContext);
}
