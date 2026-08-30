/**
 * The joins the node report is made of.
 *
 * Three sources have to line up on one signer key and they all write it
 * differently, so the join is the part that quietly fails: match nothing and
 * every column reads "not known", which looks exactly like a network where
 * nobody is signing. The rest of the file is fetching, which is not worth
 * faking; these are the parts that decide what the report says.
 */

import { describe, expect, it } from 'vitest';
import {
  buildRows,
  formatRow,
  normaliseKey,
  parseArgs,
  parseSseJson,
  reconcile,
  toolPayload,
  type NodeRow,
  type SignerBehaviour,
  type SignerVersion,
  type SignerWeight,
} from './signer-nodes-report.js';
import type { Signer } from '../src/lib/types.js';

const KEY = `0x02${'a'.repeat(64)}`;
const BARE = KEY.slice(2);

const signer = (contractId: string, displayName: string, signerKey: string) =>
  ({ contractId, displayName, signerKey }) as Signer;

describe('normaliseKey', () => {
  it('reads the same key from all three of its spellings', () => {
    // signers.json and the Stacks API write 0x…, slotwatch writes the bare
    // hex. Joining the raw strings matches nothing at all.
    expect(normaliseKey(KEY)).toBe(BARE);
    expect(normaliseKey(BARE)).toBe(BARE);
    expect(normaliseKey(KEY.toUpperCase())).toBe(BARE);
  });

  it('refuses anything that is not a key', () => {
    // Null over a guess: a wrong key joins one signer's behaviour onto
    // another's name, which is worse than an empty column.
    expect(normaliseKey(null)).toBeNull();
    expect(normaliseKey('')).toBeNull();
    expect(normaliseKey('0xdeadbeef')).toBeNull();
    expect(normaliseKey(`0x02${'z'.repeat(64)}`)).toBeNull();
  });
});

describe('reading an MCP answer', () => {
  it('finds the result among the event frames', () => {
    const body = [
      'event: message',
      `data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"text":"{\\"ok\\":1}"}]}}`,
      '',
    ].join('\n');
    expect(toolPayload(parseSseJson(body))).toEqual({ ok: 1 });
  });

  it('is null for a body with no result in it', () => {
    expect(parseSseJson('event: ping\ndata: nonsense\n')).toBeNull();
    expect(parseSseJson('')).toBeNull();
    expect(toolPayload(null)).toBeNull();
    expect(toolPayload({ content: [{ text: 'not json' }] })).toBeNull();
  });
});

describe('parseArgs', () => {
  it('defaults to the current cycle and a fifty-block window', () => {
    expect(parseArgs([])).toEqual({
      cycle: null,
      blocks: 50,
      json: false,
      out: null,
    });
  });

  it('takes a cycle, a window, and somewhere to write', () => {
    expect(parseArgs(['--cycle', '141', '--blocks', '200', '--json', '--out', 'n.json'])).toEqual({
      cycle: 141,
      blocks: 200,
      json: true,
      out: 'n.json',
    });
  });
});

describe('buildRows', () => {
  const signers = [
    signer('SP1.one', 'Pool One', KEY),
    signer('SP1.two', 'Pool Two', KEY),
  ];
  const weight = (key: string, w: number): SignerWeight => ({
    signerKey: key,
    signerAddress: 'SP2X',
    weight: w,
    weightPercent: w / 40,
    stackedUstx: 1n,
  });
  const version: SignerVersion = { local: 1, active: 2, observedAt: null };
  const behaviour: SignerBehaviour = {
    name: 'Somebody',
    participationRate: 0.98,
    degradationRate: 0,
    signedCount: 49,
    missedCount: 1,
    acceptedCount: 49,
    rejectedCount: 0,
    preCommitRate: 1,
  };

  it('adds up what the guide says the key holds', () => {
    const rows = buildRows(
      signers,
      { 'SP1.one': '100', 'SP1.two': '900' },
      new Map(),
      new Map(),
      new Map(),
    );
    expect(rows[0].ourUstx).toBe(1000n);
  });

  it('puts every contract on a key into one row', () => {
    const rows = buildRows(
      signers,
      { 'SP1.one': '100', 'SP1.two': '900' },
      new Map([[BARE, weight(BARE, 785)]]),
      new Map(),
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pools).toEqual(['Pool One', 'Pool Two']);
    expect(rows[0].weight?.weight).toBe(785);
  });

  it('keeps a signer the guide cannot name, because that is the point', () => {
    // Weight the chain counts and this guide has no name for is exactly the
    // thing a reader should see, not the thing to drop for tidiness.
    const stranger = `02${'b'.repeat(64)}`;
    const rows = buildRows(
      signers,
      {},
      new Map([
        [BARE, weight(BARE, 10)],
        [stranger, weight(stranger, 900)],
      ]),
      new Map(),
      new Map(),
    );
    expect(rows).toHaveLength(2);
    // Biggest first, and the unnamed one has no pools to show.
    expect(rows[0].signerKey).toBe(stranger);
    expect(rows[0].pools).toEqual([]);
  });

  it('joins version and behaviour on the bare key', () => {
    const rows = buildRows(
      signers,
      {},
      new Map(),
      new Map([[BARE, version]]),
      new Map([[BARE, behaviour]]),
    );
    expect(rows[0].version?.local).toBe(1);
    expect(rows[0].behaviour?.missedCount).toBe(1);
  });

  it('never carries a region, because there is none to carry', () => {
    const rows = buildRows(signers, {}, new Map(), new Map(), new Map());
    expect(rows[0].region).toBeNull();
  });
});

