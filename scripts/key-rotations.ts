/**
 * When a contract's signer key changed under it.
 *
 * Nothing on chain announces a rotation and nothing in this guide would have
 * shown one: `signers.json` holds the key a contract has now, and every
 * refresh overwrites it with the key it has now. A pool that swapped keys on a
 * Tuesday looked on Wednesday exactly like a pool that had always had the new
 * one.
 *
 * It matters because a cycle's signer set is fixed before the cycle begins. A
 * key rotated mid-cycle leaves the old one holding the seat — signing, or not
 * signing, for a fortnight — while the new one holds nothing until the next
 * set is computed. Read one cycle at a time that is a pool with no weight
 * beside a weight with no pool, and there is no way to tell it from one signer
 * leaving and another arriving. With the rotation written down there is.
 *
 * So this file is a log, not a snapshot: entries are appended and never
 * rewritten. `observedAt` is when the guide saw the change and not when it
 * happened — the refresh runs hourly, so the truth is somewhere in the hour
 * before it, and claiming a block height for it would be inventing precision
 * the record does not have.
 */

import type { KeyRotation, Signer } from '../src/lib/types.js';

/** Two readings of the pool list, and what changed hands between them. */
export function rotationsBetween(
  before: readonly Pick<Signer, 'contractId' | 'signerKey'>[],
  after: readonly Pick<Signer, 'contractId' | 'signerKey'>[],
  at: { observedAt: string; cycle: number | null },
): KeyRotation[] {
  const previous = new Map(
    before.map((signer) => [signer.contractId, signer.signerKey ?? null]),
  );

  const found: KeyRotation[] = [];
  for (const signer of after) {
    if (!previous.has(signer.contractId)) continue; // A pool the guide is meeting.
    const from = previous.get(signer.contractId) ?? null;
    const to = signer.signerKey ?? null;
    if (from === to) continue;
    /*
     * A key the run could not read is not a rotation. `signerKey` is null when
     * the contract would not answer, and a node having a bad minute must not
     * enter the permanent record as an operator changing keys — nor, when it
     * answers again, as changing them back.
     */
    if (from === null || to === null) continue;
    found.push({ contractId: signer.contractId, from, to, ...at });
  }
  return found;
}

/**
 * The log with new entries added, oldest first.
 *
 * Deduplicated by what happened rather than by when it was noticed: a
 * backfill reading the same rotation out of git that the refresh already
 * wrote down should not record it twice, and the two will not agree on the
 * timestamp to the second.
 */
export function mergeRotations(
  existing: readonly KeyRotation[],
  fresh: readonly KeyRotation[],
): KeyRotation[] {
  const seen = new Set(
    existing.map((r) => `${r.contractId}|${r.from}|${r.to}`),
  );
  const merged = [...existing];
  for (const rotation of fresh) {
    const id = `${rotation.contractId}|${rotation.from}|${rotation.to}`;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(rotation);
  }
  return merged.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}
