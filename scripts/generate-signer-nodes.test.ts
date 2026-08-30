/**
 * What the published node file is allowed to say.
 *
 * It carries two claims nothing else in the guide makes — that a signer has
 * been missing blocks, and that a key holds a seat — so the parts worth
 * testing are the ones that decide whether a claim gets written at all: a run
 * that read nothing must not replace a good file with an empty one, and a
 * figure that could not be read must reach the file as null rather than zero.
 */

import { describe, expect, it } from 'vitest';
import committed from '../src/data/signer-nodes.json' with { type: 'json' };
import { toRecord, worthWriting } from './generate-signer-nodes.js';
import type { NodeRow } from './signer-nodes-report.js';
import type { SignerNodesData } from '../src/lib/types.js';

const BARE = `02${'a'.repeat(64)}`;

const row: NodeRow = {
  signerKey: BARE,
  pools: ['Pool One'],
  groups: ['Fast Pool'],
  ourUstx: 1_000n,
  weight: {
    signerKey: BARE,
    signerAddress: 'SP2X',
    weight: 785,
    weightPercent: 19.625,
    stackedUstx: 82_681_580_000_000n,
  },
  version: { local: 2, active: 2, observedAt: '2026-08-30T00:00:00.000Z' },
  behaviour: {
    name: null,
    participationRate: 0.98,
    degradationRate: 0.02,
    signedCount: 49,
    missedCount: 1,
    acceptedCount: 48,
    rejectedCount: 1,
    preCommitRate: 0.98,
  },
  region: null,
};

describe('toRecord', () => {
  it('writes the amounts as strings, because they do not fit in a number', () => {
    const record = toRecord(row);
    expect(record.seat?.stackedUstx).toBe('82681580000000');
    expect(record.ourUstx).toBe('1000');
  });

  it('keeps a missing figure missing', () => {
    // Null is "not read". A zero here would say a signer signed nothing, or
    // holds no seat, about one that may be the largest on the network.
    const record = toRecord({
      ...row,
      ourUstx: null,
      weight: null,
      version: null,
      behaviour: null,
    });
    expect(record.ourUstx).toBeNull();
    expect(record.seat).toBeNull();
    expect(record.version).toBeNull();
    expect(record.behaviour).toBeNull();
  });

  it('carries no region, because the file has no such field', () => {
    // Not an empty column: nothing ties a signer key to a place, so the shape
    // does not offer somewhere to put a guess.
    expect('region' in toRecord(row)).toBe(false);
  });
});

describe('worthWriting', () => {
  it('refuses a run that read no seats at all', () => {
    // The seats are the point and they come from the chain. A file of nulls
    // would replace a good answer with "the signer set is empty".
    expect(worthWriting([])).toBe(false);
    expect(worthWriting([toRecord({ ...row, weight: null })])).toBe(false);
  });

  it('writes when the chain answered, even if nothing else did', () => {
    // The version and behaviour columns come from somebody else's service.
    // Losing them costs those columns, not the file.
    const record = toRecord({ ...row, version: null, behaviour: null });
    expect(worthWriting([record])).toBe(true);
  });
});

describe('the committed file', () => {
  const data = committed as SignerNodesData;

  it('says how many slots there were rather than assuming', () => {
    // 4000 today. It was 3712 in cycle 140, so nothing here may hardcode it.
    expect(data.slots).toBeGreaterThan(0);
    const seated = data.nodes.filter((node) => node.seat !== null);
    const slots = seated.reduce((sum, node) => sum + (node.seat?.weight ?? 0), 0);
    expect(slots).toBe(data.slots);
  });

  it('keeps the two totals apart, and the seated one is the smaller', () => {
    // The guide divides by what pox-5 counts as stacked; the signer set
    // divides by what got a seat. Anyone stacked without a slot is the gap.
    expect(BigInt(data.seatedUstx)).toBeLessThanOrEqual(BigInt(data.stackedUstx));
    const seated = data.nodes.reduce(
      (sum, node) => sum + BigInt(node.seat?.stackedUstx ?? '0'),
      0n,
    );
    expect(seated.toString()).toBe(data.seatedUstx);
  });

  it('prices a slot at the seated STX over the slots', () => {
    expect(data.ustxPerSlot).not.toBeNull();
    expect(BigInt(data.ustxPerSlot!)).toBe(
      BigInt(data.seatedUstx) / BigInt(data.slots),
    );
  });

  it('explains every pool that holds STX and has no seat', () => {
    /*
     * There are exactly two ways to be stacked without a seat, and the file
     * has one of each:
     *
     *   under half a slot   slots are shared in proportion and rounded, so a
     *                       signer holding less than half of one rounds to
     *                       nothing however far above the staking threshold
     *                       it is.
     *   a rotated key       the cycle's signer set was fixed with the key the
     *                       contract had then. The stake is seated, under a
     *                       key this guide cannot name.
     *
     * A third kind would mean the arithmetic has a hole in it, so the test is
     * written to fail rather than to pass on a shrug.
     */
    const half = BigInt(data.ustxPerSlot!) / 2n;
    const unnamedSeats = data.nodes
      .filter((node) => node.pools.length === 0 && node.seat !== null)
      .map((node) => BigInt(node.seat!.stackedUstx));

    for (const node of data.nodes) {
      if (node.seat !== null) continue;
      const held = BigInt(node.ourUstx ?? '0');
      if (held === 0n || held < half) continue;

      expect(
        unnamedSeats.some((amount) => amount === held),
        `${node.pools.join(', ')} holds ${held}, has no seat, and no unnamed ` +
          'seat holds that amount — so it is neither too small nor a rotation',
      ).toBe(true);
    }
  });

  it('has at least one of each, which is why the rule above is worded so', () => {
    // If either disappears the comment above stops being about this file, and
    // whoever reads it next should be told rather than left to assume.
    const half = BigInt(data.ustxPerSlot!) / 2n;
    const unseated = data.nodes.filter(
      (node) => node.seat === null && BigInt(node.ourUstx ?? '0') > 0n,
    );
    const tooSmall = unseated.filter(
      (node) => BigInt(node.ourUstx ?? '0') < half,
    );
    expect(tooSmall.length).toBeGreaterThan(0);
    expect(unseated.length).toBeGreaterThan(tooSmall.length);
  });
});
