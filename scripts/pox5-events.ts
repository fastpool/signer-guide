/**
 * Who has ever staked with each signer contract, from secondlayer's pox-5
 * event index.
 *
 * This exists because of one gap in `scripts/members.ts`. A member walk asks
 * the chain about each staker, but something has to say which stakers to ask
 * about, and that was Hiro's `/staking/signers/{contract}/stakers`. That index
 * is present tense. Once somebody moves on, they drop off the old signer's
 * list, so a past cycle walked from it is short by everyone who has left since.
 * fastpool-max500's cycle 145 was 342k STX short that way, with six members
 * missing.
 *
 * Events don't forget. Every `stake`, `stake-update` and `unstake` names a
 * staker and a signer, and a `stake-update` that moves somebody names the old
 * signer as well. The union of those is everyone who could have been a member
 * in any cycle, which is the list a walk needs. It is still only a list of
 * whom to ask. The chain says what each of them held, so an extra name costs a
 * call, and a reorged-away event costs nothing worse than that.
 *
 * The file grows and is never rewritten from scratch. Each run reads from the
 * saved cursor, so it is a page or two an hour against a free tier of a million
 * rows a month. Re-reading from the start every hour would be 20k rows a run,
 * which is over that. It is only written when somebody new turns up. See the
 * end of main.
 *
 * Writes src/data/pox5-stakers.json:
 *
 *   { source, cursor, blockHeight, events, stakers: { [contract]: [staker…] } }
 *
 * Reads SL_API_KEY. Without it the script says so and exits cleanly. The walks
 * then fall back to Hiro's index alone, as before.
 *
 * Usage:
 *   pnpm generate:events
 *   pnpm generate:events --from-start   ignore the saved cursor and re-read all
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETRY_DELAYS_MS, sleep } from './node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STAKERS_FILE = path.join(ROOT, 'src/data/pox5-stakers.json');
const EVENTS_URL = 'https://api.secondlayer.tools/v1/index/pox5/events';
const PAGE_SIZE = 1000;

export interface Pox5Event {
  cursor: string;
  block_height: number;
  topic: string;
  staker: string | null;
  signer: string | null;
  data?: Record<string, unknown> | null;
}

export interface StakerIndexFile {
  source: string;
  /** Where the next run starts reading. Null before the first run. */
  cursor: string | null;
  /** The height of the last event read. */
  blockHeight: number | null;
  /** How many events have been folded in, all told. */
  events: number;
  /** Signer contract → everyone who has ever staked with it, sorted. */
  stakers: Record<string, string[]>;
}

export function emptyIndex(): StakerIndexFile {
  return {
    source: EVENTS_URL,
    cursor: null,
    blockHeight: null,
    events: 0,
    stakers: {},
  };
}

/**
 * The signer contracts an event ties its staker to.
 *
 * Any event with a staker counts, not only the three that move stake: a
 * reward claim or an sBTC unstake by somebody we had no other event for is
 * just as much evidence that they were there. `old-signer` matters, because a
 * `stake-update` that moves somebody reports the signer they left only there.
 */
export function signersOf(event: Pox5Event): string[] {
  if (!event.staker) return [];
  const found = new Set<string>();
  if (event.signer) found.add(event.signer);
  const old = event.data?.['old-signer'];
  if (typeof old === 'string' && old) found.add(old);
  return [...found];
}

/** Fold a page of events into the index. Returns how many names were new. */
export function addEvents(
  index: StakerIndexFile,
  events: readonly Pox5Event[],
): number {
  const sets = new Map<string, Set<string>>(
    Object.entries(index.stakers).map(([k, v]) => [k, new Set(v)]),
  );
  let added = 0;
  for (const event of events) {
    for (const signer of signersOf(event)) {
      let set = sets.get(signer);
      if (!set) sets.set(signer, (set = new Set()));
      if (!set.has(event.staker as string)) {
        set.add(event.staker as string);
        added += 1;
      }
    }
    index.blockHeight = Math.max(index.blockHeight ?? 0, event.block_height);
  }
  index.events += events.length;
  index.stakers = Object.fromEntries(
    [...sets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, [...v].sort()]),
  );
  return added;
}

