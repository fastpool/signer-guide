import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BUNDLED,
  fetchSnapshot,
  isAtLeastAsFresh,
  parseCachedSnapshot,
  readCachedSnapshot,
  writeCachedSnapshot,
  type Snapshot,
} from './snapshot';

/*
 * An installed app holds whatever build it last downloaded, so the pool data
 * is read from the branch at runtime and kept on the device. These are the
 * rules that decide which of the three copies somebody actually sees — and the
 * ones that stop a bad copy being shown as if it were good.
 */

function at(generatedAt: string, origin: Snapshot['origin'] = 'cache'): Snapshot {
  return {
    ...BUNDLED,
    signers: { ...BUNDLED.signers, generatedAt },
    origin,
    fetchedAt: Date.parse(generatedAt),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('what ships in the build', () => {
  it('is a whole, usable snapshot, so the first launch works offline', () => {
    expect(BUNDLED.signers.signers.length).toBeGreaterThan(0);
    expect(BUNDLED.totals.cycle).toBeGreaterThan(0);
    expect(BUNDLED.stxOnlyCalculations.rateSatsPer1000Stx).toMatch(/^\d+$/);
    expect(BUNDLED.origin).toBe('bundled');
    // Nothing was fetched to get it, and it does not pretend otherwise.
    expect(BUNDLED.fetchedAt).toBeNull();
  });
});

describe('the saved copy', () => {
  it('comes back as it went in', async () => {
    await writeCachedSnapshot(at('2026-08-28T00:00:00.000Z'));
    const read = await readCachedSnapshot();
    expect(read?.signers.generatedAt).toBe('2026-08-28T00:00:00.000Z');
    // Read off the device, whatever it was when it was written.
    expect(read?.origin).toBe('cache');
  });

  it('is nothing at all when the device has never held one', async () => {
    expect(await readCachedSnapshot()).toBeNull();
  });

  it('is discarded rather than misread when it is half-written', () => {
    expect(parseCachedSnapshot('{"signers":')).toBeNull();
  });

  it('is discarded when the shape changed under the build reading it', () => {
    expect(
      parseCachedSnapshot(JSON.stringify({ signers: { signers: [] } })),
    ).toBeNull();
  });

  it('is discarded when an amount in it is not a plain count', () => {
    const broken = {
      ...at('2026-08-28T00:00:00.000Z'),
      totals: { cycle: 1, ustx: { 'a.b': '1.5' } },
    };
    expect(parseCachedSnapshot(JSON.stringify(broken))).toBeNull();
  });
});

describe('which copy stands', () => {
  it('prefers a saved copy newer than the build', () => {
    expect(isAtLeastAsFresh(at('2027-01-01T00:00:00.000Z'), BUNDLED)).toBe(true);
  });

  it('discards one older than the build it is running against', () => {
    expect(isAtLeastAsFresh(at('2020-01-01T00:00:00.000Z'), BUNDLED)).toBe(false);
  });

  it('keeps an equally-timestamped one, because the totals move on their own', () => {
    expect(
      isAtLeastAsFresh(at(BUNDLED.signers.generatedAt), BUNDLED),
    ).toBe(true);
  });
});

describe('reading the branch', () => {
  it('refuses data that is not in a shape this build knows', async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ nothing: 'useful' }),
    }));
    await expect(fetchSnapshot()).rejects.toThrow(/shape this build knows/);
  });

  it('reports a branch that will not answer rather than inventing a snapshot', async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    await expect(fetchSnapshot()).rejects.toThrow(/503/);
  });
});
