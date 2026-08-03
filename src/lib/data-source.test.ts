import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED,
  fetchSnapshot,
  localSnapshot,
  readCachedSnapshot,
  writeCachedSnapshot,
  type Snapshot,
} from './data-source';

/*
 * An installed app holds whatever build it last downloaded, so the pool data
 * is read from the branch at runtime and kept on the device. These are the
 * rules that decide which of the three copies a reader actually sees — and
 * the ones that stop a bad copy being shown as if it were good.
 */

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

/** A snapshot shaped like the real files, at a chosen moment. */
function snapshotAt(generatedAt: string): Snapshot {
  return {
    signers: { ...BUNDLED.signers, generatedAt },
    totals: BUNDLED.totals,
    origin: 'network',
    fetchedAt: 1,
  };
}

const LATER = '2999-01-01T00:00:00.000Z';
const EARLIER = '2000-01-01T00:00:00.000Z';

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the copy on the device', () => {
  it('falls back to what shipped with the build', () => {
    expect(localSnapshot()).toBe(BUNDLED);
  });

  it('prefers a saved copy at least as fresh as the build', () => {
    writeCachedSnapshot(snapshotAt(LATER));
    expect(localSnapshot().signers.generatedAt).toBe(LATER);
    expect(localSnapshot().origin).toBe('cache');
  });

  it('prefers an equally-timestamped saved copy, for its fresher totals', () => {
    // "Refresh the amounts staked" moves totals.json without moving
    // signers.json's generatedAt, so equal timestamps still favour the cache.
    writeCachedSnapshot(snapshotAt(BUNDLED.signers.generatedAt));
    expect(localSnapshot().origin).toBe('cache');
  });

  it('discards a saved copy older than the build it is running against', () => {
    writeCachedSnapshot(snapshotAt(EARLIER));
    expect(localSnapshot()).toBe(BUNDLED);
  });

  it('survives storage that is absent or refuses to answer', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(localSnapshot()).toBe(BUNDLED);
    expect(() => writeCachedSnapshot(snapshotAt(LATER))).not.toThrow();

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(readCachedSnapshot()).toBeNull();
    expect(() => writeCachedSnapshot(snapshotAt(LATER))).not.toThrow();
  });
});

describe('what a saved copy has to look like to be believed', () => {
  const write = (value: unknown) =>
    localStorage.setItem('signer-guide:snapshot:v1', JSON.stringify(value));

  it('refuses one that is not the shape this build reads', () => {
    write({ signers: { signers: [] }, totals: BUNDLED.totals });
    expect(readCachedSnapshot()).toBeNull();

    write({ signers: BUNDLED.signers, totals: { cycle: 141 } });
    expect(readCachedSnapshot()).toBeNull();
  });

  it('refuses an amount the page would do BigInt arithmetic on and crash', () => {
    // A null total is honest — "we could not read it". "12.5" is not, and the
    // first render would throw on it.
    write({
      signers: BUNDLED.signers,
      totals: { cycle: 141, ustx: { 'SP0.a': '12.5' } },
    });
    expect(readCachedSnapshot()).toBeNull();

    write({
      signers: BUNDLED.signers,
      totals: { cycle: 141, ustx: { 'SP0.a': null, 'SP0.b': '250' } },
    });
    expect(readCachedSnapshot()).not.toBeNull();
  });

  it('refuses one that is not JSON at all', () => {
    localStorage.setItem('signer-guide:snapshot:v1', 'half a wr');
    expect(readCachedSnapshot()).toBeNull();
  });
});

describe('reading the branch', () => {
  const respond = (signers: unknown, totals: unknown, ok = true) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok,
        status: ok ? 200 : 502,
        json: async () => (url.includes('signers') ? signers : totals),
      })),
    );

  it('takes both files as one snapshot', async () => {
    respond({ ...BUNDLED.signers, generatedAt: LATER }, BUNDLED.totals);
    const snapshot = await fetchSnapshot();
    expect(snapshot.origin).toBe('network');
    expect(snapshot.signers.generatedAt).toBe(LATER);
    expect(snapshot.fetchedAt).toBeGreaterThan(0);
  });

  it('refuses a published file this build cannot read', async () => {
    // Better to keep showing the saved copy than to render something whose
    // shape we are guessing at.
    respond({ generatedAt: LATER }, BUNDLED.totals);
    await expect(fetchSnapshot()).rejects.toThrow(/shape/);
  });

  it('fails rather than treating an error page as data', async () => {
    respond(BUNDLED.signers, BUNDLED.totals, false);
    await expect(fetchSnapshot()).rejects.toThrow(/failed/);
  });
});
