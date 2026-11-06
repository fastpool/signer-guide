/**
 * A local copy of every pox-5 print that changes who is with which signer.
 *
 * pox-5 keeps one row per staker per cycle saying which signer they are with
 * and for how much, and the chain only answers about it one staker at a time.
 * Every write to that map comes with a print, though, and the prints say
 * exactly what was written (see scripts/pox5-membership.ts). So a copy of
 * those prints is a copy of the map. With it, a signer's members in any cycle
 * take no chain calls at all, which used to be up to 2,000 a run.
 *
 * The copy lives in two files:
 *
 *   cache/pox5-events/membership.jsonl   one print per line, oldest first,
 *                                        only ever appended to
 *   cache/pox5-events/state.json         where the next run reads on from
 *
 * The prints come from secondlayer's pox-5 index
 * (https://www.secondlayer.tools), which needs SECONDLAYER_API_KEY. Without it the
 * script says so and leaves the copy as committed.
 *
 * Only finalised prints are kept (`confirmed=true`). The few minutes the index
 * has not finalised yet are fetched separately by `fetchUnconfirmedTail` for
 * the run that needs them and never written down, so a reorg can never leave
 * a wrong line in the file.
 *
 * Nothing is written when a run finds no new membership prints. Most new pox-5
 * prints are reward claims, so the cursor moves nearly every hour, and writing
 * it alone would put a commit on the history every hour for nothing. The next
 * run reads on from the cursor on file instead, which costs a page or two.
 *
 * Alongside it, cache/pox5-events/rewards.json keeps every `calculate-rewards`
 * print: how each payout split between the bonds, the foundation's reserve
 * and STX-only stakers. pox-5 keeps no record of that split it can be asked
 * for afterwards, so the prints are the only source. A run with no file yet
 * reads them all from the start, which is one page.
 *
 * Usage:
 *   pnpm generate:events
 *   pnpm generate:events --from-start   rebuild the copy from pox-5's first block
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMBERSHIP_TOPICS } from './pox5-membership.js';
import { RETRY_DELAYS_MS, sleep } from './node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EVENTS_DIR = path.join(ROOT, 'cache/pox5-events');
const EVENTS_URL = 'https://api.secondlayer.tools/v1/index/pox5/events';
const PAGE_SIZE = 1000;

/** The key: the name secondlayer's own CLI reads, or the older SL_API_KEY. */
export function secondlayerKey(): string {
  return process.env.SECONDLAYER_API_KEY || process.env.SL_API_KEY || '';
}
/** Most pages the unconfirmed tail may cost a run before it gives up. */
const TAIL_MAX_PAGES = 10;

/** A row of secondlayer's pox-5 index, as far as this needs it. */
export interface Pox5Event {
  cursor: string;
  block_height: number;
  tx_id?: string;
  topic: string;
  data?: Record<string, unknown> | null;
}

/** One line of membership.jsonl. */
export interface LogEntry {
  cursor: string;
  block: number;
  tx: string | null;
  topic: string;
  /** The print's own fields, kebab-case as pox-5 prints them. */
  data: Record<string, unknown>;
}

export interface LogState {
  source: string;
  /** Where the next run starts reading. Null before the first run. */
  cursor: string | null;
  /** The height of the last finalised print read. */
  blockHeight: number | null;
  /** How many lines membership.jsonl holds. */
  entries: number;
}

export interface EventLog {
  state: LogState;
  entries: LogEntry[];
}

const MEMBERSHIP = new Set<string>(MEMBERSHIP_TOPICS);

export const REWARDS_FILE = path.join(EVENTS_DIR, 'rewards.json');
const REWARDS_TOPIC = 'calculate-rewards';

/** One payout's split, from its `calculate-rewards` print. Sats as strings. */
export interface RewardSplitEntry {
  cursor: string;
  block: number;
  /** The reward cycle the payout was for (`stx-cycle`). */
  cycle: number;
  calculationHeight: number;
  grossSats: string;
  bondSats: string;
  /** What went to the reserve: the foundation's 15% of what the bonds left. */
  reserveSats: string;
  stxStakerSats: string;
}

const digits = (value: unknown): string | null =>
  typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? String(value)
      : null;

/** The split a print records, or null for any other print. */
export function toRewardEntry(event: Pox5Event): RewardSplitEntry | null {
  if (event.topic !== REWARDS_TOPIC || !event.data) return null;
  const d = event.data;
  const cycle = digits(d['stx-cycle']);
  const height = digits(d['calculation-height']);
  const gross = digits(d['gross-accrued-rewards']);
  const bond = digits(d['total-bond-rewards']);
  const reserve = digits(d['reserve-deposit']);
  const stx = digits(d['total-stx-staker-rewards']);
  if (!cycle || !height || !gross || !bond || !reserve || !stx) return null;
  return {
    cursor: event.cursor,
    block: event.block_height,
    cycle: Number(cycle),
    calculationHeight: Number(height),
    grossSats: gross,
    bondSats: bond,
    reserveSats: reserve,
    stxStakerSats: stx,
  };
}

