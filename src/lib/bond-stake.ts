/**
 * How much of a pool's stake backs a BTC bond, and which bond.
 *
 * pox-5 counts two kinds of STX towards a signer: STX-only stake, which earns
 * the one STX-only rate, and STX registered alongside a bond, which is paid
 * out of the bond share instead. `get-amount-delegated-for-signer` adds the two
 * together and has no read that tells them apart, so the split comes from the
 * replay of pox-5's membership prints (scripts/bond-stake.ts) and is only
 * written down for a contract whose replayed rows add up to the chain's total.
 *
 * The guide used to tell bond stake apart by contract name
 * (`signer-manager-bond-*`). That missed every pool that takes bond stakers
 * alongside ordinary ones — Xverse, Stacks Labs, Fast Pool, Hashkeycloud —
 * and a pool registering for a bond next cycle would have been missed too.
 *
 * Up to six bonds run at once (a new period every two cycles, twelve cycles
 * long), so the split is kept bond by bond rather than as one number.
 *
 * Pure, so the phone app and the scripts can use it as it is.
 */

import type { BondStake, LockedTotals, SignerCycleSummary } from './types';

/** One bond's part of a pool's stake. `bondIndex` is null when not printed. */
export interface BondPart {
  bondIndex: number | null;
  ustx: bigint;
}

/** The key a bond index is filed under; `?` for a print that carried none. */
export function bondKey(bondIndex: number | null): string {
  return bondIndex === null ? '?' : String(bondIndex);
}

function indexFromKey(key: string): number | null {
  return /^\d+$/.test(key) ? Number(key) : null;
}

function big(raw: string | null | undefined): bigint | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

/**
 * The bond parts of one or more contracts, added up bond by bond.
 *
 * Several contracts because a signer key can carry more than one, and the
 * page for one pool talks about the key. Oldest bond first; a bond with no
 * printed index last.
 */
export function bondParts(
  split: Record<string, Record<string, string>> | undefined,
  contractIds: readonly string[],
): BondPart[] {
  if (!split) return [];
  const byKey = new Map<string, bigint>();
  for (const contractId of contractIds) {
    for (const [key, raw] of Object.entries(split[contractId] ?? {})) {
      const ustx = big(raw);
      if (ustx === null || ustx <= 0n) continue;
      byKey.set(key, (byKey.get(key) ?? 0n) + ustx);
    }
  }
  return [...byKey.entries()]
    .map(([key, ustx]) => ({ bondIndex: indexFromKey(key), ustx }))
    .sort((a, b) => {
      if (a.bondIndex === null) return 1;
      if (b.bondIndex === null) return -1;
      return a.bondIndex - b.bondIndex;
    });
}

/** All of `parts` together. */
export function sumParts(parts: readonly BondPart[]): bigint {
  return parts.reduce((total, part) => total + part.ustx, 0n);
}

/** The split for one cycle out of a totals file, or undefined if not on file. */
export function bondStakeFor(
  totals: Pick<LockedTotals, 'bond'> | null | undefined,
  cycle: number,
): BondStake | undefined {
  return totals?.bond?.[String(cycle)];
}

/**
 * The uSTX of `contractIds` that back a bond in this cycle.
 *
 * Zero for a pool the split was checked for and found none; null when it is
 * not known — no split on file for the cycle, or a contract whose replay did
 * not add up. Null is never shown as zero: that would call bond stake STX-only.
 */
export function bondUstxOf(
  stake: BondStake | undefined,
  contractIds: readonly string[],
): bigint | null {
  if (!stake) return null;
  if (contractIds.some((id) => stake.unknown.includes(id))) return null;
  return sumParts(bondParts(stake.ustx, contractIds));
}

/** Every pool in the cycle with bond stake, largest first. */
export function poolsWithBondStake(
  stake: BondStake | undefined,
): { contractId: string; parts: BondPart[]; ustx: bigint }[] {
  if (!stake) return [];
  return Object.keys(stake.ustx)
    .map((contractId) => {
      const parts = bondParts(stake.ustx, [contractId]);
      return { contractId, parts, ustx: sumParts(parts) };
    })
    .filter((row) => row.ustx > 0n)
    .sort((a, b) => (b.ustx > a.ustx ? 1 : b.ustx < a.ustx ? -1 : 0));
}

/** Everything in the cycle behind one bond, pool by pool. */
export function poolsInBond(
  stake: BondStake | undefined,
  bondIndex: number,
): { contractId: string; ustx: bigint }[] {
  return poolsWithBondStake(stake)
    .map((row) => ({
      contractId: row.contractId,
      ustx: row.parts.find((part) => part.bondIndex === bondIndex)?.ustx ?? 0n,
    }))
    .filter((row) => row.ustx > 0n)
    .sort((a, b) => (b.ustx > a.ustx ? 1 : b.ustx < a.ustx ? -1 : 0));
}

/** All bond stake in the cycle, for every pool the split could check. */
export function totalBondUstx(stake: BondStake | undefined): bigint | null {
  if (!stake) return null;
  return poolsWithBondStake(stake).reduce((sum, row) => sum + row.ustx, 0n);
}

/**
 * One cycle of a signer's history: the bond parts of these contracts, or null
 * when the history has no checked split for that cycle.
 */
export function historyBondUstx(
  summary: Pick<SignerCycleSummary, 'bondUstx'>,
  contractIds: readonly string[],
): bigint | null {
  if (!summary.bondUstx) return null;
  return sumParts(bondParts(summary.bondUstx, contractIds));
}