describe('formatRow', () => {
  const row: NodeRow = {
    signerKey: BARE,
    pools: ['Pool One'],
    groups: ['Fast Pool'],
    ourUstx: null,
    weight: null,
    version: null,
    behaviour: null,
    region: null,
  };

  it('says when a node is behind the network', () => {
    // The one thing the protocol version is good for: a node still on the
    // last version while the network has moved on.
    const line = formatRow(
      { ...row, version: { local: 1, active: 2, observedAt: null } },
      4000,
    );
    expect(line).toContain('v1 (behind v2)');
  });

  it('says up to date without the fuss when it is', () => {
    const line = formatRow(
      { ...row, version: { local: 2, active: 2, observedAt: null } },
      4000,
    );
    expect(line).toContain('v2');
    expect(line).not.toContain('behind');
  });

  it('says not known rather than inventing a version', () => {
    expect(formatRow(row, 4000)).toContain('version not known');
    expect(formatRow(row, 4000)).toContain('behaviour not known');
  });

  it('names the pools and the group behind them', () => {
    expect(formatRow(row, 4000)).toContain('Pool One [Fast Pool]');
  });
});

/*
 * The two totals the guide and the signer set are each right about, and the
 * pools that sit between them. Worked out here rather than by hand the next
 * time somebody notices the percentages disagree.
 */
describe('reconcile', () => {
  const seated: SignerWeight = {
    signerKey: BARE,
    signerAddress: 'SP2X',
    weight: 100,
    weightPercent: 2.5,
    stackedUstx: 900n,
  };

  it('takes the slot count from the answer rather than a constant', () => {
    // 4000 today, 4200 if the prepare phase is paid too. Reading it means the
    // report cannot be wrong about it on the day it changes.
    const books = reconcile([], 1000n, new Map([[BARE, seated]]));
    expect(books.totalSlots).toBe(100);
    expect(books.seatedUstx).toBe(900n);
  });

  it('names the pool that is stacked with no seat', () => {
    // The whole of the difference between the two totals, and the reason the
    // guide's percentages sit a shade under the signer set's.
    const rows = [
      {
        signerKey: BARE,
        pools: ['No Seat'],
        groups: [],
        ourUstx: 100n,
        weight: null,
        version: null,
        behaviour: null,
        region: null,
      } satisfies NodeRow,
    ];
    const books = reconcile(rows, 1000n, new Map([[BARE, seated]]));
    expect(books.stackedWithoutSeat).toEqual([{ name: 'No Seat', ustx: 100n }]);
    expect(books.ourUstx - books.seatedUstx).toBe(100n);
  });

  it('names the seat with no pool, which is usually a rotated key', () => {
    const stranger = `02${'c'.repeat(64)}`;
    const rows = [
      {
        signerKey: stranger,
        pools: [],
        groups: [],
        ourUstx: null,
        weight: { ...seated, signerKey: stranger, stackedUstx: 900n },
        version: null,
        behaviour: null,
        region: null,
      } satisfies NodeRow,
    ];
    const books = reconcile(rows, 1000n, new Map([[stranger, seated]]));
    expect(books.seatsWithoutPool).toEqual([
      { signerKey: stranger, ustx: 900n },
    ]);
  });

  it('leaves a pool with nothing staked out of the gap', () => {
    // An empty pool has no seat and no stake; it is not a discrepancy.
    const rows = [
      {
        signerKey: BARE,
        pools: ['Empty'],
        groups: [],
        ourUstx: 0n,
        weight: null,
        version: null,
        behaviour: null,
        region: null,
      } satisfies NodeRow,
    ];
    expect(reconcile(rows, 0n, new Map()).stackedWithoutSeat).toEqual([]);
  });
});
