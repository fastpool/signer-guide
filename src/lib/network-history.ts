/**
 * The whole network, cycle by cycle: what was staked, with how many signers
 * and pools, what it paid and what that was as a yield.
 *
 * Every figure comes from a file the refresh already writes, so building it
 * costs no chain calls:
 *
 *   staked, signers, pools   the signers' histories in src/data/signers/,
 *                            which hold every contract's amount per cycle.
 *                            Their sum is what pox-5 counted for the cycle.
 *   rate, rewards            stx-only-history.json: pox-5's rewards-per-token
 *                            at each payout. The STX-only rewards of a cycle
 *                            are the STX-only stake times that figure.
 *   price                    recorded with each payout, so a cycle's APY is
 *                            measured against the price it was paid at.
 *
 * How things are counted, because each one is a choice:
 *
 *  - A **signer** is a signer key with any stake in the cycle.
 *  - A **pool** is a contract with any stake, except that the contracts of a
 *    group of kind "stake" count once: Stacking DAO is one place to stake,
 *    however many contracts it runs it through. Operator groups (Fast Pool,
 *    Xverse) are several pools by one operator, and count as several.
 *  - **Rewards** are the STX-only part. A bond signer's bond share is paid on
 *    top and is not on file per cycle, so it is not in the total.
 *  - **APY** is the same method as everywhere else on the page
 *    (`apyPercent`): each payout's rate against the price at that payout,
 *    compounded over fifty payouts a year, averaged over the cycle's payouts.
 *
 * Pure, and free of React and bundled data, so the refresh script and the
 * phone app can both use it.
 */

import { bondParts, sumParts } from './bond-stake';
import { rateFromRewardsPerUstx } from './rewards-rate';
import { apyPercent } from './rate-view';
import type {
  NetworkCycle,
  NetworkHistory,
  NetworkPayout,
  StxOnlyDistribution,
} from './types';

/** pox-5's PRECISION: rewards-per-token are fixed point with 18 decimals. */
const PRECISION = 10n ** 18n;

/** What the builder needs of one signer's history file. */
export interface KeyHistoryInput {
  signerKey: string | null;
  cycles: readonly {
    cycle: number;
    ustx: Record<string, string | null>;
    /** The bond part of `ustx`, when the history has a checked split. */
    bondUstx?: Record<string, Record<string, string>>;
  }[];
}

/** What the builder needs of a signer group. */
export interface GroupInput {
  id: string;
  kind: string;
  members: readonly { signerKey?: string; contractId?: string }[];
}

/**
 * The old test for bond stake, by contract name. Only a fallback now, for a
 * cycle whose history has no checked split: it is right for the bond-only
 * contracts and blind to bond stakers in ordinary pools.
 */
export function isBondContract(contractId: string): boolean {
  return contractId.includes('signer-manager-bond-');
}

/** The bond part of one contract's stake in one cycle of a history. */
function bondPartOf(
  cycle: KeyHistoryInput['cycles'][number],
  contractId: string,
  ustx: bigint,
): bigint {
  if (cycle.bondUstx) return sumParts(bondParts(cycle.bondUstx, [contractId]));
  return isBondContract(contractId) ? ustx : 0n;
}

/**
 * The "stake" group a contract belongs to, or null.
 *
 * A member may name a contract or a whole key; both are honoured, as in
 * `groupsForContract`.
 */
function stakeGroupOf(
  contractId: string,
  signerKey: string | null,
  groups: readonly GroupInput[],
): string | null {
  for (const group of groups) {
    if (group.kind !== 'stake') continue;
    const member = group.members.some(
      (m) =>
        m.contractId === contractId ||
        (signerKey !== null && m.signerKey === signerKey),
    );
    if (member) return group.id;
  }
  return null;
}

