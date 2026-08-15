/**
 * Builds src/data/stx-only-calculations.json.
 *
 * This is the static input for the STX-only rewards estimate UI: the page
 * reads one committed file instead of making live chain calls in the browser.
 *
 * Usage: npx tsx scripts/generate-stx-only-calculations.ts
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeHeaders, describeNode } from './node.js';
import type {
  SignerData,
  LockedTotals,
  StxOnlyCalculations,
} from '../src/lib/types.js';

const DISTRIBUTION_BLOCKS = 1050;
const FOUNDATION_SHARE_BIPS = 1500; // 15%
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

function parseBlocksIntoCycle(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const blocks = Math.floor(value);
  if (blocks < 1) return null;
  if (blocks > DISTRIBUTION_BLOCKS) return DISTRIBUTION_BLOCKS;
  return blocks;
}

function readSbtcBalance(
  balances: unknown,
  expectedContract: string | null,
): bigint | null {
  if (typeof balances !== 'object' || balances === null) return null;
  const body = balances as {
    fungible_tokens?: Record<string, { balance?: string }>;
  };
  const tokens = body.fungible_tokens;
  if (!tokens || typeof tokens !== 'object') return null;

  const preferred =
    expectedContract === null ? null : `${expectedContract}::sbtc-token`;
  if (preferred && /^\d+$/.test(tokens[preferred]?.balance ?? '')) {
    return BigInt(tokens[preferred]!.balance!);
  }

  for (const [asset, info] of Object.entries(tokens)) {
    if (!asset.endsWith('::sbtc-token')) continue;
    if (!/^\d+$/.test(info?.balance ?? '')) continue;
    return BigInt(info.balance!);
  }

  return null;
}

function write(data: StxOnlyCalculations): void {
  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchStxPriceSats(): Promise<string | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=btc',
      {
        headers: nodeHeaders(),
      },
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

  const poxContractId =
    typeof pox.contractId === 'string' && pox.contractId.length > 0
      ? pox.contractId
      : 'SP000000000000000000002Q6VF78.pox-5';

  const sbtcContractId =
    typeof pox.sbtcContract === 'string' && pox.sbtcContract.length > 0
      ? pox.sbtcContract
      : null;

  const stacksApiUrl =
    typeof process.env.STACKS_API_URL === 'string' &&
    process.env.STACKS_API_URL.length > 0
      ? process.env.STACKS_API_URL
      : 'https://api.hiro.so';

  const balancesResponse = await fetch(
    `${stacksApiUrl}/extended/v1/address/${poxContractId}/balances`,
    { headers: nodeHeaders() },
  );
  if (!balancesResponse.ok) {
    throw new Error(`Could not read pox-5 balances (${balancesResponse.status})`);
  }
  const balances = (await balancesResponse.json()) as unknown;
  const sbtcBalanceSats = readSbtcBalance(balances, sbtcContractId);
  const stxPriceSats = await fetchStxPriceSats();

  const currentBurnchainBlockHeight = Number(
    (pox as { currentBurnchainBlockHeight?: unknown })
      .currentBurnchainBlockHeight,
  );
  const firstBurnchainBlockHeight = Number(
    (pox as { firstBurnchainBlockHeight?: unknown }).firstBurnchainBlockHeight,
  );
  const rewardCycleId = Number((pox as { rewardCycleId?: unknown }).rewardCycleId);
  const rewardCycleLength = Number(
    (pox as { rewardCycleLength?: unknown }).rewardCycleLength,
  );

  let blocksIntoCycle: number | null = null;
  if (
    Number.isFinite(currentBurnchainBlockHeight) &&
    Number.isFinite(firstBurnchainBlockHeight) &&
    Number.isFinite(rewardCycleId) &&
    Number.isFinite(rewardCycleLength) &&
    rewardCycleLength > 0
  ) {
    const cycleStart = firstBurnchainBlockHeight + rewardCycleId * rewardCycleLength;
    blocksIntoCycle = parseBlocksIntoCycle(
      currentBurnchainBlockHeight - cycleStart + 1,
    );
  }

  let bondShareSats: bigint | null = null;
  let foundationShareSats: bigint | null = null;
  let stxOnlySoFarSats: bigint | null = null;
  let projectedCycleSats: bigint | null = null;
  let rateSatsPer1000Stx: bigint | null = null;
  let nextRewardBurnHeight: number | null = null;

  if (
    sbtcBalanceSats !== null &&
    blocksIntoCycle !== null &&
    stxOnlyStakedUstx > 0n
  ) {
    bondShareSats =
      totalStakedUstx > 0n
        ? (sbtcBalanceSats * bondStakedUstx) / totalStakedUstx
        : 0n;
    foundationShareSats =
      (sbtcBalanceSats * BigInt(FOUNDATION_SHARE_BIPS)) / 10_000n;

    const raw = sbtcBalanceSats - bondShareSats - foundationShareSats;
    stxOnlySoFarSats = raw > 0n ? raw : 0n;

    projectedCycleSats =
      (stxOnlySoFarSats * BigInt(DISTRIBUTION_BLOCKS)) / BigInt(blocksIntoCycle);

    rateSatsPer1000Stx =
      (projectedCycleSats * USTX_PER_1000_STX) / stxOnlyStakedUstx;

    nextRewardBurnHeight = currentBurnchainBlockHeight + (DISTRIBUTION_BLOCKS - blocksIntoCycle);
  }

  const out: StxOnlyCalculations = {
    cycle: totals.cycle,
    distributionBlocks: DISTRIBUTION_BLOCKS,
    blocksIntoCycle,
    blocksLeftInCycle:
      blocksIntoCycle === null
        ? null
        : Math.max(0, DISTRIBUTION_BLOCKS - blocksIntoCycle),
    currentBurnHeight:
      Number.isFinite(currentBurnchainBlockHeight) && currentBurnchainBlockHeight > 0
        ? Math.floor(currentBurnchainBlockHeight)
        : null,
    nextRewardBurnHeight,
    totalStakedUstx: totalStakedUstx.toString(),
    bondStakedUstx: bondStakedUstx.toString(),
    stxOnlyStakedUstx: stxOnlyStakedUstx.toString(),
    stxPriceSats,
    sbtcBalanceSats: sbtcBalanceSats === null ? null : sbtcBalanceSats.toString(),
    bondShareSats: bondShareSats === null ? null : bondShareSats.toString(),
    foundationShareSats:
      foundationShareSats === null ? null : foundationShareSats.toString(),
    stxOnlySoFarSats:
      stxOnlySoFarSats === null ? null : stxOnlySoFarSats.toString(),
    projectedCycleSats:
      projectedCycleSats === null ? null : projectedCycleSats.toString(),
    rateSatsPer1000Stx:
      rateSatsPer1000Stx === null ? null : rateSatsPer1000Stx.toString(),
    generatedAt: new Date().toISOString(),
  };

  write(out);
  console.log(`Wrote STX-only calculations to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