const loaded = new Map<string, StakerIndexFile | null>();

/** The index on file, read once per run. Null when there is none yet. */
export function loadStakerIndex(file = STAKERS_FILE): StakerIndexFile | null {
  if (!loaded.has(file)) {
    let index: StakerIndexFile | null = null;
    try {
      index = JSON.parse(fs.readFileSync(file, 'utf8')) as StakerIndexFile;
    } catch {
      index = null;
    }
    loaded.set(file, index?.cursor ? index : null);
  }
  return loaded.get(file) ?? null;
}

/** Everyone the index has for any of these contracts. Null without a file. */
export function stakersFromEvents(
  contractIds: readonly string[],
  file = STAKERS_FILE,
): Set<string> | null {
  const index = loadStakerIndex(file);
  if (!index) return null;
  const found = new Set<string>();
  for (const contractId of contractIds) {
    for (const staker of index.stakers[contractId] ?? []) found.add(staker);
  }
  return found;
}

interface EventsPage {
  events: Pox5Event[];
  next_cursor: string | null;
  reorgs?: unknown[];
}

async function fetchPage(
  apiKey: string,
  cursor: string | null,
): Promise<EventsPage> {
  const params = new URLSearchParams({
    confirmed: 'true',
    limit: String(PAGE_SIZE),
  });
  if (cursor) params.set('cursor', cursor);
  else params.set('from_height', '0');

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

async function main() {
  const apiKey = process.env.SL_API_KEY ?? '';
  if (!apiKey) {
    console.log(
      'SL_API_KEY is not set, so the staker index stays as it is. Member' +
        ' walks fall back to Hiro’s index alone.',
    );
    return;
  }

  const fromStart = process.argv.includes('--from-start');
  let index = emptyIndex();
  if (!fromStart && fs.existsSync(STAKERS_FILE)) {
    index = JSON.parse(
      fs.readFileSync(STAKERS_FILE, 'utf8'),
    ) as StakerIndexFile;
  }

  const startedAt = index.cursor;
  let pages = 0;
  let read = 0;
  let added = 0;
  let reorgs = 0;

  // Everything is gathered before anything is written: a run that dies on
  // page three must not leave a cursor pointing past pages it never folded in.
  for (;;) {
    const page = await fetchPage(apiKey, index.cursor);
    pages += 1;
    reorgs += page.reorgs?.length ?? 0;
    if (page.events.length === 0) break;
    added += addEvents(index, page.events);
    read += page.events.length;
    if (!page.next_cursor || page.next_cursor === index.cursor) break;
    index.cursor = page.next_cursor;
  }

  if (reorgs) {
    // Harmless here: a name from an event that was reorged away costs one
    // chain call that says they are not a member. Worth a line all the same.
    console.log(`  secondlayer reported ${reorgs} reorg(s) since the cursor`);
  }

  if (index.cursor === startedAt) {
    console.log(`No new pox-5 events since ${startedAt ?? 'the start'}.`);
    return;
  }

  /*
   * New events but no new names: leave the file alone.
   *
   * Nearly every event is a reward claim by somebody already on file, so the
   * cursor moves almost every hour. Writing it each time would put a commit on
   * the history every hour for a cursor alone, which is what the refresh
   * workflow exists to avoid. Instead the next run re-reads from the cursor
   * on file. That is a few hundred rows, and the cursor catches up whenever a
   * new staker turns up, which is most days.
   */
  if (added === 0 && startedAt !== null) {
    console.log(
      `Read ${read.toLocaleString('en-GB')} pox-5 event(s): nobody new, so` +
        ' the file and its cursor stay as they are.',
    );
    return;
  }

  fs.writeFileSync(STAKERS_FILE, `${JSON.stringify(index, null, 2)}\n`);
  const contracts = Object.keys(index.stakers).length;
  console.log(
    `Read ${read.toLocaleString('en-GB')} pox-5 event(s) in ${pages}` +
      ` page(s): ${added} new staker/signer pair(s), ${contracts} signer` +
      ` contract(s) on file, up to block ${index.blockHeight}.`,
  );
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
