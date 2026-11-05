/**
 * Which part of each pool's stake backs a BTC bond, from pox-5's own prints.
 *
 * `get-amount-delegated-for-signer` is the one number pox-5 gives for a
 * signer, and it counts STX-only stake and bond stake together. The prints
 * keep them apart: `register-for-bond` and `update-bond-registration` write a
 * bond row, `stake` and `stake-update` an STX-only one (see
 * scripts/pox5-membership.ts). So the replayed membership map says, staker by
 * staker, which kind each row is and which bond it is for.
 *
 * A replay is only trusted where it can be checked. For each contract the
 * replayed rows are added up and compared with the chain's own total for the
 * cycle; a contract that matches to the microstack has the chain's rows, and
 * its split is written down. One that does not — a print not yet in the copy,
 * a total the node would not give — is listed as unknown, which the page
 * shows as "not known" rather than as "no bond stake".
 *
 * No chain calls: the totals are the ones the caller has already read.
 */

import type { BondStake, LockedTotals } from '../src/lib/types.js';
import { bondKey } from '../src/lib/bond-stake.js';
import {
  applyChange,
  membershipChange,
  membersOf,
  type MembershipEvent,
  type MembershipState,
} from './pox5-membership.js';

/** The membership map the prints describe, replayed in the order given. */
export function replay(entries: readonly MembershipEvent[]): MembershipState {
  const state: MembershipState = new Map();
  for (const entry of entries) {
    const change = membershipChange(entry);
    if (change) applyChange(state, change);
  }
  return state;
}

/**
 * The bond split of one contract in one cycle, or null when the replay does
 * not add up to `onChain`.
 *
 * `{}` for a contract that matches and has no bond rows: checked, and none.
 */
export function contractBondSplit(
  state: MembershipState,
  contractId: string,
  cycle: number,
  onChain: string | null | undefined,
): Record<string, string> | null {
  if (typeof onChain !== 'string' || !/^\d+$/.test(onChain)) return null;
  const rows = membersOf(state, [contractId], cycle);
  const sum = rows.reduce((total, row) => total + row.ustx, 0n);
  if (sum !== BigInt(onChain)) return null;
  const byBond = new Map<string, bigint>();
  for (const row of rows) {
    if (row.bondIndex === undefined) continue; // an STX-only row
    const key = bondKey(row.bondIndex);
    byBond.set(key, (byBond.get(key) ?? 0n) + row.ustx);
  }
  const split: Record<string, string> = {};
  for (const [key, ustx] of [...byBond.entries()].sort()) {
    if (ustx > 0n) split[key] = ustx.toString();
  }
  return split;
}

/** One cycle's split for every contract in `ustx`. */
export function cycleBondStake(
  state: MembershipState,
  cycle: number,
  ustx: Record<string, string | null>,
): BondStake {
  const stake: BondStake = { ustx: {}, unknown: [] };
  for (const contractId of Object.keys(ustx).sort()) {
    const split = contractBondSplit(state, contractId, cycle, ustx[contractId]);
    if (split === null) stake.unknown.push(contractId);
    else if (Object.keys(split).length > 0) stake.ustx[contractId] = split;
  }
  return stake;
}

/** The cycles a totals file holds, with their amounts. */
function cyclesOf(
  totals: LockedTotals,
): { cycle: number; ustx: Record<string, string | null> }[] {
  const out = [{ cycle: totals.cycle, ustx: totals.ustx }];
  if (totals.next)
    out.push({ cycle: totals.next.cycle, ustx: totals.next.ustx });
  if (totals.previous) {
    out.push({ cycle: totals.previous.cycle, ustx: totals.previous.ustx });
  }
  return out;
}

/**
 * `totals` with its `bond` field filled in, for every cycle it holds.
 *
 * Without a replay (no copy of the prints), a cycle keeps the split an earlier
 * file had for it — the same carry-forward the amounts get — and is otherwise
 * left out. A kept split is only kept while the amounts it was checked against
 * are the ones on file now; otherwise it would describe a different total.
 */
export function withBondStake(
  totals: LockedTotals,
  state: MembershipState | null,
  previous: LockedTotals | null,
): LockedTotals {
  const bond: Record<string, BondStake> = {};
  for (const { cycle, ustx } of cyclesOf(totals)) {
    if (state) {
      bond[String(cycle)] = cycleBondStake(state, cycle, ustx);
      continue;
    }
    const kept = previous?.bond?.[String(cycle)];
    const keptAmounts = previous
      ? cyclesOf(previous).find((c) => c.cycle === cycle)
      : undefined;
    if (kept && keptAmounts && sameAmounts(keptAmounts.ustx, ustx)) {
      bond[String(cycle)] = kept;
    }
  }
  const { bond: _old, ...rest } = totals;
  return Object.keys(bond).length > 0 ? { ...rest, bond } : rest;
}

/** Whether two cycles' amounts are the same, contract by contract. */
export function sameAmounts(
  a: Record<string, string | null>,
  b: Record<string, string | null>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}
