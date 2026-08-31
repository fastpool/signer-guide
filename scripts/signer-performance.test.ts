/**
 * Reading a signer's conduct out of somebody else's index.
 *
 * Two things here decide whether the page tells the truth, and neither is
 * about fetching: what a mean of nothing means, and which cycles a run is
 * still allowed to change its mind about.
 */

import { describe, expect, it } from 'vitest';
import {
  bareKey,
  cyclesToRead,
  mergeCycles,
  toRow,
  FIRST_SIGNER_CYCLE,
} from './signer-performance';
import type { SignerCyclePerformance } from '../src/lib/types';

const KEY = `0x${'ab'.repeat(33)}`;

describe('one row', () => {
  it('keeps the counts and the mean as they were read', () => {
    const row = toRow(
      {
        signer_key: KEY,
        weight: 785,
        weight_percentage: 19.625,
        proposals_accepted_count: 33890,
        proposals_rejected_count: 776,
        proposals_missed_count: 156,
        average_response_time_ms: 5386.0376,
        last_seen: '2026-08-31T07:42:40.276Z',
      },
      142,
      false,
    );

    expect(row).toEqual({
      cycle: 142,
      accepted: 33890,
      rejected: 776,
      missed: 156,
      responseMs: 5386,
      lastSeen: '2026-08-31T07:42:40.276Z',
      weight: 785,
      weightPercent: 19.625,
      final: false,
    });
  });

  it('refuses to call a signer that answered nothing the fastest one', () => {
    /*
     * The API reports 0 ms for a signer that never responded, which is not a
     * time — it is the absence of one, and it sorts to the top of any list of
     * the quick. This is the real cycle-142 row for the key Stakin rotated
     * away from: seated, asked about every block, silent.
     */
    const row = toRow(
      {
        signer_key: KEY,
        proposals_accepted_count: 0,
        proposals_rejected_count: 0,
        proposals_missed_count: 33976,
        average_response_time_ms: 0,
        last_seen: null,
      },
      142,
      false,
    )!;

    expect(row.responseMs).toBeNull();
    expect(row.lastSeen).toBeNull();
    expect(row.missed).toBe(33976);
  });

  it('drops a row whose key is not a key', () => {
    expect(toRow({ signer_key: 'nonsense' }, 142, true)).toBeNull();
    expect(toRow({}, 142, true)).toBeNull();
  });

  it('reduces every spelling of a key to one', () => {
    expect(bareKey(KEY)).toBe('ab'.repeat(33));
    expect(bareKey('AB'.repeat(33))).toBe('ab'.repeat(33));
    expect(bareKey('0xabc')).toBeNull();
    expect(bareKey(null)).toBeNull();
  });
});

describe('which cycles a run reads', () => {
  it('reads everything the file is missing, once', () => {
    const wanted = cyclesToRead(142, []);
    expect(wanted[0]).toBe(FIRST_SIGNER_CYCLE);
    expect(wanted[wanted.length - 1]).toBe(142);
    expect(wanted).toHaveLength(142 - FIRST_SIGNER_CYCLE + 1);
  });

  it('reads two once the file is complete: the open cycle and the last one', () => {
    // A cycle that is over cannot move. The one before the current one is
    // re-read exactly once because its row was written mid-flight.
    const onFile = Array.from(
      { length: 142 - FIRST_SIGNER_CYCLE + 1 },
      (_, i) => FIRST_SIGNER_CYCLE + i,
    );
    expect(cyclesToRead(142, onFile)).toEqual([141, 142]);
  });

  it('picks up a cycle an earlier run could not read', () => {
    // The real case: cycle 140 answered nothing on the backfill, and the next
    // hourly run has to notice rather than leave a hole for good.
    const onFile = [138, 139, 141, 142];
    expect(cyclesToRead(142, onFile, { from: 138 })).toEqual([140, 141, 142]);
  });

  it('takes --all as an instruction to read the lot again', () => {
    expect(cyclesToRead(90, [84, 85, 86, 87, 88, 89, 90], { all: true }))
      .toHaveLength(90 - FIRST_SIGNER_CYCLE + 1);
  });
});

describe('merging what was read into what is on file', () => {
  const row = (cycle: number, missed: number): SignerCyclePerformance => ({
    cycle,
    accepted: 10,
    rejected: 0,
    missed,
    responseMs: 5000,
    lastSeen: null,
    weight: 1,
    weightPercent: 0.1,
    final: cycle < 142,
  });

  it('puts the newest cycle first', () => {
    const merged = mergeCycles([row(140, 1)], [row(142, 3), row(141, 2)]);
    expect(merged.map((r) => r.cycle)).toEqual([142, 141, 140]);
  });

  it('lets a fresh reading replace the one on file for the same cycle', () => {
    // How an open cycle's row grows through the fortnight, and how the last
    // reading of it becomes the final one.
    const merged = mergeCycles([row(142, 3)], [row(142, 9)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].missed).toBe(9);
  });
});
