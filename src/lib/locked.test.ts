import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_KEY,
  isFresh,
  readCache,
  readLockedTotals,
  TTL_MS,
  writeCache,
  type LockedTotals,
} from './locked';

/*
 * These decide whether a reader sees a real number, a stale one, or nothing.
 * The node is faked so the rules can be checked without asking Hiro.
 */

const POOL_A = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer';
const POOL_B =
  'SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP.fastpool-1-signer-manager';

/** A Clarity uint on the wire. */
const uint = (value: bigint) => `0x01${value.toString(16).padStart(32, '0')}`;

/**
 * Stands in for the node: `/v2/pox` reports the current cycle, and each
 * read-only call answers from `amounts[cycle][pool]`. A pool missing from a
 * cycle answers with an error, which is how an unreadable pool looks.
 */
function fakeNode(
  currentCycle: number,
  amounts: Record<number, Record<string, bigint>>,
) {
  return vi.fn(async (url: string, init?: { body?: string }) => {
    if (url.endsWith('/v2/pox')) {
      return {
        ok: true,
        json: async () => ({ current_cycle: { id: currentCycle } }),
      };
    }

    const args = JSON.parse(init?.body ?? '{}').arguments as string[];
    const cycle = Number(BigInt(`0x${args[1].slice(4)}`));
    // The principal argument carries the contract name at the end, in ascii.
    const name = Buffer.from(args[0].slice(48), 'hex').toString();
    const pool = [POOL_A, POOL_B].find((id) => id.endsWith(`.${name}`));
    const amount = pool ? amounts[cycle]?.[pool] : undefined;

    return amount === undefined
      ? { ok: true, json: async () => ({ okay: false }) }
      : { ok: true, json: async () => ({ okay: true, result: uint(amount) }) };
  });
}

/**
 * Enough localStorage to test against, rather than pulling in a whole DOM
 * for one key.
 */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  } satisfies Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readLockedTotals', () => {
  it('reads the current cycle when there is something in it', async () => {
    vi.stubGlobal(
      'fetch',
      fakeNode(141, { 141: { [POOL_A]: 500n, [POOL_B]: 0n } }),
    );

    const totals = await readLockedTotals([POOL_A, POOL_B], 1000);
    expect(totals).toEqual({
      cycle: 141,
      ustx: { [POOL_A]: '500', [POOL_B]: '0' },
      readAt: 1000,
    });
  });

  it('falls back to the cycle being filled when the current one is empty', async () => {
    // pox-5 went live during cycle 140 with nothing staked in it yet, so
    // reading 140 shows zeros for every pool and tells a reader nothing.
    vi.stubGlobal(
      'fetch',
      fakeNode(140, {
        140: { [POOL_A]: 0n, [POOL_B]: 0n },
        141: { [POOL_A]: 253n, [POOL_B]: 1_171_575n },
      }),
    );

    const totals = await readLockedTotals([POOL_A, POOL_B], 1000);
    expect(totals?.cycle).toBe(141);
    expect(totals?.ustx[POOL_B]).toBe('1171575');
  });

  it('marks a pool it could not read as unknown, never as zero', async () => {
    vi.stubGlobal('fetch', fakeNode(141, { 141: { [POOL_A]: 500n } }));

    const totals = await readLockedTotals([POOL_A, POOL_B], 1000);
    expect(totals?.ustx[POOL_B]).toBeNull();
  });

  it('gives up rather than inventing a cycle when the node says nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    expect(await readLockedTotals([POOL_A], 1000)).toBeNull();
  });
});

describe('the hour-long cache', () => {
  const totals: LockedTotals = {
    cycle: 141,
    ustx: { [POOL_A]: '500' },
    readAt: 10_000_000,
  };

  it('survives a round trip through storage', () => {
    writeCache(totals);
    expect(readCache()).toEqual(totals);
  });

  it('is fresh within the hour and stale after it', () => {
    expect(isFresh(totals, totals.readAt + TTL_MS - 1)).toBe(true);
    expect(isFresh(totals, totals.readAt + TTL_MS)).toBe(false);
  });

  it('treats a clock that has gone backwards as stale', () => {
    // Otherwise a reader whose clock jumps could sit on one reading for good.
    expect(isFresh(totals, totals.readAt - 1)).toBe(false);
  });

  it('ignores anything else that has been written to the key', () => {
    localStorage.setItem(CACHE_KEY, 'not json');
    expect(readCache()).toBeNull();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ cycle: 'soon' }));
    expect(readCache()).toBeNull();
  });
});

describe('being told to slow down', () => {
  it('waits and asks again rather than reporting the pool as unknown', async () => {
    // A first visit asks about every pool at once, which is exactly when the
    // node starts answering 429. Giving up there would blank the page.
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/v2/pox')) {
          return {
            ok: true,
            json: async () => ({ current_cycle: { id: 141 } }),
          };
        }
        calls += 1;
        return calls === 1
          ? { ok: false, status: 429, json: async () => ({}) }
          : {
              ok: true,
              json: async () => ({
                okay: true,
                result: `0x01${500n.toString(16).padStart(32, '0')}`,
              }),
            };
      }),
    );

    const pending = readLockedTotals([POOL_A], 1000);
    await vi.runAllTimersAsync();
    const totals = await pending;

    expect(calls).toBe(2);
    expect(totals?.ustx[POOL_A]).toBe('500');
    vi.useRealTimers();
  });
});
