/**
 * What a list of addresses is holding, and which of them somebody has to do
 * something about.
 *
 * Three questions per address, from two places:
 *
 *  - `/extended/v1/address/{principal}/balances` — STX, every fungible token
 *    and every NFT collection, in one request.
 *  - `pox-5.get-staker-info` — the stake itself: which pool, how much, and
 *    the cycle it unlocks in. Read from the chain rather than inferred from
 *    the locked STX in the balance, because "locked" says the chain is
 *    holding it and not who it is staked with, or until when.
 *
 * The point of the report is the difference between those two. An address
 * with STX sitting unlocked is earning nothing; an address whose stake ends
 * next cycle needs a decision before it does; an address holding locked STX
 * that pox-5 has no position for is stacking somewhere else, which during the
 * pox-4 changeover is most of them. None of that is visible in a balance, and
 * none of it is visible in a stake — it is only visible in both at once.
 *
 * Usage:
 *   npx tsx scripts/address-report.ts SP2C2… SP3VR…
 *   npx tsx scripts/address-report.ts --file addresses.txt --token sbtc
 *   npx tsx scripts/address-report.ts --file addresses.txt --json
 *
 *   --file <path>     addresses one per line; blank lines and # comments skipped
 *   --token <name>    a token to report and flag, as an asset identifier or
 *                     any part of one ("sbtc"). Fungible or NFT.
 *   --min-token <n>   flag an address holding less than this much of it
 *                     (default: any amount at all is enough)
 *   --min-stx <n>     how much unlocked STX counts as idle (default 100)
 *   --ending-in <n>   flag a stake ending within this many cycles (default 2)
 *   --json            the whole report as JSON
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 *
 * Nothing here is written to a file. It answers a question somebody asked
 * this morning about addresses only they have a list of; committing that list
 * or its balances into a public repo is not something a script should decide.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cl, cvToHex } from '@stacks/transactions';
import { parseAddressList, type AddressEntry } from '../src/lib/principals.js';
import type { Signer, SignerData } from '../src/lib/types.js';
import {
  formatStx,
  formatUnits,
  parseUnits,
  shortPrincipal,
} from './format.js';
import { getJson } from './hiro.js';
import {
  API_URL,
  describeNode,
  RETRY_DELAYS_MS,
  sleep,
  SPACING_MS,
} from './node.js';
import {
  callReadOnly,
  fetchCurrentCycle,
  optionalTuple,
  tuplePrincipal,
  tupleUint,
} from './pox5.js';

const SIGNERS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'signers.json',
);

// ---------------------------------------------------------------------------
// The parts with no node in them
// ---------------------------------------------------------------------------

export interface Options {
  addresses: string[];
  file: string | null;
  token: string | null;
  minToken: string | null;
  minStx: string;
  endingIn: number;
  json: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    addresses: [],
    file: null,
    token: null,
    minToken: null,
    minStx: '100',
    endingIn: 2,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[(i += 1)] ?? null;
    else if (arg === '--token') options.token = argv[(i += 1)] ?? null;
    else if (arg === '--min-token') options.minToken = argv[(i += 1)] ?? null;
    else if (arg === '--min-stx') options.minStx = argv[(i += 1)] ?? '';
    else if (arg === '--ending-in') options.endingIn = Number(argv[(i += 1)]);
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else options.addresses.push(arg);
  }

  if (!Number.isInteger(options.endingIn) || options.endingIn < 0) {
    throw new Error('--ending-in takes a number of cycles');
  }
  if (options.minToken !== null && options.token === null) {
    throw new Error('--min-token needs a --token to be a minimum of');
  }
  return options;
}

export interface Stake {
  signer: string;
  ustx: bigint;
  firstCycle: number;
  numCycles: number;
}

export interface Holdings {
  address: string;
  /** What the list called it, when it called it anything. */
  label: string | null;
  /** Null when the API would not answer — never a zero balance. */
  stxTotal: bigint | null;
  stxLocked: bigint | null;
  /** Undefined when unread; null when pox-5 has no position for them. */
  stake: Stake | null | undefined;
  fungible: Record<string, bigint>;
  nfts: Record<string, number>;
}

