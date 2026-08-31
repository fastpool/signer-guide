/**
 * The one record of a rotation there is.
 *
 * Nothing on chain announces one, so this log is not a convenience — it is the
 * only account. Which makes the false positive the thing to guard against: a
 * contract that would not answer for one run must never enter the permanent
 * record as an operator changing keys.
 */

import { describe, expect, it } from 'vitest';
import { mergeRotations, rotationsBetween } from './key-rotations';
import type { KeyRotation } from '../src/lib/types';

const AT = { observedAt: '2026-08-28T05:29:04Z', cycle: 142 };
const signer = (contractId: string, signerKey?: string) => ({
  contractId,
  signerKey,
});

describe('what changed between two runs', () => {
  it('records a key that changed under a contract', () => {
    const found = rotationsBetween(
      [signer('SP1.pool', '0x02bd')],
      [signer('SP1.pool', '0x0381')],
      AT,
    );
    expect(found).toEqual([
      { contractId: 'SP1.pool', from: '0x02bd', to: '0x0381', ...AT },
    ]);
  });

  it('says nothing about a pool that has not moved', () => {
    expect(
      rotationsBetween(
        [signer('SP1.pool', '0x02bd')],
        [signer('SP1.pool', '0x02bd')],
        AT,
      ),
    ).toEqual([]);
  });

  it('does not read a pool the guide is meeting as a rotation', () => {
    // A contract that was not in the last run has not changed its key; it has
    // appeared. Every new signer would otherwise arrive with a rotation.
    expect(rotationsBetween([], [signer('SP1.pool', '0x02bd')], AT)).toEqual([]);
  });

  it('does not read an unanswered contract as a rotation', () => {
    /*
     * `signerKey` is absent when the contract would not answer this run. A node
     * having a bad minute must not enter the record as an operator changing
     * keys — nor, when it answers again, as changing them back.
     */
    expect(
      rotationsBetween(
        [signer('SP1.pool', '0x02bd')],
        [signer('SP1.pool')],
        AT,
      ),
    ).toEqual([]);
    expect(
      rotationsBetween(
        [signer('SP1.pool')],
        [signer('SP1.pool', '0x02bd')],
        AT,
      ),
    ).toEqual([]);
  });
});

describe('the log', () => {
  const one: KeyRotation = {
    contractId: 'SP1.pool',
    from: '0x02bd',
    to: '0x0381',
    observedAt: '2026-08-28T05:29:04Z',
    cycle: 142,
  };

  it('does not record the same rotation twice under two timestamps', () => {
    // The refresh writes one down the hour it happens; the backfill finds the
    // same one in git with the commit's timestamp. They are one rotation.
    const merged = mergeRotations(
      [one],
      [{ ...one, observedAt: '2026-08-28T05:29:11+00:00' }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].observedAt).toBe(one.observedAt);
  });

  it('keeps a second rotation of the same contract', () => {
    const again: KeyRotation = {
      ...one,
      from: '0x0381',
      to: '0x03aa',
      observedAt: '2026-09-04T11:00:00Z',
    };
    expect(mergeRotations([one], [again])).toHaveLength(2);
  });

  it('holds them oldest first', () => {
    const older: KeyRotation = {
      ...one,
      contractId: 'SP2.pool',
      observedAt: '2026-07-01T00:00:00Z',
    };
    expect(mergeRotations([one], [older]).map((r) => r.contractId)).toEqual([
      'SP2.pool',
      'SP1.pool',
    ]);
  });
});
