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
 * sBTC gets a column of its own, without being asked for. The balances call
 * above already carries it — every fungible token in one request — so it
 * costs nothing, and on a list of addresses in this repo's world it is the
 * one token that is always the question. `--token` still names any other.
 *
 * ## Who else is signing
 *
 * A balance cannot tell you that a key has leaked; the transactions can. So
 * each address also has its recent history read — the last fifty
 * transactions it took part in, and what is waiting in the mempool — and
 * what it *signed* is the part that matters. Airdrops and transfers in are
 * other people's keys at work; a transaction with this address as its sender
 * is this key at work, and on a list of addresses somebody holds the keys to
 * every one of those is something they should recognise.
 *
 *  - `pending`  a transaction this address signed, not yet mined — the one
 *               flag that may still leave time to act.
 *  - `outflow`  STX sent out, or tokens moved by a transaction it signed,
 *               within `--activity-days`. A transfer to an address on the
 *               list is named as such; anything else says "not on the list".
 *  - `signed`   anything else it signed in that window.
 *  - `woke up`  the first signature in 90 days or more — a dormant key
 *               suddenly in use is what a leaked one usually looks like.
 *
 * Every transfer is spelled out — amount, asset and the address on the other
 * end — whether it was STX, a token or an NFT.
 *
 * ## Safe and possibly compromised
 *
 * A line `// --- safe ---` in the address file splits it: everything after it
 * is a new address whose key is known to be good, everything before it may
 * have leaked. (`// --- <anything else> ---` ends the safe section again.)
 * With the split, the activity flags change meaning:
 *
 *  - on a possibly compromised address, a transfer to a safe address is the
 *    rescue, not the theft, and is left out of the flags; everything else it
 *    signs is flagged as before;
 *  - on a safe address, signing is expected — only something leaving for an
 *    address that is not safe is flagged.
 *
 * And the report opens with what is still sitting on the possibly
 * compromised addresses, which is the list of things left to move.
 *
 * It costs two more requests an address; `--no-activity` skips them, and
 * `--activity-only` asks nothing else and reports nothing else — the quick
 * check to run often while a leak is suspected.
 *
 * Usage:
 *   npx tsx scripts/address-report.ts SP2C2… SP3VR…
 *   npx tsx scripts/address-report.ts --file addresses.txt --token alex
 *   npx tsx scripts/address-report.ts --file addresses.txt --json
 *   npx tsx scripts/address-report.ts --file addresses.txt --cache held.json
 *   npx tsx scripts/address-report.ts --from-cache held.json --json
 *
 *   --file <path>     addresses one per line; blank lines and # comments skipped
 *   --token <name>    a token to report and flag, as an asset identifier or
 *                     any part of one ("alex"). Fungible or NFT.
 *   --min-token <n>   flag an address holding less than this much of it
 *                     (default: any amount at all is enough)
 *   --min-stx <n>     how much unlocked STX counts as idle (default 100)
 *   --ending-in <n>   flag a stake ending within this many cycles (default 2)
 *   --activity-days <n>  how far back a signed transaction is flagged
 *                     (default 30)
 *   --since <date>    flag transactions from this date on (2026-09-29, UTC),
 *                     instead of the last --activity-days
 *   --no-activity     skip reading recent transactions
 *   --activity-only   read and report recent transactions and nothing else
 *   --nfts            list NFTs in the text report (hidden by default)
 *   --html <path>     also write the report as one self-contained page with
 *                     sortable, filterable tables — see address-report-html.ts
 *   --cache <path>    also write every answer the API gave to this file
 *   --from-cache <p>  report on a file written by --cache, asking nothing
 *   --json            the whole report as JSON
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 *
 * ## Asking once and reporting many times
 *
 * The asking is the slow, rate-limited, and rate-limited-again part: two
 * requests an address, paced, and a long list run anonymously takes minutes.
 * The reporting is instant and is what somebody actually iterates on — a
 * different `--min-stx`, a different token, JSON this time.
 *
 * So `--cache` writes down what the API said, and `--from-cache` reports off
 * that file without a single request. A cached run is deliberately frozen at
 * the moment of capture, cycle included: the flags compare a stake's end
 * against the cycle it was read in, and pairing yesterday's stakes with
 * today's cycle would invent a warning nobody could act on. Every cached
 * report says when it was captured, in the header and in the JSON, because a
 * figure about somebody's money must never quietly read as current.
 *
 * Nothing is written unless `--cache` asks for it. That file holds balances
 * for addresses only its owner has a list of, so it is theirs to put
 * somewhere — committing that into a public repo is not something a script
 * should decide, which is why there is no default path.
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
import { renderHtml } from './address-report-html.js';
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

/**
 * sBTC, which gets a column whether or not anybody asked for one.
 *
 * The full asset identifier, not the contract: the balances endpoint keys
 * fungible tokens by asset, and this contract defines two of them —
 * `sbtc-token` and `sbtc-token-locked`. This is the liquid one, which is what
 * "how much sBTC does this address have" means.
 *
 * sBTC locked against a pox-5 bond is in neither: pox-5 custodies it, and the
 * address's balance goes down by exactly that much. `get-staker-custodied-sbtc`
 * is the read for that, and it is a different question from this column.
 */
export const SBTC_ASSET =
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token';

/**
 * What to divide sBTC by when nobody on the list holds any.
 *
 * Metadata is fetched for every asset the list actually holds, so on a run
 * where sBTC turns up the decimals come from the chain like every other
 * token's. This is only for the column of zeroes on a list holding none —
 * where the scale cannot change the answer, and eight is right anyway.
 */
export const SBTC_DECIMALS = 8;

export interface Options {
  addresses: string[];
  file: string | null;
  token: string | null;
  minToken: string | null;
  minStx: string;
  endingIn: number;
  activityDays: number;
  /** Unix seconds; when given, the window starts here instead. */
  since: number | null;
  activity: boolean;
  activityOnly: boolean;
  nfts: boolean;
  html: string | null;
  cache: string | null;
  fromCache: string | null;
  json: boolean;
}

/**
 * The path after a flag, refusing a flag that was given without one.
 *
 * The older options read a missing value as "not given" and carry on, which
 * for `--token` costs a column. For these two it would cost the whole point
 * of the run: `--cache` with nothing after it would ask for everything, keep
 * none of it, and say nothing about that until somebody went looking for the
 * file. A path that looks like another flag is the same mistake typed
 * differently.
 */