/** Unlocked STX: what is theirs to stake, spend or move today. */
export function availableStx(holdings: Holdings): bigint | null {
  if (holdings.stxTotal === null || holdings.stxLocked === null) return null;
  return holdings.stxTotal - holdings.stxLocked;
}

/** The cycle a stake ends in — the first cycle it is no longer stacked for. */
export const unlockCycle = (stake: Stake) => stake.firstCycle + stake.numCycles;

export interface Thresholds {
  /** uSTX above which unlocked STX is worth mentioning. */
  minStx: bigint;
  /** Cycles: a stake ending this soon needs a decision now. */
  endingIn: number;
  /** Base units of the token below which an address is flagged. */
  minToken: bigint | null;
  /** The asset identifier being reported on, if any. */
  token: string | null;
  /** How to write an amount of it, so a reason can name the number. */
  tokenSymbol: string;
  tokenDecimals: number;
}

export interface Attention {
  /** Short enough to read down a column. */
  tag: string;
  /** The whole sentence, for the list a person actually acts on. */
  detail: string;
}

/**
 * Why this address needs looking at, in the order somebody would act.
 *
 * Every rule is about a decision that is available today, which is why
 * "holding no tokens and no STX" is not on the list: there is nothing to do
 * about an empty address, and a report that flags it buries the ones with
 * something to do. What could not be read is always a reason, and is first —
 * an address this run knows nothing about must not read as an address with
 * nothing wrong.
 */
export function attentionFor(
  holdings: Holdings,
  thresholds: Thresholds,
  currentCycle: number,
): Attention[] {
  const reasons: Attention[] = [];
  const available = availableStx(holdings);

  if (holdings.stxTotal === null) {
    reasons.push({
      tag: 'unread',
      detail: 'the API would not say what this address holds',
    });
  }
  if (holdings.stake === undefined) {
    reasons.push({
      tag: 'unread',
      detail: 'pox-5 would not say whether this address is staking',
    });
  }

  const stake = holdings.stake ?? null;

  if (stake) {
    const ends = unlockCycle(stake);
    const left = ends - currentCycle;
    if (left <= thresholds.endingIn) {
      reasons.push({
        tag: 'ending',
        detail:
          left <= 0
            ? `stake has ended (cycle ${ends}) — the STX is unlocking or unlocked`
            : `stake ends in ${left} cycle(s), at cycle ${ends} — extend it or it unlocks`,
      });
    }
    if (available !== null && available >= thresholds.minStx) {
      reasons.push({
        tag: 'idle',
        detail: `${formatStx(available)} STX unlocked alongside the stake — could be added to it`,
      });
    }
  } else if (holdings.stake === null) {
    // Locked without a pox-5 position means the lock is somebody else's
    // business — pox-4, during the changeover. Worth saying plainly, because
    // "not staking" would be wrong and "staking" would be wronger.
    if (holdings.stxLocked !== null && holdings.stxLocked > 0n) {
      reasons.push({
        tag: 'not pox-5',
        detail: `${formatStx(holdings.stxLocked)} STX is locked, but pox-5 has no position for it — stacked elsewhere, or unlocking`,
      });
    }
    if (available !== null && available >= thresholds.minStx) {
      reasons.push({
        tag: 'not staking',
        detail: `${formatStx(available)} STX unlocked and staking nothing`,
      });
    }
  }

  if (thresholds.token) {
    const held =
      holdings.fungible[thresholds.token] ??
      (holdings.nfts[thresholds.token] === undefined
        ? undefined
        : BigInt(holdings.nfts[thresholds.token]));
    const floor = thresholds.minToken ?? 1n;
    const symbol = thresholds.tokenSymbol;
    const amount = (value: bigint) =>
      `${formatUnits(value, thresholds.tokenDecimals)} ${symbol}`;
    if (holdings.stxTotal !== null && (held ?? 0n) < floor) {
      reasons.push({
        tag: 'token',
        detail:
          held === undefined || held === 0n
            ? `holds no ${symbol}`
            : `holds ${amount(held)}, under the ${amount(floor)} asked for`,
      });
    }
  }

  return reasons;
}

