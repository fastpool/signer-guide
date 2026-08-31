/**
 * Which contracts have changed their signer key, and when the guide saw it.
 *
 * The log is written by the refresh and backfilled out of this repository's
 * own commits — see scripts/key-rotations.ts for why it is a log rather than
 * a field on the pool, and scripts/backfill-key-rotations.ts for where the
 * entries from before it existed came from.
 *
 * Two questions get asked of it, and they are asked from opposite ends. A pool
 * page has a contract and wants to know whether the key under it has changed.
 * A node page has a key and wants to know whose it was, because a key that has
 * been rotated away from is the one still holding a seat — signing or not
 * signing for the rest of the cycle — while the pool it belonged to shows
 * nothing at all.
 */

import rotations from '../data/key-rotations.json';
import type { KeyRotation, KeyRotations } from './types';

export const ROTATIONS = (rotations as KeyRotations).rotations;

/** Every rotation of this contract's key, oldest first. */
export function rotationsForContract(contractId: string): KeyRotation[] {
  return ROTATIONS.filter((rotation) => rotation.contractId === contractId);
}

/** The most recent one, or null for a contract that has never rotated. */
export function lastRotation(contractId: string): KeyRotation | null {
  const found = rotationsForContract(contractId);
  return found.length === 0 ? null : found[found.length - 1];
}

/**
 * The rotation that replaced this key, if one did.
 *
 * What it answers on a node page: this key is holding a seat and no pool
 * claims it, and the reason is that the pool moved on. Matched on `from`
 * rather than `to` for that reason — the interesting key is the abandoned one.
 */
export function replacedKey(signerKey: string | null | undefined): KeyRotation | null {
  if (!signerKey) return null;
  const wanted = signerKey.toLowerCase();
  const found = ROTATIONS.filter(
    (rotation) => (rotation.from ?? '').toLowerCase() === wanted,
  );
  return found.length === 0 ? null : found[found.length - 1];
}

/** The key this contract had before its latest rotation, if it has had one. */
export function previousKey(contractId: string): string | null {
  return lastRotation(contractId)?.from ?? null;
}
