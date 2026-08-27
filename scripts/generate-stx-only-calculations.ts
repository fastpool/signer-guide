/**
 * Builds src/data/stx-only-calculations.json.
 *
 * This is the static input for the STX-only rewards estimate UI: the page
 * reads one committed file instead of making live chain calls in the browser.
 *
 * Usage: npx tsx scripts/generate-stx-only-calculations.ts
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 *
 * ## Why not the sBTC balance
 *
 * The obvious number to start from is what pox-5 holds in sBTC, and that is
 * what this script used to read. It was right only while nobody had ever been
 * paid: the balance is rewards-not-yet-earned *plus* rewards earned and not
 * yet claimed *plus* the reserve *plus* sBTC staked against bonds. The first
 * `calculate-rewards` ran at burn height 963,199 (cycle 141) and stakers
 * started claiming minutes later, so the balance began falling for a reason
 * that has nothing to do with the rate — and every claim made the estimate
 * smaller.
 *
 * pox-5 keeps the number this actually wants. `get-new-rewards` is the sBTC
 * that has arrived since the last `calculate-rewards` and has not been
 * accounted to anyone: the contract subtracts the reserve, the staked sBTC and
 * `last-accounted-rewards-only` from its balance, and `claim-rewards` lowers
 * `last-accounted-rewards-only` by exactly what it pays out. Claims therefore
 * cancel out, which is the whole point of reading it rather than the balance.
 *
 * ## Why the rate is not only that
 *
 * Read on its own, that number is a fine estimate late in a distribution cycle
 * and a bad one early: an hour after a payout it is a handful of Bitcoin
 * blocks' worth of sBTC deposits multiplied by 1050, and the deposits do not
 * arrive evenly. So the published rate starts at what the last payout actually
 * paid and hands over to this cycle's own figure as the cycle runs — at 5
 * blocks in, this cycle counts for 5/1050 of it; at 900, for 900/1050. Both
 * halves are published separately as well, so the arithmetic stays visible.
 *
 * The realised rate comes from pox-5's `rewards-per-token-for-cycle`, which is
 * cumulative over a reward cycle and so holds one payout's worth only for the
 * first of the two payouts in a cycle. For the second, the first half has to be
 * subtracted — and that value is the one this script wrote last time it ran,
 * which is why it reads its own previous output. A missing or unusable
 * previous file costs the realised half of the blend, not the run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cl, cvToHex } from '@stacks/transactions';
import { describeNode } from './node.js';
import { callReadOnly, uintValue } from './pox5.js';
import {
  payoutPosition,
  publishedRate,
  realisedPayoutRate,
  recordDistribution,
} from './stx-only-rate.js';
import type {
  SignerData,
  LockedTotals,
  StxOnlyCalculations,
  StxOnlyDistribution,
  StxOnlyHistory,
} from '../src/lib/types.js';

const FALLBACK_DISTRIBUTION_BLOCKS = 1050;
const FOUNDATION_SHARE_BIPS = 1500; // 15%, pox-5's RESERVE_RATIO
const USTX_PER_1000_STX = 1_000_000_000n;
const SATS_PER_BTC = 100_000_000;

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SIGNERS = path.join(DATA, 'signers.json');
const TOTALS = path.join(DATA, 'totals.json');
const OUTPUT = path.join(DATA, 'stx-only-calculations.json');
const HISTORY_OUTPUT = path.join(DATA, 'stx-only-history.json');

function sumKnownUstx(
  contractIds: string[],
  totals: Record<string, string | null>,
): bigint {
  let sum = 0n;
  for (const contractId of contractIds) {
    const amount = totals[contractId];
    if (amount === null || amount === undefined) continue;
    sum += BigInt(amount);
  }
  return sum;
}

/**
 * One `uint` read from pox-5, or null if the node would not answer.
 *
 * Null is never a zero here: a rate limit that read as "no rewards yet" would
 * publish a rate of nothing, which is a worse answer than no answer.
 */
async function readUint(functionName: string): Promise<bigint | null> {
  const hex = await callReadOnly(functionName, []);
  if (hex === null) return null;
  try {
    return uintValue(hex);
  } catch {
    return null;
  }
}

/**
 * pox-5's cumulative rewards-per-token for one reward cycle, or null.
 */