/**
 * The asset a `--token` names.
 *
 * An asset identifier is taken as itself, including one nobody in the list
 * holds — "which of these addresses is missing it" is a fair question and the
 * answer is not "none of them hold it, so never mind". Anything else is
 * matched against what the addresses do hold, and matching more than one
 * asset is reported rather than resolved: `sbtc` finds both `sbtc-token` and
 * `sbtc-token-locked`, and picking one would be a guess about somebody's
 * money.
 */
export function resolveToken(
  query: string,
  held: string[],
): { asset: string } | { candidates: string[] } {
  // A whole identifier, deployer and all — not merely something with `::` in
  // it. `sbtc-token::sbtc-token` is somebody typing the half they remember,
  // and taking it literally would name an asset nobody can hold and report
  // every address as missing it.
  if (/^S[PM][0-9A-Z]{20,}\.[a-zA-Z][\w-]*::/.test(query)) {
    return { asset: query };
  }

  const needle = query.toLowerCase();
  const candidates = [...new Set(held)].filter((asset) =>
    asset.toLowerCase().includes(needle),
  );
  if (candidates.length === 1) return { asset: candidates[0] };

  // `sbtc-token::sbtc-token` is inside `…::sbtc-token-locked` too, so a
  // substring match alone would call the exact thing somebody typed
  // ambiguous. An asset the query names in full — its token name, or the end
  // of its identifier — wins over one that merely contains it.
  const exact = candidates.filter(
    (asset) =>
      assetName(asset).toLowerCase() === needle ||
      asset.toLowerCase().endsWith(needle),
  );
  if (exact.length === 1) return { asset: exact[0] };

  return { candidates };
}

/** `SP….sbtc-token::sbtc-token` → `sbtc-token`, for a column heading. */
export const assetName = (asset: string) => asset.split('::')[1] ?? asset;

export interface AssetTotal {
  asset: string;
  kind: 'ft' | 'nft';
  /** Base units for a token, a count of items for an NFT collection. */
  total: bigint;
  /** How many of the addresses hold any of it. */
  holders: number;
}

/**
 * Every asset the list holds, added up across it.
 *
 * A balance of zero is not holding something, so it is left out entirely
 * rather than listed as a row of noughts — an address keeps an entry for a
 * token long after it has sent the last of it, and `sbtc-token-locked` sits
 * at zero on everyone who has ever used the bridge. What somebody wants from
 * this section is the handful of assets that are actually there.
 *
 * Tokens before NFT collections, then whatever the most addresses hold: the
 * asset all of them have is the one worth seeing first, and totals across two
 * different tokens are not comparable enough to sort on.
 */
export function assetTotals(all: Holdings[]): AssetTotal[] {
  const totals = new Map<string, AssetTotal>();

  const add = (asset: string, kind: 'ft' | 'nft', amount: bigint) => {
    if (amount <= 0n) return;
    const entry = totals.get(asset) ?? { asset, kind, total: 0n, holders: 0 };
    entry.total += amount;
    entry.holders += 1;
    totals.set(asset, entry);
  };

  for (const holdings of all) {
    for (const [asset, amount] of Object.entries(holdings.fungible)) {
      add(asset, 'ft', amount);
    }
    for (const [asset, count] of Object.entries(holdings.nfts)) {
      add(asset, 'nft', BigInt(count));
    }
  }

  return [...totals.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'ft' ? -1 : 1;
    if (a.holders !== b.holders) return b.holders - a.holders;
    return a.asset.localeCompare(b.asset);
  });
}

export interface StxTotal {
  total: bigint;
  locked: bigint;
  unlocked: bigint;
  holders: number;
  /** Addresses whose balance this run could not read, so none of the above. */
  unread: number;
}

