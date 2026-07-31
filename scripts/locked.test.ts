import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLockedTotals } from './locked.js';

/*
 * These decide whether a reader sees a real number or nothing. The node is
 * faked so the rules can be checked without asking Hiro.
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readLockedTotals', () => {
  it('reads the current cycle when there is something in it', async () => {
    vi.stubGlobal(
      'fetch',
      fakeNode(141, { 141: { [POOL_A]: 500n, [POOL_B]: 0n } }),
    );

    const totals = await readLockedTotals([POOL_A, POOL_B]);
    // No timestamp: this is committed, and one that moved every hour would be
    // an hourly commit saying nothing.
    expect(totals).toEqual({
      cycle: 141,
      ustx: { [POOL_A]: '500', [POOL_B]: '0' },
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

    const totals = await readLockedTotals([POOL_A, POOL_B]);
    expect(totals?.cycle).toBe(141);
    expect(totals?.ustx[POOL_B]).toBe('1171575');
  });

  it('marks a pool it could not read as unknown, never as zero', async () => {
    vi.stubGlobal('fetch', fakeNode(141, { 141: { [POOL_A]: 500n } }));

    const totals = await readLockedTotals([POOL_A, POOL_B]);
    expect(totals?.ustx[POOL_B]).toBeNull();
  });

  it('gives up rather than inventing a cycle when the node says nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    expect(await readLockedTotals([POOL_A])).toBeNull();
  });
});

describe('being told to slow down', () => {
  it('waits and asks again rather than reporting the pool as unknown', async () => {
    // Reading every pool in one run is exactly when the node starts answering
    // 429. Giving up there would report a rate limit as an unknown amount.
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

    const pending = readLockedTotals([POOL_A]);
    await vi.runAllTimersAsync();
    const totals = await pending;

    expect(calls).toBe(2);
    expect(totals?.ustx[POOL_A]).toBe('500');
    vi.useRealTimers();
  });
});