async function readCycleRewardsPerUstx(cycle: number): Promise<bigint | null> {
  const hex = await callReadOnly('get-rewards-per-token-for-cycle', [
    cvToHex(Cl.uint(cycle)),
    cvToHex(Cl.none()),
  ]);
  if (hex === null) return null;
  try {
    return uintValue(hex);
  } catch {
    return null;
  }
}

/**
 * What this script wrote last time, or null if there is nothing usable.
 *
 * Only the reward-per-token bookkeeping is taken from it — see the note at the
 * top. Everything else is read from the chain every run.
 */
function readPrevious(): StxOnlyCalculations | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(OUTPUT, 'utf8'),
    ) as StxOnlyCalculations;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function write(data: StxOnlyCalculations): void {
  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
}

function readHistory(): StxOnlyHistory | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(HISTORY_OUTPUT, 'utf8'),
    ) as StxOnlyHistory;
    return Array.isArray(parsed?.distributions) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Add the payout this run is describing to the history, if it is new.
 *
 * The history exists because the chain does not keep one: a cycle's two
 * payouts are added together in `rewards-per-token-for-cycle`, and the first
 * of a pair can only be told apart by a run that happens between the two. This
 * runs hourly and a payout is a week apart from the next, so every one of them
 * is seen — but only if each run writes down what it saw.
 *
 * The file is left alone when nothing new has been computed, so an hour with
 * no payout in it is not an hourly commit saying nothing.
 */
function writeHistory(entry: StxOnlyDistribution | null): number {
  const previous = readHistory();
  const distributions = recordDistribution(previous?.distributions ?? [], entry);

  const unchanged =
    previous !== null &&
    JSON.stringify(previous.distributions) === JSON.stringify(distributions);
  if (unchanged) return distributions.length;

  const out: StxOnlyHistory = {
    generatedAt: new Date().toISOString(),
    distributions,
  };
  fs.writeFileSync(HISTORY_OUTPUT, `${JSON.stringify(out, null, 2)}\n`);
  return distributions.length;
}

async function fetchStxPriceSats(): Promise<string | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=btc',
    );
    if (!response.ok) return null;

    const body = (await response.json()) as {
      blockstack?: { btc?: number };
    };
    const btc = body.blockstack?.btc;
    if (typeof btc !== 'number' || !Number.isFinite(btc) || btc <= 0) {
      return null;
    }

    return String(Math.round(btc * SATS_PER_BTC));
  } catch {
    return null;
  }
}

