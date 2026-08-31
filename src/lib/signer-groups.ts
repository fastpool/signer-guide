/**
 * Who is behind a set of signer nodes.
 *
 * A node is one signer key — see `signer-nodes.ts`. A *group* is a set of
 * nodes with one entity behind them, and the chain does not say who that is.
 * Fast Pool runs two contracts under two keys; Xverse runs three; Stacking DAO
 * runs one node of its own and delegates to eight it does not run. Read node
 * by node, each of those looks like a stranger holding a few percent, and a
 * reader counting up who can move the signer set has to already know.
 *
 * So this is written by hand, and every entry says what it is based on. That
 * is the whole discipline of the file: a claim about who controls a fifth of
 * the network is the most consequential thing this guide says, and it is not
 * one the refresh can check. `source` is required for that reason, and it
 * should name evidence a reader can follow — a shared deployer address, a
 * published statement — not "we know".
 *
 * Two kinds, and the difference is real:
 *
 *   operator  one entity runs these nodes. Its weight is every contract on
 *             every key it holds, because the keys are its own.
 *   stake     the nodes are independent, but the STX behind these contracts
 *             comes from one entity. Its weight is those contracts and not the
 *             rest of what those nodes hold.
 *
 * A node can be in both, and one is: the key behind Xverse 2 also holds
 * `signer-manager-xverse-v1`, an invite-only contract Stacking DAO delegates
 * into. Xverse runs the node; Stacking DAO supplies that contract's stake.
 * Listing the node under both would double-count it, which is why membership
 * is per contract as well as per key.
 */

import groups from '../data/signer-groups.json';
import { nodesBySignerKey, type SignerNode } from './signer-nodes';
import type { Signer } from './types';

/**
 * Whether the entity runs the nodes or only supplies the stake.
 *
 * The distinction decides what a percentage means. An operator group's weight
 * is a set of keys it can sign with; a stake group's is STX it can move but
 * cannot sign with. Both are worth knowing and they are not the same power.
 */
export type SignerGroupKind = 'operator' | 'stake';

/**
 * One member of a group: a whole node, or a single contract.
 *
 * Exactly one of the two. A key names every contract registered against it,
 * which is what an operator group wants — it runs the key, so everything on
 * it is its own. A contract id names one deployment and nothing else, which is
 * what a stake group wants: Stacking DAO's STX sits in one contract on a
 * node whose other contracts are somebody else's business.
 */
export interface SignerGroupMember {
  /** Every contract on this key belongs to the group. */
  signerKey?: string;
  /** This one contract belongs to the group; its siblings do not. */
  contractId?: string;
  /** Why this member is in, when the group's own source does not cover it. */
  note?: string;
}

/** A set of signer nodes with one entity behind them. */
export interface SignerGroup {
  /** Slug, and the last part of the group's URL. */
  id: string;
  name: string;
  kind: SignerGroupKind;
  /** One sentence, plain language: who this is. */
  summary: string;
  /** What the claim rests on. Required — see the note at the top. */
  source: string;
  /** The entity's own site, when it has one. */
  url?: string;
  members: SignerGroupMember[];
}

export const GROUPS: Record<string, SignerGroup> = groups as Record<
  string,
  SignerGroup
>;

/** Every group, in the order the file lists them. */
export function allGroups(): SignerGroup[] {
  return Object.values(GROUPS);
}

export function groupById(id: string): SignerGroup | null {
  return GROUPS[id] ?? null;
}

/**
 * The contracts a group covers, deduplicated.
 *
 * A group may name a key and one of that key's contracts — harmlessly, and by
 * hand it will happen — so the set is built as a set. Counting a contract
 * twice would inflate the one number on the page that matters.
 *
 * Members naming something the guide has never seen are skipped rather than
 * invented: a group is only ever as big as the contracts actually on file.
 */
export function groupContracts(
  group: SignerGroup,
  signers: Signer[],
): Signer[] {
  const wanted = new Set<string>();

  for (const member of group.members) {
    if (member.contractId) wanted.add(member.contractId);
    if (!member.signerKey) continue;
    for (const signer of signers) {
      if (signer.signerKey === member.signerKey) wanted.add(signer.contractId);
    }
  }

  return signers.filter((signer) => wanted.has(signer.contractId));
}

/** The nodes a group covers, each carrying only the contracts in the group. */
export function groupNodes(group: SignerGroup, signers: Signer[]): SignerNode[] {
  return nodesBySignerKey(groupContracts(group, signers));
}