/** The splits on file, oldest first, or null when there is no file. */
export function readRewardSplits(
  file = REWARDS_FILE,
): RewardSplitEntry[] | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(value) ? (value as RewardSplitEntry[]) : null;
  } catch {
    return null;
  }
}

/** Adds what is new to the file; true when it changed. */
function keepRewardSplits(found: readonly RewardSplitEntry[]): boolean {
  const kept = readRewardSplits() ?? [];
  const known = new Set(kept.map((entry) => entry.cursor));
  const added: RewardSplitEntry[] = [];
  for (const entry of found) {
    if (known.has(entry.cursor)) continue;
    known.add(entry.cursor);
    added.push(entry);
  }
  if (added.length === 0 && fs.existsSync(REWARDS_FILE)) return false;
  const all = [...kept, ...added].sort(
    (a, b) => a.calculationHeight - b.calculationHeight,
  );
  fs.mkdirSync(EVENTS_DIR, { recursive: true });
  fs.writeFileSync(REWARDS_FILE, `${JSON.stringify(all, null, 2)}\n`);
  console.log(
    `${added.length} payout split(s) added, ${all.length} on file in` +
      ` ${path.relative(ROOT, REWARDS_FILE)}.`,
  );
  return true;
}

/*
 * The fields the membership rules read, plus the bond index for anyone
 * reading the file. Everything else in a print (a bond's BTC lockup, the
 * unlock burn height) is left out, which keeps a line to about 300 bytes.
 */
const KEPT_FIELDS = [
  'staker',
  'signer',
  'old-signer',
  'amount-ustx',
  'first-reward-cycle',
  'unlock-cycle',
  'num-cycles',
  'prev-unlock-height',
  'bond-index',
];

/** The line an index row becomes, or null for a print that moves nobody. */
export function toLogEntry(event: Pox5Event): LogEntry | null {
  if (!MEMBERSHIP.has(event.topic)) return null;
  const data: Record<string, unknown> = {};
  for (const key of KEPT_FIELDS) {
    const value = event.data?.[key];
    if (value !== undefined && value !== null) data[key] = value;
  }
  return {
    cursor: event.cursor,
    block: event.block_height,
    tx: event.tx_id ?? null,
    topic: event.topic,
    data,
  };
}

function emptyState(): LogState {
  return { source: EVENTS_URL, cursor: null, blockHeight: null, entries: 0 };
}

const loaded = new Map<string, EventLog | null>();

/** The copy on file, read once per run. Null when there is none yet. */
export function readEventLog(dir = EVENTS_DIR): EventLog | null {
  if (!loaded.has(dir)) loaded.set(dir, readFromDisk(dir));
  return loaded.get(dir) ?? null;
}

function readFromDisk(dir: string): EventLog | null {
  let state: LogState;
  try {
    state = JSON.parse(
      fs.readFileSync(path.join(dir, 'state.json'), 'utf8'),
    ) as LogState;
  } catch {
    return null;
  }
  if (!state.cursor) return null;
  const text = fs.readFileSync(path.join(dir, 'membership.jsonl'), 'utf8');
  const entries = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LogEntry);
  // A file cut short, or a state.json from another copy, would replay as a
  // map that is quietly missing rows. Better to have no copy at all.
  if (entries.length !== state.entries) {
    console.error(
      `  ! cache/pox5-events holds ${entries.length} line(s) but state.json` +
        ` says ${state.entries}; not using it`,
    );
    return null;
  }
  return { state, entries };
}

/**
 * Everyone the copy has seen stake with any of these contracts, including
 * anyone who left one for another signer. The walk asks the chain about them
 * when the copy alone cannot settle a cycle. Null when there is no copy.
 */
export function stakersFromEvents(
  contractIds: readonly string[],
  dir = EVENTS_DIR,
): Set<string> | null {
  const log = readEventLog(dir);
  if (!log) return null;
  const wanted = new Set(contractIds);
  const found = new Set<string>();
  for (const entry of log.entries) {
    const staker = entry.data.staker;
    if (typeof staker !== 'string') continue;
    if (
      wanted.has(entry.data.signer as string) ||
      wanted.has(entry.data['old-signer'] as string)
    ) {
      found.add(staker);
    }
  }
  return found;
}

interface EventsPage {
  events: Pox5Event[];
  next_cursor: string | null;
}

