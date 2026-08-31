/**
 * Asking Hiro's signer-metrics API how each signer answered the miners.
 *
 * The guide has always been able to say how much a signer weighs and never
 * whether it does the job. pox-5 decides weight by the STX behind a key and
 * has no opinion about conduct, so a reader comparing two signers could see
 * that one carried a fifth of the network and not that it had missed a
 * quarter of the blocks it was asked about.
 *
 * This is the other half, and it is cheap: one request per cycle, back to the
 * first Nakamoto cycle. Everything in it is somebody else's observation —
 * Hiro's node saw a proposal go out and an answer come back — which is worth
 * saying out loud, because unlike the fee or the amount staked it is not
 * something this guide could derive from the chain itself.
 *
 *   SIGNER_METRICS_URL   the API to read (default https://api.hiro.so)
 *   HIRO_API_KEY         sent as `x-api-key` when set, as elsewhere
 *
 * Kept apart from `pox5.ts` on purpose: that one asks a Stacks node, and any
 * node will do. This asks an indexer, and only Hiro publishes it — a local
 * node has no answer to give, so a run against one leaves these files alone
 * rather than emptying them.
 */

import type { SignerCyclePerformance } from '../src/lib/types.js';
import { nodeHeaders, RETRY_DELAYS_MS, sleep } from './node.js';

export const METRICS_URL = (
  process.env.SIGNER_METRICS_URL ?? 'https://api.hiro.so'
).replace(/\/+$/, '');

/** The first cycle Nakamoto had signers for. Below it there is nothing. */
export const FIRST_SIGNER_CYCLE = 84;

/** How the API spells a row. Only the fields worth keeping are named. */
interface MetricsRow {
  signer_key?: string;
  weight?: number;
  weight_percentage?: number;
  proposals_accepted_count?: number;
  proposals_rejected_count?: number;
  proposals_missed_count?: number;
  average_response_time_ms?: number;
  last_seen?: string | null;
}

/**
 * Bare hex, no `0x`.
 *
 * Three sources spell a signer key three ways — the extended API with the
 * prefix, StackerDB without it, the file names not at all — so everything
 * here is reduced to the one spelling before it is used as a key.
 */
export function bareKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const bare = value.toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{66}$/.test(bare) ? bare : null;
}

/**
 * One row, as the guide keeps it.
 *
 * The only judgement here is the response time, and it is the one that
 * matters: the API answers 0 for a signer that answered nothing, which sorts
 * as the fastest node in the set. A signer that was never there is not fast,
 * so a mean with nothing behind it is stored as no mean at all.
 */
export function toRow(
  row: MetricsRow,
  cycle: number,
  final: boolean,
): SignerCyclePerformance | null {
  const key = bareKey(row.signer_key);
  if (key === null) return null;

  const accepted = Number(row.proposals_accepted_count ?? 0);
  const rejected = Number(row.proposals_rejected_count ?? 0);
  const answered = accepted + rejected;
  const mean = Number(row.average_response_time_ms ?? 0);

  return {
    cycle,
    accepted,
    rejected,
    missed: Number(row.proposals_missed_count ?? 0),
    responseMs: answered > 0 && mean > 0 ? Math.round(mean) : null,
    lastSeen: typeof row.last_seen === 'string' ? row.last_seen : null,
    weight: Number(row.weight ?? 0),
    weightPercent: Number(row.weight_percentage ?? 0),
    final,
  };
}

/**
 * Every signer's record for one cycle, by bare key.
 *
 * Null is "the API would not answer", never an empty cycle: a rate limit that
 * read as "nobody signed anything" would put a zero against every signer in
 * the set and call it a fact. A cycle the API knows nothing about answers with
 * an empty list, which is a different thing and comes back as an empty map.
 */
export async function fetchCyclePerformance(
  cycle: number,
  final: boolean,
): Promise<Map<string, SignerCyclePerformance> | null> {
  const found = new Map<string, SignerCyclePerformance>();
  const url =
    `${METRICS_URL}/signer-metrics/v1/cycles/${cycle}/signers` + '?limit=200';

  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { headers: nodeHeaders() });
    } catch {
      return null;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!response.ok) return null;

    let body: { results?: MetricsRow[] };
    try {
      body = (await response.json()) as { results?: MetricsRow[] };
    } catch {
      return null;
    }
    if (!Array.isArray(body.results)) return null;

    for (const raw of body.results) {
      const row = toRow(raw, cycle, final);
      if (row !== null) found.set(bareKey(raw.signer_key)!, row);
    }
    return found;
  }
}

/**
 * Which cycles a run has to ask about.
 *
 * The same reasoning as the member history: a cycle that is over cannot move,
 * so it is read once and never again. What is left each hour is the cycle
 * being signed now, plus anything the file is missing — which on the first run
 * is every cycle there has ever been, and after that is nothing.
 *
 * The cycle before the current one is re-read once: it was written while it
 * was still running, so the row on file is a fortnight's work cut short at
 * whatever hour the refresh last ran.
 */
export function cyclesToRead(
  current: number,
  onFile: readonly number[],
  options: { all?: boolean; from?: number } = {},
): number[] {
  const first = options.from ?? FIRST_SIGNER_CYCLE;
  if (options.all) {
    return range(first, current);
  }

  const have = new Set(onFile);
  const wanted = new Set<number>([current]);
  // The one that has just closed, whose row was written mid-flight.
  if (current - 1 >= first) wanted.add(current - 1);
  for (const cycle of range(first, current)) {
    if (!have.has(cycle)) wanted.add(cycle);
  }
  return [...wanted].sort((a, b) => a - b);
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let cycle = from; cycle <= to; cycle += 1) out.push(cycle);
  return out;
}

/** Newest first, one row per cycle, later readings replacing earlier ones. */
export function mergeCycles(
  existing: readonly SignerCyclePerformance[],
  fresh: readonly SignerCyclePerformance[],
): SignerCyclePerformance[] {
  const byCycle = new Map<number, SignerCyclePerformance>();
  for (const row of existing) byCycle.set(row.cycle, row);
  // Fresh readings win, but a cycle already settled is never re-read, so this
  // only ever overwrites the two the run actually asked about.
  for (const row of fresh) byCycle.set(row.cycle, row);
  return [...byCycle.values()].sort((a, b) => b.cycle - a.cycle);
}
