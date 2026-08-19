import { useEffect, useState } from 'react';
import bundledSigners from '../data/signers.json';
import bundledStxOnlyCalculations from '../data/stx-only-calculations.json';
import bundledTotals from '../data/totals.json';
import type {
  LockedTotals,
  SignerData,
  StxOnlyCalculations,
} from './types';

/**
 * Where the pool data comes from once the app is installed.
 *
 * The site is rebuilt every time the hourly refresh commits, so a browser tab
 * always has current data. An installed app is not: it holds whatever build
 * was last downloaded, which could be days old. So the same two files are read
 * from the branch at runtime and kept in local storage.
 *
 * Three copies, in order of preference:
 *
 *   network   what the branch says right now — authoritative when it answers
 *   cache     the last network answer, so a cold start offline still works
 *   bundled   what shipped with the build, so the very first launch works
 *
 * The bundled copy is the floor, never the ceiling: a cache older than the
 * build it is running against is discarded rather than shown.
 */

export const RAW_BASE =
  typeof import.meta.env.VITE_DATA_BASE_URL === 'string' &&
  import.meta.env.VITE_DATA_BASE_URL.length > 0
    ? import.meta.env.VITE_DATA_BASE_URL
    : 'https://raw.githubusercontent.com/fastpool/signer-guide/main/src/data';

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
  stxOnlyCalculations: bundledStxOnlyCalculations as StxOnlyCalculations,
  origin: 'bundled',
  fetchedAt: null,
};

/*
 * Local storage is the reader's own browser, so this is not a trust boundary
 * — but a half-written or hand-edited entry should not white-screen the app
 * on launch, and neither should a file that changed shape under us.
 */

function isSignerData(value: unknown): value is SignerData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<SignerData>;
  return (
    typeof data.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(data.generatedAt)) &&
    Array.isArray(data.signers) &&
    data.signers.every(
      (signer) =>
        typeof signer === 'object' &&
        signer !== null &&
        typeof signer.contractId === 'string',
    )
  );
}

function isLockedTotals(value: unknown): value is LockedTotals {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<LockedTotals>;
  if (typeof data.cycle !== 'number') return false;
  if (typeof data.ustx !== 'object' || data.ustx === null) return false;
  // The page does BigInt arithmetic on these, so anything that is not a plain
  // uSTX count or an honest null has to be rejected here rather than thrown at
  // the first render.
  return Object.values(data.ustx).every(
    (amount) =>
      amount === null || (typeof amount === 'string' && /^\d+$/.test(amount)),
  );
}

function isBigintStringOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d+$/.test(value));
}

function isStxOnlyCalculations(value: unknown): value is StxOnlyCalculations {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<StxOnlyCalculations>;

  const blocksIntoValid =
    data.blocksIntoCycle === null || typeof data.blocksIntoCycle === 'number';
  const blocksLeftValid =
    data.blocksLeftInCycle === null || typeof data.blocksLeftInCycle === 'number';
  const currentBurnHeightValid =
    data.currentBurnHeight === null || typeof data.currentBurnHeight === 'number';
  const lastRewardBurnHeightValid =
    data.lastRewardBurnHeight === null ||
    typeof data.lastRewardBurnHeight === 'number';
  const lastPayoutCycleValid =
    data.lastPayoutCycle === null || typeof data.lastPayoutCycle === 'number';
  const nextRewardBurnHeightValid =
    data.nextRewardBurnHeight === null ||
    typeof data.nextRewardBurnHeight === 'number';

  return (
    typeof data.cycle === 'number' &&
    typeof data.distributionBlocks === 'number' &&
    blocksIntoValid &&
    blocksLeftValid &&
    currentBurnHeightValid &&
    lastRewardBurnHeightValid &&
    nextRewardBurnHeightValid &&
    typeof data.totalStakedUstx === 'string' &&
    /^\d+$/.test(data.totalStakedUstx) &&
    typeof data.bondStakedUstx === 'string' &&
    /^\d+$/.test(data.bondStakedUstx) &&
    typeof data.stxOnlyStakedUstx === 'string' &&
    /^\d+$/.test(data.stxOnlyStakedUstx) &&
    isBigintStringOrNull(data.stxPriceSats) &&
    isBigintStringOrNull(data.sbtcBalanceSats) &&
    isBigintStringOrNull(data.accruedRewardsSats) &&
    isBigintStringOrNull(data.bondShareSats) &&
    isBigintStringOrNull(data.foundationShareSats) &&
    isBigintStringOrNull(data.stxOnlySoFarSats) &&
    isBigintStringOrNull(data.projectedCycleSats) &&
    isBigintStringOrNull(data.projectedRateSatsPer1000Stx) &&
    lastPayoutCycleValid &&
    isBigintStringOrNull(data.lastPayoutRateSatsPer1000Stx) &&
    isBigintStringOrNull(data.cumulativeRewardsPerUstx) &&
    isBigintStringOrNull(data.rateSatsPer1000Stx)
  );
}

function generatedAt(snapshot: Snapshot): number {
  return Date.parse(snapshot.signers.generatedAt);
}

/**
 * Whether `candidate` is worth showing instead of `current`.
 *
 * Equal timestamps still count: the two files are refreshed on different
 * schedules, and "the amounts staked" moves without `generatedAt` moving, so
 * an equally-timestamped snapshot may carry fresher totals.
 */
function isAtLeastAsFresh(candidate: Snapshot, current: Snapshot): boolean {
  return generatedAt(candidate) >= generatedAt(current);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Storage can throw outright when the browser blocks it.
    return null;
  }
}

export function readCachedSnapshot(): Snapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return null;
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

export function writeCachedSnapshot(snapshot: Snapshot): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      CACHE_KEY,
      JSON.stringify({
        signers: snapshot.signers,
        totals: snapshot.totals,
        stxOnlyCalculations: snapshot.stxOnlyCalculations,
        fetchedAt: snapshot.fetchedAt,
      }),
    );
  } catch {
    // A full or disabled store costs the offline copy, not the session.
  }
}

/** The best copy available without going to the network. */
export function localSnapshot(): Snapshot {
  const cached = readCachedSnapshot();
  return cached && isAtLeastAsFresh(cached, BUNDLED) ? cached : BUNDLED;
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${RAW_BASE}/${path}`, {
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
  /** True while the first read of the branch is in flight. */
  refreshing: boolean;
  /** True once a read has failed and what is shown is a saved copy. */
  stale: boolean;
};

/**
 * The data, newest copy first, without ever leaving the reader with none.
 *
 * Renders synchronously from what is already on the device, then replaces it
 * if the branch has moved. A failed read is not an error state — it means the
 * saved copy stands, and says so.
 */
export function useSnapshot(): SnapshotState {
  const [snapshot, setSnapshot] = useState<Snapshot>(localSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    setRefreshing(true);
    fetchSnapshot(controller.signal)
      .then((next) => {
        if (!live) return;
        writeCachedSnapshot(next);
        // The branch is authoritative when it answers, so this is not guarded
        // on being newer: the totals move without `generatedAt` moving.
        setSnapshot(next);
        setStale(false);
      })
      .catch(() => {
        if (live) setStale(true);
      })
      .finally(() => {
        if (live) setRefreshing(false);
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  return { snapshot, refreshing, stale };
}