/**
 * Every group a contract belongs to.
 *
 * By contract rather than by node, because that is the grain membership is
 * decided at. A node's page asks this of each of its contracts and shows the
 * union — which for the Xverse 2 key is two groups, one for the node and one
 * for the stake in a single contract on it.
 */
export function groupsForContract(contractId: string, signerKey?: string | null): SignerGroup[] {
  return allGroups().filter((group) =>
    group.members.some(
      (member) =>
        member.contractId === contractId ||
        (member.signerKey !== undefined &&
          signerKey != null &&
          member.signerKey === signerKey),
    ),
  );
}

/** Every group any of a node's contracts belongs to, in file order. */
export function groupsForNode(node: SignerNode): SignerGroup[] {
  const found = new Map<string, SignerGroup>();
  for (const contract of node.contracts) {
    for (const group of groupsForContract(contract.contractId, node.signerKey)) {
      found.set(group.id, group);
    }
  }
  return allGroups().filter((group) => found.has(group.id));
}

/**
 * What a group is holding for a cycle, across every contract in it.
 *
 * Null when it holds nothing readable, for the reason `votingPowerBips` gives:
 * a rate limit must not be able to say an entity has no weight. A contract the
 * refresh could not read is left out, so the answer is a floor.
 */
export function groupUstx(
  group: SignerGroup,
  signers: Signer[],
  ustx: Record<string, string | null>,
): bigint | null {
  let total = 0n;
  let known = false;
  for (const contract of groupContracts(group, signers)) {
    const amount = ustx[contract.contractId];
    if (amount === null || amount === undefined) continue;
    total += BigInt(amount);
    known = true;
  }
  return known ? total : null;
}

/**
 * A group's weight in the cycle, in hundredths of a percent.
 *
 * The same arithmetic as a node's, over a larger numerator — and the reason
 * the file exists. Three nodes at six percent each read as three small signers
 * until somebody says they are one company, at which point they are a fifth of
 * a veto.
 */
export function groupVotingPowerBips(
  group: SignerGroup,
  signers: Signer[],
  ustx: Record<string, string | null>,
): number | null {
  return shareBips(groupUstx(group, signers, ustx), ustx);
}

/** What the whole cycle holds, for a share to be a share of something. */
function cycleUstx(ustx: Record<string, string | null>): bigint {
  let total = 0n;
  for (const amount of Object.values(ustx)) {
    if (amount === null) continue;
    total += BigInt(amount);
  }
  return total;
}

/** A slice of the cycle in hundredths of a percent, or null for neither. */
function shareBips(
  mine: bigint | null,
  ustx: Record<string, string | null>,
): number | null {
  if (mine === null) return null;
  const total = cycleUstx(ustx);
  if (total === 0n) return null;
  return Number((mine * 10_000n) / total);
}

/**
 * The contracts no group here claims.
 *
 * The index's honest bottom line. Every group on it is a hand-written claim,
 * and the sum of them is not the network — the rest of the cycle is signers
 * nobody has written down, which is a fact about this file rather than about
 * the chain.
 *
 * By contract rather than by node, because that is the grain a group is
 * decided at: three keys here carry one contract a group claims and one it
 * does not, so "this key is ungrouped" would be false of all three while
 * "this contract is" stays true. A set, so a contract two groups both claim
 * is removed once and never counted as ungrouped by the other.
 */
export function ungroupedContracts(signers: Signer[]): Signer[] {
  const claimed = new Set<string>();
  for (const group of allGroups()) {
    for (const contract of groupContracts(group, signers)) {
      claimed.add(contract.contractId);
    }
  }
  return signers.filter((signer) => !claimed.has(signer.contractId));
}

/** What is staked with those contracts. */
export function ungroupedUstx(
  signers: Signer[],
  ustx: Record<string, string | null>,
): bigint | null {
  let total = 0n;
  let known = false;
  for (const signer of ungroupedContracts(signers)) {
    const amount = ustx[signer.contractId];
    if (amount === null || amount === undefined) continue;
    total += BigInt(amount);
    known = true;
  }
  return known ? total : null;
}

/** The same, as a share of the cycle. */
export function ungroupedVotingPowerBips(
  signers: Signer[],
  ustx: Record<string, string | null>,
): number | null {
  return shareBips(ungroupedUstx(signers, ustx), ustx);
}