const big = (value: string | null | undefined): bigint | null => {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

/**
 * Each cycle's payouts, with what each one paid on its own.
 *
 * The rate of the second payout is the cumulative figure minus the first's,
 * worked out here rather than taken from the file: the file's per-payout rate
 * is filled in by whichever run saw it, and has been wrong once (cycle 145).
 */
function payoutsByCycle(
  distributions: readonly StxOnlyDistribution[],
): Map<number, { payouts: NetworkPayout[]; cumulative: bigint }> {
  const out = new Map<
    number,
    { payouts: NetworkPayout[]; cumulative: bigint }
  >();
  const ordered = [...distributions].sort(
    (a, b) => a.burnHeight - b.burnHeight,
  );
  for (const entry of ordered) {
    const cumulative = big(entry.cumulativeRewardsPerUstx);
    if (cumulative === null) continue;
    const cycle = out.get(entry.cycle) ?? { payouts: [], cumulative: 0n };
    const before = entry.firstOfCycle ? 0n : cycle.cumulative;
    const paid = cumulative >= before ? cumulative - before : 0n;
    cycle.payouts.push({
      burnHeight: entry.burnHeight,
      firstOfCycle: entry.firstOfCycle,
      rateSatsPer1000Stx: rateFromRewardsPerUstx(paid).toString(),
      stxPriceSats: entry.stxPriceSats ?? null,
      btcPriceUsd: entry.btcPriceUsd ?? null,
    });
    cycle.cumulative = cumulative;
    out.set(entry.cycle, cycle);
  }
  return out;
}

/** The overview, newest cycle first. Cycles nobody staked in are left out. */
export function buildNetworkHistory(opts: {
  keyHistories: readonly KeyHistoryInput[];
  distributions: readonly StxOnlyDistribution[];
  groups: readonly GroupInput[];
  generatedAt: string;
}): NetworkHistory {
  interface Tally {
    staked: bigint;
    bond: bigint;
    signers: Set<string>;
    pools: Set<string>;
  }
  const tallies = new Map<number, Tally>();

  for (const history of opts.keyHistories) {
    for (const cycle of history.cycles) {
      let keyHasStake = false;
      for (const [contractId, raw] of Object.entries(cycle.ustx)) {
        const ustx = big(raw);
        if (ustx === null || ustx <= 0n) continue;
        keyHasStake = true;
        const tally = tallies.get(cycle.cycle) ?? {
          staked: 0n,
          bond: 0n,
          signers: new Set<string>(),
          pools: new Set<string>(),
        };
        tally.staked += ustx;
        tally.bond += bondPartOf(cycle, contractId, ustx);
        const group = stakeGroupOf(contractId, history.signerKey, opts.groups);
        tally.pools.add(group ? `group:${group}` : contractId);
        tallies.set(cycle.cycle, tally);
      }
      if (keyHasStake) {
        tallies
          .get(cycle.cycle)!
          .signers.add(
            history.signerKey ?? `contract:${Object.keys(cycle.ustx)[0]}`,
          );
      }
    }
  }

  const paid = payoutsByCycle(opts.distributions);
  const cycles: NetworkCycle[] = [...tallies.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cycle, tally]) => {
      const rewards = paid.get(cycle);
      const stxOnly = tally.staked - tally.bond;
      return {
        cycle,
        stakedUstx: tally.staked.toString(),
        bondUstx: tally.bond.toString(),
        signers: tally.signers.size,
        pools: tally.pools.size,
        rewardsPerUstx: rewards ? rewards.cumulative.toString() : null,
        stxOnlyRewardsSats: rewards
          ? ((stxOnly * rewards.cumulative) / PRECISION).toString()
          : null,
        payouts: rewards?.payouts ?? [],
      };
    });

  return { generatedAt: opts.generatedAt, cycles };
}

/** The cycle's rate so far, sats per 1000 STX, or null before a payout. */
export function cycleRateSatsPer1000Stx(cycle: NetworkCycle): bigint | null {
  const value = big(cycle.rewardsPerUstx);
  return value === null ? null : rateFromRewardsPerUstx(value);
}

/**
 * The cycle's APY: each payout's rate against the price at that payout,
 * compounded as everywhere else on the page, averaged over the payouts that
 * have a price. Null when none has.
 */
export function cycleApyPercent(cycle: NetworkCycle): number | null {
  const each: number[] = [];
  for (const payout of cycle.payouts) {
    const price = big(payout.stxPriceSats);
    const rate = big(payout.rateSatsPer1000Stx);
    if (price === null || rate === null || price <= 0n) continue;
    const apy = apyPercent({ rateSatsPer1000Stx: rate, stxPriceSats: price });
    if (apy !== null) each.push(apy);
  }
  if (each.length === 0) return null;
  return each.reduce((sum, value) => sum + value, 0) / each.length;
}

/** Both payouts are in. */
export function cycleComplete(cycle: NetworkCycle): boolean {
  return (
    cycle.payouts.some((p) => p.firstOfCycle) &&
    cycle.payouts.some((p) => !p.firstOfCycle)
  );
}

/** Rewards in dollars, at the BTC price of the cycle's last payout. */
export function cycleRewardsUsd(cycle: NetworkCycle): number | null {
  const sats = big(cycle.stxOnlyRewardsSats);
  const last = [...cycle.payouts].reverse().find((p) => p.btcPriceUsd != null);
  if (sats === null || !last?.btcPriceUsd) return null;
  return (Number(sats) / 1e8) * last.btcPriceUsd;
}

/**
 * Written by a script in this repo, so not a trust boundary; but a shape that
 * changed under a build still in somebody's cache should read as "nothing on
 * file" rather than break the page.
 */
export function isNetworkHistory(value: unknown): value is NetworkHistory {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<NetworkHistory>;
  if (!Array.isArray(data.cycles)) return false;
  return data.cycles.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof c.cycle === 'number' &&
      typeof c.stakedUstx === 'string' &&
      /^\d+$/.test(c.stakedUstx) &&
      typeof c.signers === 'number' &&
      typeof c.pools === 'number' &&
      Array.isArray(c.payouts),
  );
}
