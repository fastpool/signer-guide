/**
 * Which contracts are one signer node, and what to call the result.
 *
 * A node is one signer key. A key can have several signer-manager contracts
 * registered against it — four of them do — and everything the key decides is
 * decided on those contracts together: the stake behind it, its weight, the
 * slots it holds. Read per contract, half a node looks like a small pool and
 * the other half looks like another one. The argument is made at length at the
 * top of scripts/signer-members.ts.
 *
 * A node is not a *group*. A group is a set of nodes behind one entity — the
 * two Fast Pool contracts, the three Xverse nodes, everything Stacking DAO
 * delegates to — and that is `signer-groups.ts`, which is written by hand
 * because nothing on chain says who runs what.
 *
 * Nothing in here imports anything. The page groups contracts into nodes to
 * draw one and the refresh does it to read one, so this is the definition they
 * share: a file written by the script is a file the page can find. Keep it
 * free of React and of `import.meta`, or `scripts/` can no longer import it.
 */

import type { CycleMember, Signer, SignerCycleSummary } from './types';

/** One signer key, and every contract registered against it. */
export interface SignerNode {
  /** Null for a contract whose key is unknown, which joins with nothing. */
  signerKey: string | null;
  contracts: Signer[];
}

/**
 * The signers behind a list of pools.
 *
 * Contracts sharing a key are one signer. A contract with no key on file is
 * a node of its own rather than joining a "no key" pile: an unknown key is not
 * evidence of a shared one, and merging on it would invent a signer.
 */
export function nodesBySignerKey(signers: Signer[]): SignerNode[] {
  const nodes: SignerNode[] = [];
  const byKey = new Map<string, SignerNode>();

  for (const signer of signers) {
    const key = signer.signerKey;
    if (!key) {
      nodes.push({ signerKey: null, contracts: [signer] });
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.contracts.push(signer);
      continue;
    }
    const node: SignerNode = { signerKey: key, contracts: [signer] };
    byKey.set(key, node);
    nodes.push(node);
  }

  return nodes;
}

/** The signer a contract belongs to, siblings included. */
export function nodeForContract(
  signers: Signer[],
  contractId: string,
): SignerNode | null {
  return (
    nodesBySignerKey(signers).find((node) =>
      node.contracts.some((contract) => contract.contractId === contractId),
    ) ?? null
  );
}

/**
 * What a signer's files are called.
 *
 * The key itself, which is the identity, with a contract id standing in for a
 * signer that has no key on file. The two cannot collide — a key is lower-case
 * hex and a contract id starts with an upper-case address — and both are
 * stable, which is what matters here: a slug that moved between refreshes
 * would orphan every file already written under the old one.
 */
export function signerSlug(node: SignerNode): string {
  if (node.signerKey) return node.signerKey.replace(/^0x/, '');
  return node.contracts[0].contractId;
}

/**
 * What a cycle is to a reader.
 *
 * Read off `cycleFinal` — the cycle's own state — never off `fileFinal`, which
 * is only about whether the generator will look again. The two differ for the
 * current cycle, and reading the wrong one labels the cycle somebody is
 * standing in as one they can still join.
 *
 *   filling   nobody has closed it yet; the next cycle, still accepting stakers
 *   active    closed, and the one earning right now
 *   done      closed, and behind us
 *   unknown   a file written before these flags existed
 *
 * `unknown` is why both arguments are optional. The page reads the published
 * branch, so it meets older files, and the standings are the one thing in them
 * that cannot be worked out. Every other number is still good, so the answer is
 * to show the rest and say nothing about the standing — not to guess, and not
 * to discard the file. Defaulting to `done` would quietly mark the cycle a
 * reader could still join as finished.
 */
export type CycleStanding = 'filling' | 'active' | 'done' | 'unknown';

export function cycleStanding(
  cycle: Pick<SignerCycleSummary, 'cycle' | 'cycleFinal'>,
  currentCycle: number | undefined,
): CycleStanding {
  if (typeof cycle.cycleFinal !== 'boolean') return 'unknown';
  if (!cycle.cycleFinal) return 'filling';
  // Closed. Which of the two closed states it is needs the current cycle, and
  // without it "closed" is all we can honestly say.
  if (typeof currentCycle !== 'number') return 'unknown';
  return cycle.cycle === currentCycle ? 'active' : 'done';
}

/** Sum of the amounts we could read; contracts we could not are left out. */
export function sumCycleUstx(
  ustx: Record<string, string | null>,
): bigint | null {
  let total = 0n;
  let known = false;
  for (const amount of Object.values(ustx)) {
    if (amount === null) continue;
    total += BigInt(amount);
    known = true;
  }
  return known ? total : null;
}

/** What a signer is holding for a cycle, across every contract on its key. */
export function nodeUstx(
  node: SignerNode,
  ustx: Record<string, string | null>,
): bigint | null {
  let total = 0n;
  let known = false;
  for (const contract of node.contracts) {
    const amount = ustx[contract.contractId];
    if (amount === null || amount === undefined) continue;
    total += BigInt(amount);
    known = true;
  }
  return known ? total : null;
}

/**
 * A signer's weight in the cycle, in hundredths of a percent.
 *
 * pox-5 weights a signer by the STX stacked behind it, so its share of the
 * cycle's total *is* its say — in the signer set, and in everything the set
 * votes on. The guide listed the keys and stopped there, which left the one
 * question a reader of a signer list is asking unanswered: how much of the
 * network is this one.
 *
 * The unit is the key rather than the contract, for the reason at the top of
 * this file: a key with four contracts registered against it votes with all
 * four, and a quarter of it read on its own is a quarter of the truth.
 *
 * Null when either half is unknown. A signer whose amount the refresh could
 * not read has an unknown weight, never a zero one — and the denominator has
 * to be the whole cycle, which `sumCycleUstx` over the committed amounts is:
 * every registered signer is in that file, and the sum of it is what pox-5
 * reports staked (see scripts/staked-total.test.ts).
 *
 * Integer arithmetic on the uSTX, like `shareBips`, because these are numbers
 * with fifteen digits in them.
 */
export function votingPowerBips(
  node: SignerNode,
  ustx: Record<string, string | null>,
): number | null {
  const mine = nodeUstx(node, ustx);
  const total = sumCycleUstx(ustx);
  if (mine === null || total === null || total === 0n) return null;
  return Number((mine * 10_000n) / total);
}

/**
 * A member's share of the cycle, in hundredths of a percent.
 *
 * Integer arithmetic on the uSTX rather than floating point on the STX: a
 * member of a 44-million-STX signer is a number with fifteen digits in it, and
 * `Number` starts dropping them at sixteen.
 */
export function shareBips(member: CycleMember, total: bigint): number {
  if (total === 0n) return 0;
  return Number((BigInt(member.ustx) * 10_000n) / total);
}