/**
 * STX across the list, split the way the decisions are: locked is working,
 * unlocked is not.
 *
 * Addresses that would not read are counted rather than summed as zero, so a
 * total that is short says how short it might be.
 */
export function stxTotal(all: Holdings[]): StxTotal {
  const sum: StxTotal = {
    total: 0n,
    locked: 0n,
    unlocked: 0n,
    holders: 0,
    unread: 0,
  };

  for (const holdings of all) {
    const available = availableStx(holdings);
    if (holdings.stxTotal === null || available === null) {
      sum.unread += 1;
      continue;
    }
    sum.total += holdings.stxTotal;
    sum.locked += holdings.stxLocked ?? 0n;
    sum.unlocked += available;
    if (holdings.stxTotal > 0n) sum.holders += 1;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// The parts that ask
// ---------------------------------------------------------------------------

interface BalancesResponse {
  stx?: { balance?: string; locked?: string };
  fungible_tokens?: Record<string, { balance?: string }>;
  non_fungible_tokens?: Record<string, { count?: string }>;
}

async function readHoldings(entry: AddressEntry): Promise<Holdings> {
  const { address } = entry;
  const balances = (
    await getJson<BalancesResponse>(
      `${API_URL}/extended/v1/address/${address}/balances`,
    )
  ).value;

  const fungible: Record<string, bigint> = {};
  for (const [asset, held] of Object.entries(balances?.fungible_tokens ?? {})) {
    fungible[asset] = BigInt(held.balance ?? '0');
  }
  const nfts: Record<string, number> = {};
  for (const [asset, held] of Object.entries(
    balances?.non_fungible_tokens ?? {},
  )) {
    nfts[asset] = Number(held.count ?? '0');
  }

  await sleep(SPACING_MS);

  return {
    address,
    label: entry.label,
    stxTotal: balances?.stx?.balance ? BigInt(balances.stx.balance) : null,
    stxLocked: balances?.stx?.locked ? BigInt(balances.stx.locked) : null,
    stake: await readStake(address),
    fungible,
    nfts,
  };
}

/** Undefined when pox-5 would not answer; null when it has no position. */
async function readStake(address: string): Promise<Stake | null | undefined> {
  let arg: string;
  try {
    arg = cvToHex(Cl.principal(address));
  } catch {
    return undefined;
  }

  const result = await callReadOnly('get-staker-info', [arg]);
  if (result === null) return undefined;

  try {
    const tuple = optionalTuple(result);
    if (tuple === null) return null;
    return {
      signer: tuplePrincipal(tuple, 'signer'),
      ustx: tupleUint(tuple, 'amount-ustx'),
      firstCycle: Number(tupleUint(tuple, 'first-reward-cycle')),
      numCycles: Number(tupleUint(tuple, 'num-cycles')),
    };
  } catch {
    return undefined;
  }
}

export interface TokenMeta {
  asset: string;
  symbol: string;
  decimals: number;
  /** True when the asset is an NFT collection rather than a fungible token. */
  nft: boolean;
  /**
   * False when nobody published metadata for it, so the amount printed is in
   * base units and undivided. Said out loud in the report rather than left
   * for a reader to notice: `5000000000` of a token with six decimals is five
   * thousand of it, and a report that prints the first is off by a million.
   */
  known: boolean;
}

/**
 * A token's symbol and decimals, so an amount is printed the way its holders
 * write it. Falls back to the asset's own name and no decimals, which is
 * right for an NFT and honest for a token whose metadata is missing.
 */
async function readTokenMeta(asset: string, nft: boolean): Promise<TokenMeta> {
  const fallback = {
    asset,
    symbol: assetName(asset),
    decimals: 0,
    nft,
    known: nft,
  };
  if (nft) return fallback;

  const contract = asset.split('::')[0];
  const meta = (
    await getJson<{ symbol?: string; decimals?: number }>(
      `${API_URL}/metadata/v1/ft/${contract}`,
    )
  ).value;
  if (!meta) return fallback;

  return {
    asset,
    symbol: meta.symbol || fallback.symbol,
    decimals: meta.decimals ?? 0,
    nft,
    known: true,
  };
}

/**
 * Metadata for every asset the list holds, one request per token contract.
 *
 * Cached on the contract rather than the asset, because a contract can define
 * more than one token — sBTC ships `sbtc-token` and `sbtc-token-locked` — and
 * asking twice for the same answer is a request somebody's rate limit pays
 * for. NFT collections cost nothing: a count needs no decimals.
 */
async function readAllTokenMeta(
  totals: AssetTotal[],
): Promise<Map<string, TokenMeta>> {
  const byAsset = new Map<string, TokenMeta>();
  const byContract = new Map<string, TokenMeta>();

  for (const entry of totals) {
    if (entry.kind === 'nft') {
      byAsset.set(entry.asset, await readTokenMeta(entry.asset, true));
      continue;
    }
    const contract = entry.asset.split('::')[0];
    const cached = byContract.get(contract);
    if (cached) {
      byAsset.set(entry.asset, { ...cached, asset: entry.asset });
      continue;
    }
    const meta = await readTokenMeta(entry.asset, false);
    byContract.set(contract, meta);
    byAsset.set(entry.asset, meta);
    await sleep(SPACING_MS);
  }
  return byAsset;
}

// ---------------------------------------------------------------------------
// Saying it
// ---------------------------------------------------------------------------

interface Row {
  holdings: Holdings;
  reasons: Attention[];
  poolName: string | null;
}

function tokenHeld(holdings: Holdings, meta: TokenMeta | null): bigint | null {
  if (!meta) return null;
  if (meta.nft) {
    const count = holdings.nfts[meta.asset];
    return count === undefined ? 0n : BigInt(count);
  }
  return holdings.fungible[meta.asset] ?? 0n;
}

/**
 * Everything the list holds, by asset, with STX first.
 *
 * The address table answers "what is in this address"; this answers "how much
 * of this do we have, and how many addresses is it spread across". They are
 * different questions and the second one is the one somebody moving a token
 * around actually asks. STX leads because it is the only asset here that is
 * two amounts rather than one: locked is working, unlocked is not.
 */
function printAssets(rows: Row[], tokenMeta: Map<string, TokenMeta>) {
  const holdings = rows.map((row) => row.holdings);
  const stx = stxTotal(holdings);
  const assets = assetTotals(holdings);

  const columns: { heading: string; width: number; left?: boolean }[] = [
    { heading: 'token', width: 14, left: true },
    { heading: 'asset', width: 44, left: true },
    { heading: 'held by', width: 7 },
    { heading: 'total', width: 20 },
    { heading: 'locked', width: 18 },
    { heading: 'unlocked', width: 18 },
  ];
  const line = (cells: string[]) =>
    `  ${cells
      .map((cell, index) => {
        const { width, left } = columns[index];
        const clipped = cell.length > width ? cell.slice(0, width) : cell;
        return left ? clipped.padEnd(width) : clipped.padStart(width);
      })
      .join(' ')}`.trimEnd();

  console.log('WHAT THEY HOLD\n');
  console.log(line(columns.map((column) => column.heading)));
  console.log(
    line([
      'STX',
      'the chain itself',
      String(stx.holders),
      formatStx(stx.total),
      formatStx(stx.locked),
      formatStx(stx.unlocked),
    ]),
  );

  let unknown = false;
  for (const entry of assets) {
    const meta = tokenMeta.get(entry.asset);
    unknown = unknown || meta?.known === false;
    console.log(
      line([
        (meta?.symbol ?? assetName(entry.asset)) + (meta?.known ? '' : ' *'),
        shortPrincipal(entry.asset),
        String(entry.holders),
        formatUnits(entry.total, meta?.decimals ?? 0),
        '',
        '',
      ]),
    );
  }

  if (assets.length === 0) {
    console.log('  (no tokens and no NFTs)');
  }
  if (unknown) {
    console.log(
      '\n  * no metadata published for this token, so its amount is in base' +
        ' units — undivided, and not what its holders would call it.',
    );
  }
  if (stx.unread) {
    console.log(
      `\n  ${stx.unread} address(es) would not read, so the STX above is at` +
        ' least this much and no claim about the rest.',
    );
  }
  console.log('');
}

function printReport(
  rows: Row[],
  meta: TokenMeta | null,
  cycle: number,
  thresholds: Thresholds,
  tokenMeta: Map<string, TokenMeta>,
) {
  const needing = rows.filter((row) => row.reasons.length > 0);

  console.log(
    `\n${rows.length} address(es), reward cycle ${cycle}` +
      (meta ? `, token ${meta.symbol} (${meta.asset})` : ''),
  );

  if (needing.length === 0) {
    console.log('\nNothing needs attention.\n');
  } else {
    console.log(`\nNEEDS ATTENTION — ${needing.length} of ${rows.length}\n`);
    // Tags are only worth a column if they line up, and how wide that column
    // is depends on which flags this run actually raised.
    const tagWidth = Math.max(
      ...needing.flatMap((row) => row.reasons.map((r) => r.tag.length)),
    );
    for (const row of needing) {
      const label = row.holdings.label ? `  — ${row.holdings.label}` : '';
      console.log(`  ${row.holdings.address}${label}`);
      for (const reason of row.reasons) {
        console.log(`      ${reason.tag.padEnd(tagWidth)}  ${reason.detail}`);
      }
      console.log('');
    }
  }

  printAssets(rows, tokenMeta);

  // A labelled list is read by its labels, so they get the room and the
  // address gets shortened to make it — the full ones are in the attention
  // block above, which is the part somebody copies out of. An unlabelled list
  // has nothing else to go on, so the address stays whole.
  const labelled = rows.some((row) => row.holdings.label);

  // One definition of the columns, used by the heading, every row and the
  // totals. Three copies of the widths is how a totals line ends up under the
  // wrong column, which in a report about money is worse than ugly.
  const columns: { heading: string; width: number; left?: boolean }[] = [
    { heading: 'address', width: labelled ? 15 : 41, left: true },
    ...(labelled ? [{ heading: 'label', width: 24, left: true }] : []),
    { heading: 'STX total', width: 18 },
    { heading: 'staked', width: 18 },
    { heading: 'with', width: 20, left: true },
    { heading: 'ends', width: 5 },
    ...(meta ? [{ heading: meta.symbol.slice(0, 14), width: 16 }] : []),
    { heading: 'NFTs', width: 5 },
  ];
  const line = (cells: string[]) =>
    `  ${cells
      .map((cell, index) => {
        const { width, left } = columns[index];
        const clipped = cell.length > width ? cell.slice(0, width) : cell;
        return left ? clipped.padEnd(width) : clipped.padStart(width);
      })
      .join(' ')}`.trimEnd();

  console.log('EVERY ADDRESS\n');
  console.log(line(columns.map((column) => column.heading)));

  for (const row of rows) {
    const { holdings } = row;
    const stake = holdings.stake ?? null;
    const held = tokenHeld(holdings, meta);
    const nftCount = Object.values(holdings.nfts).reduce((a, b) => a + b, 0);

    console.log(
      line([
        labelled ? shortPrincipal(holdings.address) : holdings.address,
        ...(labelled ? [holdings.label ?? '—'] : []),
        holdings.stxTotal === null ? 'not known' : formatStx(holdings.stxTotal),
        stake ? formatStx(stake.ustx) : '—',
        row.poolName ?? '—',
        stake ? `c${unlockCycle(stake)}` : '—',
        ...(meta
          ? [held === null ? '?' : formatUnits(held, meta.decimals)]
          : []),
        String(nftCount),
      ]),
    );
  }

  const totals = rows.reduce(
    (sum, row) => ({
      stx: sum.stx + (row.holdings.stxTotal ?? 0n),
      staked: sum.staked + (row.holdings.stake?.ustx ?? 0n),
      token: sum.token + (tokenHeld(row.holdings, meta) ?? 0n),
    }),
    { stx: 0n, staked: 0n, token: 0n },
  );

  console.log('');
  console.log(
    line([
      'total',
      ...(labelled ? [''] : []),
      formatStx(totals.stx),
      formatStx(totals.staked),
      '',
      '',
      ...(meta ? [formatUnits(totals.token, meta.decimals)] : []),
      '',
    ]),
  );

  console.log(
    `\nFlags: ending — a stake within ${thresholds.endingIn} cycle(s) of` +
      ` unlocking. not staking / idle — ${formatStx(thresholds.minStx)} STX or` +
      ' more sitting unlocked, with no stake or beside one. not pox-5 — STX' +
      ' locked with no pox-5 position, so stacked elsewhere.' +
      (meta
        ? thresholds.minToken === null
          ? ` token — holds no ${meta.symbol}.`
          : ` token — holds under ${formatUnits(thresholds.minToken, meta.decimals)} ${meta.symbol}.`
        : '') +
      ' unread — this run could not find out, which is not the same as nothing.',
  );
  console.log(
    'Amounts are exact, never rounded. An address the API would not answer' +
      ' for shows as "not known" rather than as empty.\n',
  );
}

function toJson(
  rows: Row[],
  meta: TokenMeta | null,
  cycle: number,
  tokenMeta: Map<string, TokenMeta>,
) {
  const holdings = rows.map((row) => row.holdings);
  const stx = stxTotal(holdings);

  return {
    cycle,
    token: meta && {
      asset: meta.asset,
      symbol: meta.symbol,
      decimals: meta.decimals,
    },
    held: {
      stx: {
        total: stx.total.toString(),
        locked: stx.locked.toString(),
        unlocked: stx.unlocked.toString(),
        holders: stx.holders,
        unread: stx.unread,
      },
      assets: assetTotals(holdings).map((entry) => ({
        asset: entry.asset,
        kind: entry.kind,
        symbol: tokenMeta.get(entry.asset)?.symbol ?? assetName(entry.asset),
        decimals: tokenMeta.get(entry.asset)?.decimals ?? 0,
        metadata: tokenMeta.get(entry.asset)?.known ?? false,
        total: entry.total.toString(),
        holders: entry.holders,
      })),
    },
    addresses: rows.map((row) => ({
      address: row.holdings.address,
      label: row.holdings.label,
      stxTotal: row.holdings.stxTotal?.toString() ?? null,
      stxLocked: row.holdings.stxLocked?.toString() ?? null,
      stxAvailable: availableStx(row.holdings)?.toString() ?? null,
      staking:
        row.holdings.stake === undefined
          ? null
          : row.holdings.stake && {
              signer: row.holdings.stake.signer,
              pool: row.poolName,
              ustx: row.holdings.stake.ustx.toString(),
              firstCycle: row.holdings.stake.firstCycle,
              numCycles: row.holdings.stake.numCycles,
              unlockCycle: unlockCycle(row.holdings.stake),
            },
      stakingRead: row.holdings.stake !== undefined,
      token: meta && (tokenHeld(row.holdings, meta)?.toString() ?? null),
      fungible: Object.fromEntries(
        Object.entries(row.holdings.fungible).map(([k, v]) => [
          k,
          v.toString(),
        ]),
      ),
      nfts: row.holdings.nfts,
      attention: row.reasons,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const named: AddressEntry[] = options.addresses.map((address) => ({
    address,
    label: null,
  }));
  if (options.file) {
    const parsed = parseAddressList(fs.readFileSync(options.file, 'utf8'));
    named.push(...parsed.entries);
    for (const line of parsed.rejected) {
      console.error(`  not a principal, skipped: ${line}`);
    }
  }

  // An address listed twice is one address; the first label given wins.
  const wanted = named.filter(
    (entry, index) =>
      named.findIndex((other) => other.address === entry.address) === index,
  );
  if (wanted.length === 0) {
    console.error(
      'Name some addresses, or point at a file of them.\n' +
        '  npx tsx scripts/address-report.ts SP2C2… --token sbtc\n' +
        '  npx tsx scripts/address-report.ts --file addresses.txt\n',
    );
    process.exit(1);
  }

  if (!options.json) {
    console.log(
      `Asking ${describeNode()} about ${wanted.length} address(es) ...`,
    );
  }

  const cycle = await fetchCurrentCycle();
  if (cycle === null) {
    console.error('The node would not say what cycle it is in.');
    process.exit(1);
    return;
  }

  const holdings: Holdings[] = [];
  for (const entry of wanted) holdings.push(await readHoldings(entry));

  // A long list run anonymously outruns the rate limit somewhere in the
  // middle, and those addresses come back unread — which the report says
  // plainly, but "run it again" is a poor answer when asking again about the
  // few that failed costs seconds. Once, at the end, after a pause.
  const unread = holdings.filter(
    (h) => h.stxTotal === null || h.stake === undefined,
  );
  if (unread.length) {
    console.error(
      `  ${unread.length} address(es) went unread; asking again in a moment ...`,
    );
    await sleep(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    for (const stale of unread) {
      const fresh = await readHoldings({
        address: stale.address,
        label: stale.label,
      });
      Object.assign(stale, fresh);
    }
  }

  // Every asset anybody holds, so the roll-up can print amounts the way their
  // holders write them. One request per token contract, and the answer for
  // `--token` comes out of the same map rather than being asked for twice.
  const tokenMeta = await readAllTokenMeta(assetTotals(holdings));

  let meta: TokenMeta | null = null;
  if (options.token) {
    const held = holdings.flatMap((h) => [
      ...Object.keys(h.fungible),
      ...Object.keys(h.nfts),
    ]);
    const resolved = resolveToken(options.token, held);
    if ('candidates' in resolved) {
      console.error(
        resolved.candidates.length === 0
          ? `No asset these addresses hold matches "${options.token}". Give the` +
              ' full asset identifier if they are supposed to be missing it.'
          : `"${options.token}" matches more than one asset:\n  ` +
              resolved.candidates.join('\n  '),
      );
      process.exit(1);
      return;
    }
    meta =
      tokenMeta.get(resolved.asset) ??
      (await readTokenMeta(
        resolved.asset,
        holdings.some((h) => h.nfts[resolved.asset] !== undefined),
      ));
  }

  const thresholds: Thresholds = {
    minStx: parseUnits(options.minStx, 6),
    endingIn: options.endingIn,
    minToken:
      options.minToken !== null && meta
        ? parseUnits(options.minToken, meta.decimals)
        : null,
    token: meta?.asset ?? null,
    tokenSymbol: meta?.symbol ?? '',
    tokenDecimals: meta?.decimals ?? 0,
  };

  const signers = (JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData)
    .signers;
  const poolOf = (signer: string) =>
    signers.find((s: Signer) => s.contractId === signer)?.displayName ?? null;

  const rows: Row[] = holdings
    .map((h) => ({
      holdings: h,
      reasons: attentionFor(h, thresholds, cycle),
      // The pool's name as the guide shows it, including the ones a person
      // decided — a contract id says nothing to somebody reading a list.
      poolName: h.stake ? (poolOf(h.stake.signer) ?? h.stake.signer) : null,
    }))
    // Largest holding first, which is the order somebody reads a list of
    // their own addresses in.
    .sort((a, b) => {
      const left = a.holdings.stxTotal ?? -1n;
      const right = b.holdings.stxTotal ?? -1n;
      if (left === right) return 0;
      return right > left ? 1 : -1;
    });

  if (options.json) {
    console.log(JSON.stringify(toJson(rows, meta, cycle, tokenMeta), null, 2));
    return;
  }
  printReport(rows, meta, cycle, thresholds, tokenMeta);
}

// Only when run, not when imported — see the note in signer-members.ts.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