async function fetchPage(
  apiKey: string,
  cursor: string | null,
  confirmed: boolean,
  topic?: string,
): Promise<EventsPage> {
  const params = new URLSearchParams({
    confirmed: String(confirmed),
    limit: String(PAGE_SIZE),
  });
  if (cursor) params.set('cursor', cursor);
  else params.set('from_height', '0');
  if (topic) params.set('topic', topic);

  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${EVENTS_URL}?${params}`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      throw new Error(`secondlayer answered HTTP ${response.status}: ${body}`);
    }
    return (await response.json()) as EventsPage;
  }
}

/** Every page from `cursor` on, and where the last one left off. */
async function readOn(
  apiKey: string,
  cursor: string | null,
  confirmed: boolean,
  maxPages = Number.POSITIVE_INFINITY,
  topic?: string,
): Promise<{ events: Pox5Event[]; cursor: string | null; pages: number }> {
  const events: Pox5Event[] = [];
  let pages = 0;
  while (pages < maxPages) {
    const page = await fetchPage(apiKey, cursor, confirmed, topic);
    pages += 1;
    if (page.events.length === 0) break;
    events.push(...page.events);
    if (!page.next_cursor || page.next_cursor === cursor) break;
    cursor = page.next_cursor;
  }
  return { events, cursor, pages };
}

/**
 * The membership prints the index has not finalised yet, for this run only.
 *
 * Finalised prints run a few hundred blocks behind the tip. Without these, a
 * stake in that window would make the cycle being filled disagree with what
 * the chain says the signer holds, and every busy signer would fall back to
 * the walk most hours. Null without a key or when the index will not answer,
 * which costs that, and nothing worse.
 */
export async function fetchUnconfirmedTail(
  log: EventLog,
): Promise<LogEntry[] | null> {
  const apiKey = secondlayerKey();
  if (!apiKey || !log.state.cursor) return null;
  try {
    const { events } = await readOn(
      apiKey,
      log.state.cursor,
      false,
      TAIL_MAX_PAGES,
    );
    const known = new Set(log.entries.map((entry) => entry.cursor));
    return events
      .map(toLogEntry)
      .filter((e): e is LogEntry => e !== null && !known.has(e.cursor));
  } catch (err) {
    console.error(
      `  ! the unconfirmed pox-5 prints would not read: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

function writeLog(dir: string, log: EventLog, appended: LogEntry[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'membership.jsonl');
  const lines = appended.map((entry) => `${JSON.stringify(entry)}\n`).join('');
  if (log.state.entries === appended.length) fs.writeFileSync(file, lines);
  else fs.appendFileSync(file, lines);
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    `${JSON.stringify(log.state, null, 2)}\n`,
  );
}

async function main() {
  const apiKey = secondlayerKey();
  if (!apiKey) {
    console.log(
      'SECONDLAYER_API_KEY is not set, so the pox-5 event copy stays as it is.' +
        ' Member lists come from it as committed, or from the walk.',
    );
    return;
  }

  const fromStart = process.argv.includes('--from-start');
  const log: EventLog = (!fromStart && readFromDisk(EVENTS_DIR)) || {
    state: emptyState(),
    entries: [],
  };
  const startedAt = log.state.cursor;

  // Everything is gathered before anything is written: a run that dies on
  // page three must not leave a cursor pointing past pages it never kept.
  const { events, cursor, pages } = await readOn(apiKey, startedAt, true);

  const known = new Set(log.entries.map((entry) => entry.cursor));
  const appended = events
    .map(toLogEntry)
    .filter((e): e is LogEntry => e !== null && !known.has(e.cursor));

  // The payout splits ride on the same pages. With no file yet, the ones
  // before this run's cursor are read from the start, by topic.
  const splitEvents = fs.existsSync(REWARDS_FILE)
    ? events
    : [
        ...(
          await readOn(
            apiKey,
            null,
            true,
            Number.POSITIVE_INFINITY,
            REWARDS_TOPIC,
          )
        ).events,
        ...events,
      ];
  keepRewardSplits(
    splitEvents
      .map(toRewardEntry)
      .filter((e): e is RewardSplitEntry => e !== null),
  );

  if (appended.length === 0 && startedAt !== null) {
    console.log(
      `Read ${events.length.toLocaleString('en-GB')} pox-5 print(s) in` +
        ` ${pages} page(s): none moved anybody, so the copy and its cursor` +
        ' stay as they are.',
    );
    return;
  }

  log.entries.push(...appended);
  log.state = {
    source: EVENTS_URL,
    cursor,
    blockHeight: events.length
      ? Math.max(...events.map((e) => e.block_height))
      : log.state.blockHeight,
    entries: log.entries.length,
  };
  writeLog(EVENTS_DIR, log, fromStart ? log.entries : appended);
  console.log(
    `Read ${events.length.toLocaleString('en-GB')} pox-5 print(s) in ${pages}` +
      ` page(s): ${appended.length} membership print(s) added,` +
      ` ${log.entries.length} on file, finalised to block ${log.state.blockHeight}.`,
  );
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