function takesPath(flag: string, argv: string[], at: number): string {
  const value = argv[at];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} takes the path of a file`);
  }
  return value;
}

/**
 * A date, or a moment, as Unix seconds. A bare date is midnight UTC — the
 * same day everywhere a report is read, which a local midnight would not be.
 */
export function parseSince(value: string | undefined): number {
  const iso = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) {
    throw new Error('--since takes a date, like 2026-09-29');
  }
  return ms / 1000;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    addresses: [],
    file: null,
    token: null,
    minToken: null,
    minStx: '100',
    endingIn: 2,
    activityDays: 30,
    since: null,
    activity: true,
    activityOnly: false,
    nfts: false,
    html: null,
    cache: null,
    fromCache: null,
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
    else if (arg === '--activity-days') {
      options.activityDays = Number(argv[(i += 1)]);
    }
    else if (arg === '--since') options.since = parseSince(argv[(i += 1)]);
    else if (arg === '--no-activity') options.activity = false;
    else if (arg === '--activity-only') options.activityOnly = true;
    else if (arg === '--nfts') options.nfts = true;
    else if (arg === '--html') options.html = takesPath(arg, argv, (i += 1));
    else if (arg === '--cache') options.cache = takesPath(arg, argv, (i += 1));
    else if (arg === '--from-cache') {
      options.fromCache = takesPath(arg, argv, (i += 1));
    }
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else options.addresses.push(arg);
  }

  if (!Number.isInteger(options.endingIn) || options.endingIn < 0) {
    throw new Error('--ending-in takes a number of cycles');
  }
  if (!Number.isFinite(options.activityDays) || options.activityDays <= 0) {
    throw new Error('--activity-days takes a number of days');
  }
  if (options.activityOnly && !options.activity) {
    throw new Error('--activity-only and --no-activity leave nothing to report');
  }
  // A capture of transactions alone would read back as a list of addresses
  // whose balances could not be read — every one of them flagged unread.
  // `--from-cache` with `--activity-only` is fine: a full capture has it all.
  if (options.activityOnly && options.cache !== null) {
    throw new Error(
      '--cache keeps a full run; capture without --activity-only and report ' +
        'off it with --from-cache … --activity-only',
    );
  }
  if (options.activityOnly && options.html !== null) {
    throw new Error('--html is a page about balances too; drop --activity-only');
  }
  if (options.activityOnly && options.token !== null) {
    throw new Error('--activity-only reports no balances, so no --token');
  }
  if (options.minToken !== null && options.token === null) {
    throw new Error('--min-token needs a --token to be a minimum of');
  }
  // Reading a capture and writing one in the same run would rewrite the
  // capture with whatever this run happened to report on — and with an
  // address list narrowing it, that is a good file replaced by a subset of
  // itself. There is no reason to want it, so it is refused rather than
  // allowed to quietly cost somebody the slow part twice.
  if (options.cache !== null && options.fromCache !== null) {
    throw new Error(
      '--cache writes what the API said and --from-cache reads it back; ' +
        'a run does one or the other',
    );
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
  /**
   * Recent transactions. Absent when this run did not ask (`--no-activity`,
   * or a capture from before the check existed) — which is not the same as
   * asking and hearing nothing, so it raises no flag either way.
   */
  activity?: Activity;
}

/** One transaction, cut down to what says whose key was used for what. */
export interface ActivityTx {
  txId: string;
  /** Who signed it. */
  sender: string;
  /** Unix seconds: mined at, or for a pending one, received at. */
  time: number;
  type: string;
  status: string;
  /** Sponsored transactions have their fee paid by somebody else. */
  sponsored: boolean;
  fee: bigint;
  /** `contract.function` for a call, the contract for a deploy. */
  call: string | null;
  /**
   * What moved to or from this address, as the chain recorded it. The fee is
   * not in here — it is `fee`, and paying it is what signing costs.
   */
  transfers: Transfer[];
}

/** One asset moving, with both ends named. */
export interface Transfer {
  kind: 'stx' | 'ft' | 'nft';
  /** `STX`, or the asset identifier of the token or NFT collection. */
  asset: string;
  /** Base units of a token or of STX; 1 for an NFT. */
  amount: bigint;
  /** Which NFT, as Clarity writes its id (`u231645`). */
  item: string | null;
  /** Empty for a mint. */
  sender: string;
  /** Empty for a burn. */
  recipient: string;
}

export interface Activity {
  /** Newest first. Null when the API would not list them. */
  confirmed: ActivityTx[] | null;
  /** Null when the mempool would not answer. */
  pending: ActivityTx[] | null;
}

/** How many transactions are read per address. */
export const ACTIVITY_LIMIT = 50;

/** A key unused for this long and then used is worth saying so about. */
export const DORMANT_DAYS = 90;

/** At most this many transactions are spelled out per address. */
const ACTIVITY_SHOWN = 5;

const DAY = 24 * 60 * 60;

/** Unlocked STX: what is theirs to stake, spend or move today. */
export function availableStx(holdings: Holdings): bigint | null {
  if (holdings.stxTotal === null || holdings.stxLocked === null) return null;
  return holdings.stxTotal - holdings.stxLocked;
}

/**
 * The sBTC an address holds.
 *
 * Null, not zero, for an address whose balance would not read: `fungible` is
 * empty on a failed call exactly as it is on an address holding nothing, and
 * the two are not the same claim. Every other figure in this report keeps
 * that distinction and so does this one.
 */
export function sbtcHeld(holdings: Holdings): bigint | null {
  if (holdings.stxTotal === null) return null;
  return holdings.fungible[SBTC_ASSET] ?? 0n;
}

/** sBTC across the list. Addresses that would not read are counted, not summed. */
export function sbtcTotal(all: Holdings[]): { total: bigint; unread: number } {
  let total = 0n;
  let unread = 0;
  for (const holdings of all) {
    const held = sbtcHeld(holdings);
    if (held === null) unread += 1;
    else total += held;
  }
  return { total, unread };
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
  /** Days back a transaction this address signed is flagged. */
  activityDays: number;
  /** Unix seconds the window starts at, overriding `activityDays`. */
  activitySince?: number | null;
}

/** Where the activity window starts. */
export const windowStart = (thresholds: Thresholds, now: number) =>
  thresholds.activitySince ?? now - thresholds.activityDays * DAY;

/** The window in words, for the end of a sentence. */
export const windowLabel = (thresholds: Thresholds) =>
  thresholds.activitySince != null
    ? `since ${isoDay(thresholds.activitySince)} UTC`
    : `in the last ${thresholds.activityDays} day(s)`;

/** What `attentionFor` needs beyond the address itself. */
export interface Context {
  /** Unix seconds — the capture's moment for a cached run, not today's. */
  now: number;
  /** Every address on the list, with its label, to name a counterparty by. */
  listed: ReadonlyMap<string, string | null>;
  /** Symbols and decimals, so a token amount reads the way holders write it. */
  tokenMeta: ReadonlyMap<string, TokenMeta>;
  /**
   * The addresses after `// --- safe ---`. Null when the list has no such
   * section, and then nothing is called compromised either — a list that
   * never said which keys are good cannot be read as saying they are all bad.
   */
  safe: ReadonlySet<string> | null;
}

const emptyContext = (): Context => ({
  now: Date.now() / 1000,
  listed: new Map(),
  tokenMeta: new Map(),
  safe: null,
});

/** Where an address stands, as far as the list says. */
export type KeyStatus = 'safe' | 'compromised' | 'unmarked';

export function keyStatus(
  address: string,
  safe: ReadonlySet<string> | null,
): KeyStatus {
  if (safe === null) return 'unmarked';
  return safe.has(address) ? 'safe' : 'compromised';
}

export interface ListEntry extends AddressEntry {
  safe: boolean;
}