async function main() {
  const signers = JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData;
  const totals = JSON.parse(fs.readFileSync(TOTALS, 'utf8')) as LockedTotals;

  const contractIds = signers.signers.map((s) => s.contractId);
  const bondContractIds = signers.signers
    .filter((s) => s.contractId.includes('signer-manager-bond-'))
    .map((s) => s.contractId);

  const totalStakedUstx = sumKnownUstx(contractIds, totals.ustx);
  const bondStakedUstx = sumKnownUstx(bondContractIds, totals.ustx);
  const stxOnlyStakedUstx = totalStakedUstx - bondStakedUstx;

  console.log(`Reading STX-only estimate inputs from ${describeNode()} ...`);

  const { fetchPoxInfo } = await import('@stacks/bitcoin-staking');
  const pox = await fetchPoxInfo({ network: 'mainnet' });

  // What has arrived and belongs to nobody yet, and the height it has been
  // arriving since. Both come from pox-5 rather than from its balance — see
  // the note at the top of this file.
  const [newRewardsSats, lastRewardBurnHeightRaw] = await Promise.all([
    readUint('get-new-rewards'),
    readUint('get-last-reward-compute-height'),
  ]);

  // Kept because an installed app built before this change still reads it, and
  // because it is worth being able to see the two side by side: the balance is
  // this estimate plus what is owed to stakers who have not claimed.
  const [rewardsBalanceSats, reserveBalanceSats, stakedSbtcSats] =
    await Promise.all([
      readUint('get-rewards'),
      readUint('get-reserve-balance'),
      readUint('get-total-sbtc-staked'),
    ]);
  const sbtcBalanceSats =
    rewardsBalanceSats === null ||
    reserveBalanceSats === null ||
    stakedSbtcSats === null
      ? null
      : rewardsBalanceSats + reserveBalanceSats + stakedSbtcSats;

  const stxPriceSats = await fetchStxPriceSats();

  const currentBurnchainBlockHeight = Number(
    (pox as { currentBurnchainBlockHeight?: unknown })
      .currentBurnchainBlockHeight,
  );
  const firstBurnchainBlockHeight = Number(
    (pox as { firstBurnchainBlockHeight?: unknown }).firstBurnchainBlockHeight,
  );
  const rewardCycleLength = Number(
    (pox as { rewardCycleLength?: unknown }).rewardCycleLength,
  );

  // pox-5 pays twice per reward cycle: its distribution cycle is half a PoX
  // one, `(/ pox-reward-cycle-length u2)`, which is 1050 blocks on mainnet.
  const distributionBlocks =
    Number.isFinite(rewardCycleLength) && rewardCycleLength >= 2
      ? Math.floor(rewardCycleLength / 2)
      : FALLBACK_DISTRIBUTION_BLOCKS;

  const heightsKnown =
    Number.isFinite(currentBurnchainBlockHeight) &&
    Number.isFinite(firstBurnchainBlockHeight) &&
    currentBurnchainBlockHeight > firstBurnchainBlockHeight;

  // pox-5 holds 0 here until the first `calculate-rewards` ever runs, and a
  // height it cannot have reached is not a window — so anything outside the
  // chain's own range is "not known" rather than a number to subtract.
  const lastRewardBurnHeightRead =
    lastRewardBurnHeightRaw === null ? null : Number(lastRewardBurnHeightRaw);
  const lastRewardBurnHeight =
    lastRewardBurnHeightRead !== null &&
    heightsKnown &&
    lastRewardBurnHeightRead >= firstBurnchainBlockHeight &&
    lastRewardBurnHeightRead <= currentBurnchainBlockHeight
      ? lastRewardBurnHeightRead
      : null;

  // The distribution cycle we are in, as the burn height it started at.
  const distributionStart = heightsKnown
    ? firstBurnchainBlockHeight +
      Math.floor(
        (currentBurnchainBlockHeight - firstBurnchainBlockHeight) /
          distributionBlocks,
      ) *
        distributionBlocks
    : null;

  // Where the next payout falls: the end of that cycle, which is the
  // `calculation-height` the next `calculate-rewards` will use.
  const nextRewardBurnHeight =
    distributionStart === null ? null : distributionStart + distributionBlocks - 1;

  // How long `get-new-rewards` has been filling up. Measured from the last
  // computation rather than from the start of the distribution cycle, because
  // those differ whenever nobody called `calculate-rewards` on time — and it
  // is the window the number actually covers that the projection needs. The
  // cap makes a missed computation project to what has accrued and no more.
  // With no computation on record, the cycle it would have started is as good
  // a window as there is.
  const accruingSince =
    lastRewardBurnHeight ??
    (distributionStart === null ? null : distributionStart - 1);
  const blocksIntoCycle =
    heightsKnown && accruingSince !== null
      ? Math.max(
          1,
          Math.min(
            distributionBlocks,
            currentBurnchainBlockHeight - accruingSince,
          ),
        )
      : null;

  // Which reward cycle the last payout paid out for, and whether it was the
  // first of that cycle's two payouts — see the note at the top for why the
  // second one needs last run's file to be read back.
  const position =
    lastRewardBurnHeight !== null
      ? payoutPosition({
          burnHeight: lastRewardBurnHeight,
          firstBurnchainBlockHeight,
          distributionBlocks,
        })
      : null;
  const lastPayoutCycle = position === null ? null : position.cycle;

  const cumulativeRewardsPerUstx =
    lastPayoutCycle === null
      ? null
      : await readCycleRewardsPerUstx(lastPayoutCycle);

  const lastPayoutRateSatsPer1000Stx = realisedPayoutRate({
    cumulativeRewardsPerUstx,
    cycle: lastPayoutCycle,
    isFirstOfCycle: position?.isFirstOfCycle ?? false,
    lastRewardBurnHeight,
    previous: readPrevious(),
  });

  let bondShareSats: bigint | null = null;
  let foundationShareSats: bigint | null = null;
  let stxOnlySoFarSats: bigint | null = null;
  let projectedCycleSats: bigint | null = null;
  let projectedRateSatsPer1000Stx: bigint | null = null;

  if (
    newRewardsSats !== null &&
    blocksIntoCycle !== null &&
    stxOnlyStakedUstx > 0n
  ) {
    bondShareSats =
      totalStakedUstx > 0n
        ? (newRewardsSats * bondStakedUstx) / totalStakedUstx
        : 0n;

    // pox-5 takes its 15% off what is left once the bonds are paid, so this
    // does too. With no bond registered the two orders agree.
    const afterBonds = newRewardsSats - bondShareSats;
    foundationShareSats =
      (afterBonds * BigInt(FOUNDATION_SHARE_BIPS)) / 10_000n;

    const raw = afterBonds - foundationShareSats;
    stxOnlySoFarSats = raw > 0n ? raw : 0n;

    projectedCycleSats =
      (stxOnlySoFarSats * BigInt(distributionBlocks)) / BigInt(blocksIntoCycle);

    projectedRateSatsPer1000Stx =
      (projectedCycleSats * USTX_PER_1000_STX) / stxOnlyStakedUstx;
  }

  const rateSatsPer1000Stx = publishedRate({
    projectedRateSatsPer1000Stx,
    lastPayoutRateSatsPer1000Stx,
    blocksIntoCycle,
    distributionBlocks,
  });

  const out: StxOnlyCalculations = {
    cycle: totals.cycle,
    distributionBlocks,
    blocksIntoCycle,
    blocksLeftInCycle:
      nextRewardBurnHeight === null || !heightsKnown
        ? null
        : Math.max(0, nextRewardBurnHeight - currentBurnchainBlockHeight),
    currentBurnHeight: heightsKnown
      ? Math.floor(currentBurnchainBlockHeight)
      : null,
    lastRewardBurnHeight,
    nextRewardBurnHeight,
    totalStakedUstx: totalStakedUstx.toString(),
    bondStakedUstx: bondStakedUstx.toString(),
    stxOnlyStakedUstx: stxOnlyStakedUstx.toString(),
    stxPriceSats,
    sbtcBalanceSats: sbtcBalanceSats === null ? null : sbtcBalanceSats.toString(),
    accruedRewardsSats:
      newRewardsSats === null ? null : newRewardsSats.toString(),
    bondShareSats: bondShareSats === null ? null : bondShareSats.toString(),
    foundationShareSats:
      foundationShareSats === null ? null : foundationShareSats.toString(),
    stxOnlySoFarSats:
      stxOnlySoFarSats === null ? null : stxOnlySoFarSats.toString(),
    projectedCycleSats:
      projectedCycleSats === null ? null : projectedCycleSats.toString(),
    projectedRateSatsPer1000Stx:
      projectedRateSatsPer1000Stx === null
        ? null
        : projectedRateSatsPer1000Stx.toString(),
    lastPayoutCycle,
    lastPayoutRateSatsPer1000Stx:
      lastPayoutRateSatsPer1000Stx === null
        ? null
        : lastPayoutRateSatsPer1000Stx.toString(),
    cumulativeRewardsPerUstx:
      cumulativeRewardsPerUstx === null
        ? null
        : cumulativeRewardsPerUstx.toString(),
    rateSatsPer1000Stx:
      rateSatsPer1000Stx === null ? null : rateSatsPer1000Stx.toString(),
    generatedAt: new Date().toISOString(),
  };

  write(out);
  console.log(`Wrote STX-only calculations to ${OUTPUT}`);

  // What that payout paid, kept as its own line in the history. Only a payout
  // whose cumulative figure was readable can be recorded: an entry without one
  // could never have its rate worked out later, so it would be a permanent
  // gap dressed up as a row.
  const recorded =
    position !== null &&
    lastRewardBurnHeight !== null &&
    cumulativeRewardsPerUstx !== null
      ? {
          cycle: position.cycle,
          distributionIndex: position.index,
          firstOfCycle: position.isFirstOfCycle,
          burnHeight: lastRewardBurnHeight,
          cumulativeRewardsPerUstx: cumulativeRewardsPerUstx.toString(),
          rateSatsPer1000Stx:
            lastPayoutRateSatsPer1000Stx === null
              ? null
              : lastPayoutRateSatsPer1000Stx.toString(),
        }
      : null;
  const kept = writeHistory(recorded);
  console.log(`  ${kept} distribution(s) on file in ${HISTORY_OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