/** `// --- safe ---`, and any other `--- name ---` heading. */
const SECTION = /^\s*(?:\/\/|#)\s*-{2,}\s*(.*?)\s*-{2,}\s*$/;

/**
 * The address file, with the safe section marked.
 *
 * Read a line at a time through `parseAddressList`, so the file means exactly
 * what it meant before a section was added to it; the heading only decides
 * which side of the line each address is on.
 */
export function parseSections(text: string): {
  entries: ListEntry[];
  rejected: string[];
  marked: boolean;
} {
  const entries: ListEntry[] = [];
  const rejected: string[] = [];
  let safe = false;
  let marked = false;

  for (const line of text.split('\n')) {
    const heading = SECTION.exec(line);
    if (heading) {
      safe = heading[1].toLowerCase() === 'safe';
      marked = marked || safe;
      continue;
    }
    const parsed = parseAddressList(line);
    rejected.push(...parsed.rejected);
    entries.push(...parsed.entries.map((entry) => ({ ...entry, safe })));
  }
  return { entries, rejected, marked };
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
  context: Context = emptyContext(),
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

  // Before anything about staking: a key somebody else holds outranks every
  // other decision on the list, and a stake ending is no news by comparison.
  reasons.push(...activityAttention(holdings, thresholds, context));

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

/** `0xa844885245…16b1` — enough to find it, short enough to read. */
const shortTx = (txId: string) => `${txId.slice(0, 12)}…${txId.slice(-4)}`;

const isoDay = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ');

/** A counterparty by its label when the list gives it one. */
function nameParty(
  party: string,
  listed: ReadonlyMap<string, string | null>,
  safe: ReadonlySet<string> | null = null,
): string {
  if (!listed.has(party)) return `${party} (not on the list)`;
  const label = listed.get(party);
  return `${shortPrincipal(party)} (${label ? label : 'on the list'}${
    safe?.has(party) ? ', safe' : ''
  })`;
}

/**
 * An amount of an asset the way its holders would write it — or, with no
 * metadata to go on, in base units and saying so, because `42487` of a token
 * with eight decimals read as whole tokens is wrong by a hundred million.
 */
export function describeAmount(
  transfer: Transfer,
  tokenMeta: ReadonlyMap<string, TokenMeta>,
): string {
  if (transfer.kind === 'stx') return `${formatStx(transfer.amount)} STX`;
  if (transfer.kind === 'nft') {
    return `${assetName(transfer.asset)} ${transfer.item ?? ''}`.trimEnd();
  }
  const meta = tokenMeta.get(transfer.asset);
  return meta?.known
    ? `${formatUnits(transfer.amount, meta.decimals)} ${meta.symbol}`
    : `${transfer.amount} ${assetName(transfer.asset)} (base units)`;
}

/** At most this many transfers are spelled out per transaction. */
const TRANSFERS_SHOWN = 3;

/** One transaction in a sentence: what it did and where things went. */
export function describeTx(
  tx: ActivityTx,
  address: string,
  context: Pick<Context, 'listed' | 'tokenMeta'> & Partial<Pick<Context, 'safe'>>,
): string {
  let what: string | null;
  if (tx.type === 'contract_call' && tx.call) {
    // `shortPrincipal` keeps one dot's worth, and a call has two.
    const at = tx.call.lastIndexOf('.');
    what = `called ${shortPrincipal(tx.call.slice(0, at))}${tx.call.slice(at)}`;
  } else if (tx.type === 'smart_contract' && tx.call) {
    what = `deployed ${shortPrincipal(tx.call)}`;
  } else if (tx.type === 'token_transfer') {
    // The transfer below says all of it.
    what = tx.transfers.length ? null : 'STX transfer';
  } else {
    what = tx.type.replace(/_/g, ' ');
  }

  // Out before in: what left is what somebody has to account for.
  const out = tx.transfers.filter((t) => t.sender === address);
  const into = tx.transfers.filter(
    (t) => t.sender !== address && t.recipient === address,
  );
  const moved = [
    ...out.map(
      (t) =>
        `sent ${describeAmount(t, context.tokenMeta)} to ` +
        (t.recipient
          ? nameParty(t.recipient, context.listed, context.safe)
          : 'nobody (burned)'),
    ),
    ...into.map(
      (t) =>
        `received ${describeAmount(t, context.tokenMeta)}` +
        (t.sender
          ? ` from ${nameParty(t.sender, context.listed, context.safe)}`
          : ' (minted)'),
    ),
  ];
  const shown = moved.slice(0, TRANSFERS_SHOWN);
  if (moved.length > TRANSFERS_SHOWN) {
    shown.push(`${moved.length - TRANSFERS_SHOWN} more transfer(s)`);
  }

  return (
    [what, shown.join('; ')].filter(Boolean).join(': ') +
    (tx.status === 'success' || tx.status === 'pending'
      ? ''
      : ` [${tx.status}]`) +
    (tx.sponsored ? ' [sponsored]' : '') +
    ` ${shortTx(tx.txId)}`
  );
}

/** Whether a transaction took anything out of `address`. */
const movesOut = (tx: ActivityTx, address: string) =>
  tx.transfers.some((t) => t.sender === address);

/**
 * What the recent history says about who holds this key.
 *
 * Only what the address signed, plus anything else that took something out
 * of it.
 * Everything coming in is somebody else's doing and says nothing about this
 * key — airdrops especially, which would bury the one line that matters.
 */
export function activityAttention(
  holdings: Holdings,
  thresholds: Thresholds,
  context: Context,
): Attention[] {
  const { activity, address } = holdings;
  if (activity === undefined) return [];

  const reasons: Attention[] = [];
  if (activity.confirmed === null || activity.pending === null) {
    reasons.push({
      tag: 'unread',
      detail:
        'the API would not list recent transactions, so nobody can say ' +
        'whether this key has been used',
    });
  }

  const status = keyStatus(address, context.safe);
  const isSafe = (other: string) => context.safe?.has(other) ?? false;
  /*
   * Whether a transaction is worth a line, given whose key this is.
   *
   * A possibly compromised key moving everything to a safe one is the rescue
   * — the thing that is supposed to be happening — and listing it would bury
   * the transaction nobody here sent. A safe key signing is its owner using
   * it; what matters there is only something leaving for an address that is
   * not safe.
   */
  const outsideSafe = (tx: ActivityTx) =>
    tx.transfers.some((t) => t.sender === address && !isSafe(t.recipient));
  const rescueOnly = (tx: ActivityTx) =>
    movesOut(tx, address) && !outsideSafe(tx);
  const worthSaying = (tx: ActivityTx) => {
    if (status === 'safe') return outsideSafe(tx);
    if (status === 'compromised') return !rescueOnly(tx);
    return true;
  };

  for (const tx of activity.pending ?? []) {
    if (tx.sender !== address || !worthSaying(tx)) continue;
    reasons.push({
      tag: 'pending',
      detail: `signed and waiting in the mempool: ${describeTx(tx, address, context)}`,
    });
  }

  const since = windowStart(thresholds, context.now);
  const confirmed = activity.confirmed ?? [];
  const recent = confirmed.filter(
    (tx) =>
      tx.time >= since &&
      (tx.sender === address || movesOut(tx, address)) &&
      worthSaying(tx),
  );
  if (recent.length === 0) return reasons;

  // A key that sat unused for months and is suddenly signing. The previous
  // signature is looked for in what was read; finding none in a full page
  // says nothing, finding none in a short one means this is the first ever.
  // Not for a safe key, which is new and meant to be used, and not when the
  // signature that woke it was the rescue.
  const signed = confirmed.filter((tx) => tx.sender === address);
  const firstRecent = signed
    .filter((tx) => tx.time >= since && worthSaying(tx))
    .at(-1);
  if (firstRecent && status !== 'safe') {
    const before = signed.find((tx) => tx.time < firstRecent.time);
    const quiet = before ? (firstRecent.time - before.time) / DAY : null;
    if (quiet !== null && quiet >= DORMANT_DAYS) {
      reasons.push({
        tag: 'woke up',
        detail: `signed on ${isoDay(firstRecent.time)} after ${Math.floor(quiet)} days of nothing (last before: ${isoDay(before!.time)})`,
      });
    } else if (before === undefined && confirmed.length < ACTIVITY_LIMIT) {
      reasons.push({
        tag: 'woke up',
        detail: `signed on ${isoDay(firstRecent.time)}, the first transaction this address ever signed`,
      });
    }
  }

  for (const tx of recent.slice(0, ACTIVITY_SHOWN)) {
    reasons.push({
      tag: outsideSafe(tx) || (status === 'unmarked' && movesOut(tx, address))
        ? 'outflow'
        : 'signed',
      detail:
        `${isoDay(tx.time)} ${describeTx(tx, address, context)}` +
        (tx.sender === address ? '' : ` — signed by ${tx.sender}`),
    });
  }
  if (recent.length > ACTIVITY_SHOWN) {
    reasons.push({
      tag: 'signed',
      detail: `… and ${recent.length - ACTIVITY_SHOWN} more ${windowLabel(thresholds)}`,
    });
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

export interface AtRisk {
  address: string;
  label: string | null;
  /** Null when the balance would not read. */
  unlocked: bigint | null;
  locked: bigint | null;
  /** The cycle a pox-5 stake unlocks in; null for no stake, or a pox-4 lock. */
  unlocksAt: number | null;
  sbtc: bigint | null;
  /** Other fungible tokens with a balance, by asset. */
  tokens: Record<string, bigint>;
  nfts: number;
}

/**
 * What is still sitting on the possibly compromised addresses — the list of
 * things left to move, and the reason this report exists.
 *
 * Locked STX is on it with the cycle it unlocks in, because that is the date
 * a thief holding the key can take it, and so the date the rescue has to beat.
 * An address with nothing left is left out; one that would not read stays in,
 * because "nothing known" is not "nothing there".
 */
export function atRisk(
  all: Holdings[],
  safe: ReadonlySet<string> | null,
): AtRisk[] {
  if (safe === null) return [];
  return all
    .filter((h) => !safe.has(h.address))
    .map((h) => {
      const tokens: Record<string, bigint> = {};
      for (const [asset, amount] of Object.entries(h.fungible)) {
        if (asset !== SBTC_ASSET && amount > 0n) tokens[asset] = amount;
      }
      return {
        address: h.address,
        label: h.label,
        unlocked: availableStx(h),
        locked: h.stxLocked,
        unlocksAt: h.stake ? unlockCycle(h.stake) : null,
        sbtc: sbtcHeld(h),
        tokens,
        nfts: Object.values(h.nfts).reduce((a, b) => a + b, 0),
      };
    })
    .filter(
      (r) =>
        r.unlocked === null ||
        r.unlocked > 0n ||
        (r.locked ?? 0n) > 0n ||
        (r.sbtc ?? 0n) > 0n ||
        Object.keys(r.tokens).length > 0 ||
        r.nfts > 0,
    );
}

// ---------------------------------------------------------------------------
// Keeping what the API said
// ---------------------------------------------------------------------------

/**
 * Everything one run asked for, so the next one need not ask again.
 *
 * The whole answer and not a summary: balances, stakes, token metadata and
 * the cycle it was all read in. A cache that dropped anything would make
 * `--from-cache` a different report from the one that captured it, which is
 * the one thing it must not be.
 *
 * `stakeRead` carries what `Holdings.stake` says with three states and JSON
 * only has two. Undefined there means pox-5 would not answer, and null means
 * it answered "no position" — the difference between not knowing and knowing
 * nothing, which this report is largely about. `stakeRead: false` is the
 * first; `stake: null` with `stakeRead: true` is the second.
 *
 * Every amount is a decimal string. `JSON.stringify` throws outright on a
 * bigint rather than rounding one, so a `Stake` cannot go in as it stands —
 * and a cache that only worked for addresses with no stake would fail on
 * exactly the addresses this report is for.
 */
export interface CachedReport {
  /** ISO 8601, and the reason every cached report says its own age out loud. */
  capturedAt: string;
  /** Which node answered, so a capture taken against a local node says so. */
  node: string;
  /** The cycle at capture. A cached run reports against this, not against today. */
  cycle: number;
  addresses: {
    address: string;
    label: string | null;
    stxTotal: string | null;
    stxLocked: string | null;
    stake: {
      signer: string;
      ustx: string;
      firstCycle: number;
      numCycles: number;
    } | null;
    stakeRead: boolean;
    fungible: Record<string, string>;
    nfts: Record<string, number>;
    /** Absent when the run did not ask; amounts as strings, as everywhere. */
    activity?: {
      confirmed: CachedTx[] | null;
      pending: CachedTx[] | null;
    };
  }[];
  tokenMeta: TokenMeta[];
  /** The list's safe section at capture; absent when it had none. */
  safe?: string[];
}

type CachedTx = Omit<ActivityTx, 'fee' | 'transfers'> & {
  fee: string;
  transfers: (Omit<Transfer, 'amount'> & { amount: string })[];
};

const txToCache = (tx: ActivityTx): CachedTx => ({
  ...tx,
  fee: tx.fee.toString(),
  transfers: tx.transfers.map((t) => ({ ...t, amount: t.amount.toString() })),
});

const txFromCache = (tx: CachedTx): ActivityTx => ({
  ...tx,
  fee: BigInt(tx.fee),
  transfers: (tx.transfers ?? []).map((t) => ({
    ...t,
    amount: BigInt(t.amount),
  })),
});

/**
 * Whether `--cache` can be written, asked before a single request goes out.
 *
 * The write itself happens at the end, after minutes of paced, rate-limited
 * asking. A path that cannot be written is therefore the most expensive kind
 * of typo in this script: it throws away the answers, the report and the
 * retry round with them. `--cache addr` where `addr` is a directory did
 * exactly that.
 *
 * So the path is tested first, and the run stops before it costs anything.
 * A sentence naming the problem, or null when there is none.
 */
export function cachePathProblem(
  target: string,
  flag = '--cache',
): string | null {
  if (target === '') return `${flag} was given an empty path`;

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return (
      `${target} is a directory — ${flag} takes the path of the file to ` +
      'write, and picking a name inside a directory is not a script\'s call'
    );
  }

  const parent = path.dirname(path.resolve(target));
  if (!fs.existsSync(parent)) {
    return `${parent} does not exist, so ${target} cannot be written`;
  }
  try {
    fs.accessSync(parent, fs.constants.W_OK);
  } catch {
    return `${parent} cannot be written to, so neither can ${target}`;
  }

  // A writable directory is not a writable file: an existing capture could be
  // read-only, or owned by somebody else.
  if (fs.existsSync(target)) {
    try {
      fs.accessSync(target, fs.constants.W_OK);
    } catch {
      return `${target} exists and cannot be written to`;
    }
  }
  return null;
}

export function toCache(
  holdings: Holdings[],
  cycle: number,
  tokenMeta: Map<string, TokenMeta>,
  node: string,
  capturedAt = new Date().toISOString(),
  safe: ReadonlySet<string> | null = null,
): CachedReport {
  return {
    ...(safe && { safe: [...safe] }),
    capturedAt,
    node,
    cycle,
    addresses: holdings.map((h) => ({
      address: h.address,
      label: h.label,
      stxTotal: h.stxTotal === null ? null : h.stxTotal.toString(),
      stxLocked: h.stxLocked === null ? null : h.stxLocked.toString(),
      stake: h.stake
        ? { ...h.stake, ustx: h.stake.ustx.toString() }
        : null,
      stakeRead: h.stake !== undefined,
      fungible: Object.fromEntries(
        Object.entries(h.fungible).map(([asset, amount]) => [
          asset,
          amount.toString(),
        ]),
      ),
      nfts: h.nfts,
      ...(h.activity && {
        activity: {
          confirmed: h.activity.confirmed?.map(txToCache) ?? null,
          pending: h.activity.pending?.map(txToCache) ?? null,
        },
      }),
    })),
    tokenMeta: [...tokenMeta.values()],
  };
}

/**
 * A capture, read back.
 *
 * Throws by name on anything that is not one. A cache is a file a person
 * points at, and pointing at the wrong file should say so rather than produce
 * a report of no addresses — which would read as a list where nothing needs
 * attention.
 */
export function fromCache(value: unknown): {
  capturedAt: string;
  node: string;
  cycle: number;
  holdings: Holdings[];
  tokenMeta: Map<string, TokenMeta>;
  safe: Set<string> | null;
} {
  const data = value as Partial<CachedReport> | null;
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.capturedAt !== 'string' ||
    typeof data.cycle !== 'number' ||
    !Array.isArray(data.addresses)
  ) {
    throw new Error('Not an address-report cache — see --cache');
  }

  const holdings: Holdings[] = data.addresses.map((entry) => ({
    address: entry.address,
    label: entry.label ?? null,
    stxTotal: entry.stxTotal === null ? null : BigInt(entry.stxTotal),
    stxLocked: entry.stxLocked === null ? null : BigInt(entry.stxLocked),
    stake: entry.stakeRead
      ? entry.stake && { ...entry.stake, ustx: BigInt(entry.stake.ustx) }
      : undefined,
    fungible: Object.fromEntries(
      Object.entries(entry.fungible ?? {}).map(([asset, amount]) => [
        asset,
        BigInt(amount),
      ]),
    ),
    nfts: entry.nfts ?? {},
    ...(entry.activity && {
      activity: {
        confirmed: entry.activity.confirmed?.map(txFromCache) ?? null,
        pending: entry.activity.pending?.map(txFromCache) ?? null,
      },
    }),
  }));

  const tokenMeta = new Map<string, TokenMeta>();
  for (const meta of data.tokenMeta ?? []) tokenMeta.set(meta.asset, meta);

  return {
    capturedAt: data.capturedAt,
    node: data.node ?? 'an unnamed node',
    cycle: data.cycle,
    holdings,
    tokenMeta,
    safe: Array.isArray(data.safe) ? new Set(data.safe) : null,
  };
}

// ---------------------------------------------------------------------------
// The parts that ask
// ---------------------------------------------------------------------------

interface BalancesResponse {
  stx?: { balance?: string; locked?: string };
  fungible_tokens?: Record<string, { balance?: string }>;
  non_fungible_tokens?: Record<string, { count?: string }>;
}

export interface ApiTx {
  tx_id: string;
  sender_address: string;
  block_time?: number;
  receipt_time?: number;
  tx_type: string;
  tx_status: string;
  sponsored?: boolean;
  fee_rate?: string;
  token_transfer?: { recipient_address?: string; amount?: string };
  contract_call?: { contract_id?: string; function_name?: string };
  smart_contract?: { contract_id?: string };
}

interface ApiAddressTx {
  tx: ApiTx;
  stx_transfers?: { amount: string; sender?: string; recipient?: string }[];
  ft_transfers?: {
    amount: string;
    asset_identifier: string;
    sender?: string;
    recipient?: string;
  }[];
  nft_transfers?: {
    value?: { repr?: string };
    asset_identifier: string;
    sender?: string;
    recipient?: string;
  }[];
}

/**
 * The API's transaction, cut down.
 *
 * The transfers come from the API's own lists of what moved to or from this
 * address — amounts and both ends, not totals — so a contract call that sent
 * sBTC to a stranger says so, and says how much. A pending transaction has
 * none of that yet; a plain STX transfer stands in for itself, and a pending
 * contract call says nothing about what it will move.
 */
export function toActivityTx(
  tx: ApiTx,
  moved: Omit<ApiAddressTx, 'tx'> = {},
): ActivityTx {
  const transfers: Transfer[] = [
    ...(moved.stx_transfers ?? []).map((t) => ({
      kind: 'stx' as const,
      asset: 'STX',
      amount: BigInt(t.amount),
      item: null,
      sender: t.sender ?? '',
      recipient: t.recipient ?? '',
    })),
    ...(moved.ft_transfers ?? []).map((t) => ({
      kind: 'ft' as const,
      asset: t.asset_identifier,
      amount: BigInt(t.amount),
      item: null,
      sender: t.sender ?? '',
      recipient: t.recipient ?? '',
    })),
    ...(moved.nft_transfers ?? []).map((t) => ({
      kind: 'nft' as const,
      asset: t.asset_identifier,
      amount: 1n,
      item: t.value?.repr ?? null,
      sender: t.sender ?? '',
      recipient: t.recipient ?? '',
    })),
  ];
  if (
    transfers.length === 0 &&
    tx.tx_status === 'pending' &&
    tx.tx_type === 'token_transfer' &&
    tx.token_transfer?.recipient_address
  ) {
    transfers.push({
      kind: 'stx',
      asset: 'STX',
      amount: BigInt(tx.token_transfer.amount ?? '0'),
      item: null,
      sender: tx.sender_address,
      recipient: tx.token_transfer.recipient_address,
    });
  }

  return {
    txId: tx.tx_id,
    sender: tx.sender_address,
    time: tx.block_time ?? tx.receipt_time ?? 0,
    type: tx.tx_type,
    status: tx.tx_status,
    sponsored: tx.sponsored ?? false,
    fee: BigInt(tx.fee_rate ?? '0'),
    call: tx.contract_call?.contract_id
      ? `${tx.contract_call.contract_id}.${tx.contract_call.function_name ?? ''}`
      : (tx.smart_contract?.contract_id ?? null),
    transfers,
  };
}

async function readActivity(address: string): Promise<Activity> {
  const confirmed = (
    await getJson<{ results?: ApiAddressTx[] }>(
      `${API_URL}/extended/v1/address/${address}/transactions_with_transfers?limit=${ACTIVITY_LIMIT}`,
    )
  ).value;
  await sleep(SPACING_MS);
  const pending = (
    await getJson<{ results?: ApiTx[] }>(
      `${API_URL}/extended/v1/address/${address}/mempool?limit=${ACTIVITY_LIMIT}`,
    )
  ).value;
  await sleep(SPACING_MS);

  return {
    confirmed:
      confirmed?.results?.map(({ tx, ...moved }) => toActivityTx(tx, moved)) ??
      null,
    pending: pending?.results?.map((tx) => toActivityTx(tx)) ?? null,
  };
}

/**
 * Every asset that moved in a transaction this report will describe, as the
 * roll-up's totals — so its metadata is read with everything else's. Tokens
 * an address sent away entirely are in nobody's balance any more, and without
 * this an amount of them could only be printed undivided.
 */
export function transferredAssets(all: Holdings[]): AssetTotal[] {
  const seen = new Map<string, AssetTotal>();
  for (const h of all) {
    for (const tx of [
      ...(h.activity?.confirmed ?? []),
      ...(h.activity?.pending ?? []),
    ]) {
      for (const t of tx.transfers) {
        if (t.kind === 'stx' || seen.has(t.asset)) continue;
        seen.set(t.asset, {
          asset: t.asset,
          kind: t.kind,
          total: 0n,
          holders: 0,
        });
      }
    }
  }
  return [...seen.values()];
}

async function readHoldings(
  entry: AddressEntry,
  withActivity = true,
  activityOnly = false,
): Promise<Holdings> {
  const { address } = entry;
  if (activityOnly) {
    return {
      address,
      label: entry.label,
      stxTotal: null,
      stxLocked: null,
      stake: undefined,
      fungible: {},
      nfts: {},
      activity: await readActivity(address),
    };
  }
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
    ...(withActivity && { activity: await readActivity(address) }),
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
function printAssets(
  rows: Row[],
  tokenMeta: Map<string, TokenMeta>,
  showNfts: boolean,
) {
  const holdings = rows.map((row) => row.holdings);
  const stx = stxTotal(holdings);
  const assets = assetTotals(holdings).filter(
    (entry) => showNfts || entry.kind === 'ft',
  );

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
    console.log(showNfts ? '  (no tokens and no NFTs)' : '  (no tokens)');
  }
  if (!showNfts) {
    console.log('  NFTs are left out; --nfts lists them.');
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

/** The list somebody acts on: every address with a reason, and the reasons. */
function printAttention(rows: Pick<Row, 'holdings' | 'reasons'>[]) {
  const needing = rows.filter((row) => row.reasons.length > 0);
  if (needing.length === 0) {
    console.log('\nNothing needs attention.\n');
    return;
  }
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

/** `--activity-only`: who signed what, and nothing about balances. */
function printActivityOnly(
  rows: Pick<Row, 'holdings' | 'reasons'>[],
  thresholds: Thresholds,
  captured: { at: string; node: string } | null,
) {
  console.log(
    `\n${rows.length} address(es), transactions ${windowLabel(thresholds)}`,
  );
  if (captured) {
    console.log(
      `Cached answers captured ${captured.at} from ${captured.node}; the` +
        ' window ends then, not now.',
    );
  }
  printAttention(rows);
  console.log(
    'Flags: pending — signed and still in the mempool. outflow — something' +
      ' left the address. signed — anything else it signed. woke up — the' +
      ` first signature in ${DORMANT_DAYS} days or more, or ever. unread —` +
      ' the history would not read. If nobody here sent it, treat the key as' +
      ' compromised.\n',
  );
}

function printAtRisk(
  risks: AtRisk[],
  tokenMeta: Map<string, TokenMeta>,
  showNfts: boolean,
) {
  console.log('STILL ON POSSIBLY COMPROMISED ADDRESSES\n');
  if (risks.length === 0) {
    console.log('  Nothing — every address before the safe section is empty.\n');
    return;
  }
  const sbtcDecimals = tokenMeta.get(SBTC_ASSET)?.decimals ?? SBTC_DECIMALS;
  const amount = (v: bigint | null, d: number) =>
    v === null ? 'not known' : v === 0n ? '—' : formatUnits(v, d);
  console.log(
    `  ${'address'.padEnd(15)} ${'label'.padEnd(24)} ${'unlocked STX'.padStart(16)} ${'locked STX'.padStart(16)} ${'unlocks'.padStart(7)} ${'sBTC'.padStart(12)}  other`,
  );
  const total = { unlocked: 0n, locked: 0n, sbtc: 0n };
  for (const r of risks) {
    total.unlocked += r.unlocked ?? 0n;
    total.locked += r.locked ?? 0n;
    total.sbtc += r.sbtc ?? 0n;
    const other = Object.entries(r.tokens).map(([asset, v]) => {
      const meta = tokenMeta.get(asset);
      return meta?.known
        ? `${formatUnits(v, meta.decimals)} ${meta.symbol}`
        : `${v} ${assetName(asset)}`;
    });
    if (showNfts && r.nfts) other.push(`${r.nfts} NFT(s)`);
    console.log(
      `  ${shortPrincipal(r.address).padEnd(15)} ${(r.label ?? '—').slice(0, 24).padEnd(24)} ${amount(r.unlocked, 6).padStart(16)} ${amount(r.locked, 6).padStart(16)} ${(r.unlocksAt === null ? ((r.locked ?? 0n) > 0n ? 'pox-4' : '—') : `c${r.unlocksAt}`).padStart(7)} ${amount(r.sbtc, sbtcDecimals).padStart(12)}  ${other.join(', ')}`.trimEnd(),
    );
  }
  console.log(
    `\n  ${'total'.padEnd(40)} ${formatStx(total.unlocked).padStart(16)} ${formatStx(total.locked).padStart(16)} ${''.padStart(7)} ${formatUnits(total.sbtc, sbtcDecimals).padStart(12)}`,
  );
  console.log(
    '\n  Unlocked STX and tokens can be taken by anyone holding the key today;' +
      ' locked STX from the cycle it unlocks in.\n',
  );
}

function printReport(
  rows: Row[],
  meta: TokenMeta | null,
  cycle: number,
  thresholds: Thresholds,
  tokenMeta: Map<string, TokenMeta>,
  captured: { at: string; node: string } | null,
  safe: ReadonlySet<string> | null,
  showNfts: boolean,
) {
  console.log(
    `\n${rows.length} address(es), reward cycle ${cycle}` +
      (meta ? `, token ${meta.symbol} (${meta.asset})` : ''),
  );
  // Said before anything else, and every time: a cached report is a report
  // about the past, and the one way it could mislead is by not saying so.
  if (captured) {
    console.log(
      `Cached answers captured ${captured.at} from ${captured.node}.` +
        ' Nothing was asked of the chain, so every figure below is as it was' +
        ' then — the cycle included.',
    );
  }

  printAttention(rows);

  if (safe !== null) {
    printAtRisk(
      atRisk(
        rows.map((row) => row.holdings),
        safe,
      ),
      tokenMeta,
      showNfts,
    );
  }

  printAssets(rows, tokenMeta, showNfts);

  // A labelled list is read by its labels, so they get the room and the
  // address gets shortened to make it — the full ones are in the attention
  // block above, which is the part somebody copies out of. An unlabelled list
  // has nothing else to go on, so the address stays whole.
  const labelled = rows.some((row) => row.holdings.label);

  // One definition of the columns, used by the heading, every row and the
  // totals. Three copies of the widths is how a totals line ends up under the
  // wrong column, which in a report about money is worse than ugly.
  /*
   * sBTC has a column of its own unless `--token` already named it, in which
   * case that column is this one and printing both would be the same number
   * twice under two headings.
   */
  const sbtcColumn = meta?.asset !== SBTC_ASSET;
  const sbtcDecimals = tokenMeta.get(SBTC_ASSET)?.decimals ?? SBTC_DECIMALS;

  const columns: { heading: string; width: number; left?: boolean }[] = [
    { heading: 'address', width: labelled ? 15 : 41, left: true },
    ...(labelled ? [{ heading: 'label', width: 24, left: true }] : []),
    { heading: 'STX total', width: 18 },
    { heading: 'staked', width: 18 },
    { heading: 'with', width: 20, left: true },
    { heading: 'ends', width: 5 },
    ...(meta ? [{ heading: meta.symbol.slice(0, 14), width: 16 }] : []),
    ...(sbtcColumn ? [{ heading: 'sBTC', width: 16 }] : []),
    ...(showNfts ? [{ heading: 'NFTs', width: 5 }] : []),
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
    const sbtc = sbtcHeld(holdings);
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
        // '?' rather than a zero, for the same reason the STX column says
        // "not known": an address this run could not read holds an unknown
        // amount of sBTC, which is not none of it.
        ...(sbtcColumn
          ? [sbtc === null ? '?' : formatUnits(sbtc, sbtcDecimals)]
          : []),
        ...(showNfts ? [String(nftCount)] : []),
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
  const sbtc = sbtcTotal(rows.map((row) => row.holdings));

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
      ...(sbtcColumn ? [formatUnits(sbtc.total, sbtcDecimals)] : []),
      ...(showNfts ? [''] : []),
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
      ` pending / outflow / signed — a transaction this address signed (or one` +
      ` that took something out of it) ${windowLabel(thresholds)};` +
      ' if nobody here sent it, treat the key as compromised. woke up — the' +
      ` first signature in ${DORMANT_DAYS} days or more.` +
      ' unread — this run could not find out, which is not the same as nothing.',
  );
  if (sbtcColumn) {
    console.log(
      'sBTC is what each address holds itself. sBTC locked against a pox-5' +
        ' bond is custodied by pox-5 and is in nobody\'s balance, so it is not' +
        ' in this column.' +
        (sbtc.unread
          ? ` ${sbtc.unread} address(es) would not read, so the total is at` +
            ' least this much.'
          : ''),
    );
  }
  console.log(
    'Amounts are exact, never rounded. An address the API would not answer' +
      ' for shows as "not known" rather than as empty.\n',
  );
}

export function toJson(
  rows: Row[],
  meta: TokenMeta | null,
  cycle: number,
  tokenMeta: Map<string, TokenMeta>,
  captured: { at: string; node: string } | null,
  context: Pick<Context, 'safe' | 'now'> = { safe: null, now: Date.now() / 1000 },
  window: { since: number; label: string } = {
    since: context.now - 30 * DAY,
    label: 'in the last 30 day(s)',
  },
) {
  const holdings = rows.map((row) => row.holdings);
  const stx = stxTotal(holdings);
  const sbtc = sbtcTotal(holdings);
  const amounts = (record: Record<string, bigint>) =>
    Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, v.toString()]),
    );

  return {
    cycle,
    /** Unix seconds the activity window ends at. */
    now: context.now,
    /** The activity window: flagged transactions are from `since` on. */
    window,
    /** The safe section of the list, or null when it has none. */
    safe: context.safe && [...context.safe],
    tokenMeta: [...tokenMeta.values()],
    atRisk: atRisk(holdings, context.safe).map((r) => ({
      ...r,
      unlocked: r.unlocked?.toString() ?? null,
      locked: r.locked?.toString() ?? null,
      sbtc: r.sbtc?.toString() ?? null,
      tokens: amounts(r.tokens),
    })),
    // Null for a run that asked the chain. Present means every figure here
    // is as it was at `at`, and a consumer that ignores it is reading old
    // balances as current ones.
    captured,
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
      sbtc: {
        asset: SBTC_ASSET,
        decimals: tokenMeta.get(SBTC_ASSET)?.decimals ?? SBTC_DECIMALS,
        total: sbtc.total.toString(),
        unread: sbtc.unread,
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
      status: keyStatus(row.holdings.address, context.safe),
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
      sbtc: sbtcHeld(row.holdings)?.toString() ?? null,
      fungible: Object.fromEntries(
        Object.entries(row.holdings.fungible).map(([k, v]) => [
          k,
          v.toString(),
        ]),
      ),
      nfts: row.holdings.nfts,
      activity: row.holdings.activity && {
        confirmed:
          row.holdings.activity.confirmed?.map(txToCache) ?? null,
        pending: row.holdings.activity.pending?.map(txToCache) ?? null,
      },
      attention: row.reasons,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Before the address list, and long before the asking: a `--cache` path
  // that cannot be written is a run that will cost minutes and keep nothing.
  for (const [flag, target] of [
    ['--cache', options.cache],
    ['--html', options.html],
  ] as const) {
    if (target === null) continue;
    const problem = cachePathProblem(target, flag);
    if (problem !== null) {
      console.error(`Nothing has been asked yet — ${problem}.`);
      process.exit(1);
      return;
    }
  }

  const named: AddressEntry[] = options.addresses.map((address) => ({
    address,
    label: null,
  }));
  // Which keys are known good. From the file when it says, otherwise from the
  // capture being reported on — see below.
  let safe: Set<string> | null = null;
  if (options.file) {
    const parsed = parseSections(fs.readFileSync(options.file, 'utf8'));
    named.push(...parsed.entries);
    if (parsed.marked) {
      safe = new Set(
        parsed.entries.filter((e) => e.safe).map((e) => e.address),
      );
    }
    for (const line of parsed.rejected) {
      console.error(`  not a principal, skipped: ${line}`);
    }
  }

  // An address listed twice is one address; the first label given wins.
  const wanted = named.filter(
    (entry, index) =>
      named.findIndex((other) => other.address === entry.address) === index,
  );
  // A cached run needs no list: the capture is the list. Naming addresses
  // alongside it narrows the report to those, which is how somebody asks
  // about a handful without paying for the whole file again.
  if (wanted.length === 0 && options.fromCache === null) {
    console.error(
      'Name some addresses, or point at a file of them.\n' +
        '  npx tsx scripts/address-report.ts SP2C2… --token sbtc\n' +
        '  npx tsx scripts/address-report.ts --file addresses.txt\n' +
        '  npx tsx scripts/address-report.ts --from-cache held.json\n',
    );
    process.exit(1);
  }

  let cycle: number;
  let holdings: Holdings[];
  let tokenMeta: Map<string, TokenMeta>;
  let captured: { at: string; node: string } | null = null;

  if (options.fromCache !== null) {
    const cached = fromCache(
      JSON.parse(fs.readFileSync(options.fromCache, 'utf8')),
    );
    cycle = cached.cycle;
    tokenMeta = cached.tokenMeta;
    safe = safe ?? cached.safe;
    captured = { at: cached.capturedAt, node: cached.node };

    if (wanted.length === 0) {
      holdings = cached.holdings;
    } else {
      /*
       * The list narrows the capture. An address asked for that the capture
       * has nothing on is kept rather than dropped, as an address nothing
       * could be read about — dropping it would answer "nothing needs
       * attention" about an address this run never looked at.
       *
       * The label comes from the list where the list gives one: a label is
       * the reader's own annotation, and theirs today beats theirs at capture.
       */
      const byAddress = new Map(cached.holdings.map((h) => [h.address, h]));
      holdings = wanted.map((entry) => {
        const found = byAddress.get(entry.address);
        if (!found) {
          return {
            address: entry.address,
            label: entry.label,
            stxTotal: null,
            stxLocked: null,
            stake: undefined,
            fungible: {},
            nfts: {},
          };
        }
        return { ...found, label: entry.label ?? found.label };
      });
      const missing = holdings.filter((h) => !byAddress.has(h.address)).length;
      if (missing && !options.json) {
        console.error(
          `  ${missing} address(es) are not in the capture, and are reported` +
            ' as unread rather than as empty.',
        );
      }
    }
  } else {
    if (!options.json) {
      console.log(
        `Asking ${describeNode()} about ${wanted.length} address(es) ...`,
      );
    }

    // The cycle is only for stakes, which an activity-only run never reads.
    const read = options.activityOnly ? 0 : await fetchCurrentCycle();
    if (read === null) {
      console.error('The node would not say what cycle it is in.');
      process.exit(1);
      return;
    }
    cycle = read;

    holdings = [];
    for (const entry of wanted) {
      holdings.push(
        await readHoldings(entry, options.activity, options.activityOnly),
      );
    }

    // A long list run anonymously outruns the rate limit somewhere in the
    // middle, and those addresses come back unread — which the report says
    // plainly, but "run it again" is a poor answer when asking again about the
    // few that failed costs seconds. Once, at the end, after a pause.
    const unread = holdings.filter(
      (h) =>
        (!options.activityOnly &&
          (h.stxTotal === null || h.stake === undefined)) ||
        h.activity?.confirmed === null ||
        h.activity?.pending === null,
    );
    if (unread.length) {
      console.error(
        `  ${unread.length} address(es) went unread; asking again in a moment ...`,
      );
      await sleep(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
      for (const stale of unread) {
        const fresh = await readHoldings(
          { address: stale.address, label: stale.label },
          options.activity,
          options.activityOnly,
        );
        Object.assign(stale, fresh);
      }
    }

    // Every asset anybody holds, so the roll-up can print amounts the way
    // their holders write them. One request per token contract, and the
    // answer for `--token` comes out of the same map rather than being asked
    // for twice.
    tokenMeta = await readAllTokenMeta([
      ...(options.activityOnly ? [] : assetTotals(holdings)),
      ...transferredAssets(holdings).filter(
        (moved) => !holdings.some((h) => moved.asset in h.fungible),
      ),
    ]);

    if (options.cache !== null) {
      /*
       * Before the report, so a capture survives a report that throws on
       * something further down — the asking is the part nobody wants to
       * repeat.
       *
       * And never at the report's expense. The path was checked before any
       * of this ran, so a failure here is something that changed underneath
       * — a disk filling, a directory going away — and losing the answers is
       * bad enough without also losing the thing they were asked for.
       */
      try {
        fs.writeFileSync(
          options.cache,
          `${JSON.stringify(toCache(holdings, cycle, tokenMeta, API_URL, undefined, safe), null, 2)}\n`,
        );
        if (!options.json) {
          console.log(
            `  Wrote what the API said to ${options.cache} — report off it` +
              ` again with --from-cache ${options.cache}`,
          );
        }
      } catch (err) {
        console.error(
          `  Could not write ${options.cache}: ${
            err instanceof Error ? err.message : String(err)
          }\n  The report still follows, but this run's answers were not` +
            ' kept — reporting again means asking again.',
        );
      }
    }
  }

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
    const nft = holdings.some((h) => h.nfts[resolved.asset] !== undefined);
    /*
     * A cached run asks nothing, including this.
     *
     * The capture carries metadata for every asset the list actually held, so
     * a `--token` naming one of those is already answered. The gap is a full
     * asset identifier nobody holds — "which of these is missing it" — and
     * there the fallback is the asset's own name and no decimals, exactly as
     * `readTokenMeta` gives for a token with no metadata published. Reaching
     * for the network here would make `--from-cache` sometimes online, which
     * is worse than a symbol read off the identifier.
     */
    meta =
      tokenMeta.get(resolved.asset) ??
      (captured
        ? {
            asset: resolved.asset,
            symbol: assetName(resolved.asset),
            decimals: 0,
            nft,
            known: nft,
          }
        : await readTokenMeta(resolved.asset, nft));
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
    activityDays: options.activityDays,
    activitySince: options.since,
  };

  // The window is measured from when the answers were read: a cached run
  // asks about the days before its capture, as every other figure in it does.
  const context: Context = {
    now: captured ? Date.parse(captured.at) / 1000 : Date.now() / 1000,
    listed: new Map(holdings.map((h) => [h.address, h.label])),
    tokenMeta,
    safe,
  };

  if (options.activityOnly) {
    const rows = holdings.map((h) => ({
      holdings: h,
      reasons: activityAttention(h, thresholds, context),
    }));
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            captured,
            window: {
              since: windowStart(thresholds, context.now),
              label: windowLabel(thresholds),
            },
            addresses: rows.map((row) => ({
              address: row.holdings.address,
              label: row.holdings.label,
              status: keyStatus(row.holdings.address, safe),
              activity: row.holdings.activity && {
                confirmed:
                  row.holdings.activity.confirmed?.map(txToCache) ?? null,
                pending: row.holdings.activity.pending?.map(txToCache) ?? null,
              },
              attention: row.reasons,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    printActivityOnly(rows, thresholds, captured);
    return;
  }

  const signers = (JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData)
    .signers;
  const poolOf = (signer: string) =>
    signers.find((s: Signer) => s.contractId === signer)?.displayName ?? null;

  const rows: Row[] = holdings
    .map((h) => ({
      holdings: h,
      reasons: attentionFor(h, thresholds, cycle, context),
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

  const report = toJson(
    rows,
    meta,
    cycle,
    tokenMeta,
    captured,
    context,
    {
      since: windowStart(thresholds, context.now),
      label: windowLabel(thresholds),
    },
  );
  if (options.html !== null) {
    try {
      fs.writeFileSync(options.html, renderHtml(report));
      if (!options.json) console.log(`  Wrote the page to ${options.html}`);
    } catch (err) {
      console.error(
        `  Could not write ${options.html}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(
    rows,
    meta,
    cycle,
    thresholds,
    tokenMeta,
    captured,
    safe,
    options.nfts,
  );
}

export type Report = ReturnType<typeof toJson>;

// Only when run, not when imported — see the note in signer-members.ts.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
