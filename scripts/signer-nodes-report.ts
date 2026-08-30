/**
 * What is knowable about the signer nodes themselves, rather than their pools.
 *
 *   pnpm nodes                     the table, for the current cycle
 *   pnpm nodes --cycle 142         a cycle of your choosing
 *   pnpm nodes --blocks 200        widen the participation window
 *   pnpm nodes --json --out n.json machine-readable, same content
 *
 * The guide knows what each pool holds. It has never known anything about the
 * node behind it — whether it is signing, what it runs, where it is. This
 * report is the survey of what can actually be answered, so that the page only
 * ever states the parts that can.
 *
 * ## What is available, and from where
 *
 * Weight, from the Stacks API's `/extended/v2/pox/cycles/N/signers`. A
 * signer's `weight` is the whole slots it holds, and it is the votes rather
 * than the STX that decide anything.
 *
 * It is not the same number as the guide's own arithmetic, and there are three
 * separate reasons for that. Worth setting out, because each one is a real
 * thing about the network rather than a rounding annoyance:
 *
 *   1. Quantisation. Weight is whole slots. The largest node's 19.6163% of the
 *      seated STX is 784.65 slots, which is held as 785, and reads back as
 *      19.6250%. A finer allocation would narrow this — over 2100 blocks of
 *      payouts rather than 2000, 823.89 slots held as 824 reads 19.6190% —
 *      but it cannot close it. This is why the denominator below is taken from
 *      the answer rather than written down here: the constant has changed once
 *      already, and the percentages do not depend on it anyway.
 *
 *   2. Two different populations. The guide divides by every uSTX pox-5 counts
 *      as stacked; the signer set divides by the uSTX that got a seat. They
 *      are not the same set — see the reconciliation this report prints at the
 *      end, which today is one pool with 50,020 STX stacked and no seat in the
 *      cycle. So the guide's percentages sit a little under the signer set's,
 *      systematically, and both are right about different questions.
 *
 *   3. Key rotation. A contract's `signerKey` is what it is registered with
 *      *now*; a cycle's signer set is what it was registered with when that
 *      cycle was locked in. An operator that has rotated appears here as a
 *      pool with no weight and a key with no pool. One has today.
 *
 * Signer protocol version, from slotwatch.dev's state machine updates. Each
 * signer broadcasts the protocol version it supports and the one currently
 * active, so a node running behind is visible as a local version lower than
 * the active one. This is *not* the binary version: `stacks-signer 4.0.1` is
 * something only the operator of a node can read from it, and no signer
 * publishes it. What it does answer is the question worth asking — is this
 * node up to date with what the network is running.
 *
 * Behaviour, also from slotwatch: over the last N blocks, how many a signer
 * signed, missed, accepted, rejected, and how often it sent a pre-commit.
 * This is the "signing behaviour" half of issue #6.
 *
 * ## What is not available: region
 *
 * Nothing says where a signer node is, and this is not an oversight to route
 * around. Signers do not talk to each other over the network by identity: they
 * post to StackerDB, which is on chain, so there is no address to look up. The
 * P2P layer's `/v2/neighbors` lists peers by IP, but nothing ties a peer to a
 * signer key — a large operator's node is indistinguishable from anybody
 * else's, and matching them by guesswork would attach a country to somebody's
 * name on no evidence at all. slotwatch does not have it either; its whole
 * catalogue was checked. So this report says "not known", and that is the
 * honest end of it until a signer chooses to publish where it runs.
 *
 * Node binary version is the same story with a smaller gap: `/v2/info` gives
 * `server_version` for the node you ask, which is your own or a public API's,
 * never one of the signers.
 *
 * ## On depending on slotwatch
 *
 * It is somebody else's service with no published contract, so every field
 * from it is optional here and a failure costs those columns rather than the
 * run. The weights come from the chain and stand on their own.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import signerData from '../src/data/signers.json' with { type: 'json' };
import totalsData from '../src/data/totals.json' with { type: 'json' };
import { allGroups, groupContracts } from '../src/lib/signer-groups.js';
import { nodesBySignerKey } from '../src/lib/signer-nodes.js';
import type { LockedTotals, SignerData } from '../src/lib/types.js';
import { API_URL, describeNode, nodeHeaders } from './node.js';
import { fetchCurrentCycle } from './pox5.js';

const SLOTWATCH_MCP = 'https://api.slotwatch.dev/mcp';

export interface Options {
  cycle: number | null;
  blocks: number;
  json: boolean;
  out: string | null;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { cycle: null, blocks: 50, json: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--cycle') options.cycle = Number(argv[(i += 1)]);
    else if (arg === '--blocks') options.blocks = Number(argv[(i += 1)]);
    else if (arg === '--out') options.out = argv[(i += 1)] ?? null;
  }
  return options;
}

/**
 * A signer key as one string, whatever shape it arrived in.
 *
 * The three sources disagree: signers.json writes `0x02fc…`, the Stacks API
 * writes `0x02fc…`, slotwatch writes `02fc…`. Joining on the raw strings
 * silently matches nothing, and a report with every column empty looks exactly
 * like a network with nothing in it.
 */
export function normaliseKey(key: string | null | undefined): string | null {
  if (typeof key !== 'string') return null;
  const bare = key.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{66}$/.test(bare) ? bare : null;
}

/** What the chain says a signer weighs in a cycle. */
export interface SignerWeight {
  signerKey: string;
  signerAddress: string;
  /** Whole slots. How many there are in total is read, never assumed. */
  weight: number;
  weightPercent: number;
  stackedUstx: bigint;
}

/** What a signer is running, as far as it says so itself. */
export interface SignerVersion {
  /** The protocol version this signer supports. */
  local: number;
  /** The one the network is on. Lower local means the node is behind. */
  active: number;
  observedAt: string | null;
}

/** How a signer has behaved over a window of recent blocks. */
export interface SignerBehaviour {
  name: string | null;
  participationRate: number;
  degradationRate: number;
  signedCount: number;
  missedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  preCommitRate: number;
}

export interface NodeRow {
  signerKey: string;
  /** What the guide calls the pools on this key. */
  pools: string[];
  /** Groups any of those pools belong to — see src/data/signer-groups.json. */
  groups: string[];
  /** What the guide's own committed amounts say this node holds. */
  ourUstx: bigint | null;
  weight: SignerWeight | null;
  version: SignerVersion | null;
  behaviour: SignerBehaviour | null;
  /**
   * Always null. Kept as a field so the shape says what was looked for and
   * not found — see the note at the top.
   */
  region: null;
}

/**
 * One JSON-RPC call to an MCP server over HTTP, as a parsed result.
 *
 * Streamable HTTP answers with server-sent events, so the body is a run of
 * `data:` lines rather than one JSON document. Null on anything unexpected:
 * every caller treats a missing answer as a column it cannot fill.
 */
export function parseSseJson(body: string): unknown {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload.startsWith('{')) continue;
    try {
      const message = JSON.parse(payload) as { result?: unknown };
      if (message.result !== undefined) return message.result;
    } catch {
      // A partial frame is not an answer; keep looking.
    }
  }
  return null;
}

/** The text an MCP tool answered with, parsed as JSON. */
export function toolPayload(result: unknown): unknown {
  const content = (result as { content?: { text?: string }[] } | null)?.content;
  if (!Array.isArray(content)) return null;
  const text = content.map((part) => part.text ?? '').join('');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function callSlotwatch(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const post = (body: unknown) =>
    fetch(SLOTWATCH_MCP, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    });

  try {
    await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'signer-guide', version: '1' },
      },
    });

    const response = await post({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    });
    if (!response.ok) return null;

    return toolPayload(parseSseJson(await response.text()));
  } catch {
    // Somebody else's service. Losing it costs two columns, not the run.
    return null;
  }
}

/** Every signer's weight for a cycle, from the extended API. */
export async function fetchWeights(
  cycle: number,
): Promise<Map<string, SignerWeight>> {
  const found = new Map<string, SignerWeight>();
  try {
    const response = await fetch(
      `${API_URL}/extended/v2/pox/cycles/${cycle}/signers?limit=200`,
      { headers: nodeHeaders() },
    );
    if (!response.ok) return found;

    const body = (await response.json()) as {
      results?: {
        signing_key?: string;
        signer_address?: string;
        weight?: number;
        weight_percent?: number;
        stacked_amount?: string;
      }[];
    };

    for (const row of body.results ?? []) {
      const key = normaliseKey(row.signing_key);
      if (key === null) continue;
      found.set(key, {
        signerKey: key,
        signerAddress: row.signer_address ?? '',
        weight: Number(row.weight ?? 0),
        weightPercent: Number(row.weight_percent ?? 0),
        stackedUstx: BigInt(row.stacked_amount ?? '0'),
      });
    }
  } catch {
    // A node without the extended API answers nothing, which is a column of
    // "not known" rather than a failed run.
  }
  return found;
}

/** What each signer says it is running. */
export async function fetchVersions(
  limit: number,
): Promise<Map<string, SignerVersion>> {
  const found = new Map<string, SignerVersion>();
  const payload = (await callSlotwatch('getLatestStateMachines', { limit })) as {
    stateMachines?: {
      signerPublicKey?: string;
      activeSignerProtocolVersion?: number;
      localSignerProtocolVersion?: number;
      observedAt?: string;
    }[];
  } | null;

  for (const row of payload?.stateMachines ?? []) {
    const key = normaliseKey(row.signerPublicKey);
    if (key === null) continue;
    if (
      typeof row.localSignerProtocolVersion !== 'number' ||
      typeof row.activeSignerProtocolVersion !== 'number'
    ) {
      continue;
    }
    found.set(key, {
      local: row.localSignerProtocolVersion,
      active: row.activeSignerProtocolVersion,
      observedAt: row.observedAt ?? null,
    });
  }
  return found;
}

/** How each signer has behaved over the last `blocks` blocks. */
export async function fetchBehaviour(
  blocks: number,
): Promise<Map<string, SignerBehaviour>> {
  const found = new Map<string, SignerBehaviour>();
  const payload = (await callSlotwatch('getSignerHealth', {
    limit: blocks,
    top: 100,
  })) as {
    signers?: {
      signerPublicKey?: string;
      name?: string | null;
      participationRate?: number;
      degradationRate?: number;
      signedCount?: number;
      missedCount?: number;
      acceptedCount?: number;
      rejectedCount?: number;
      preCommitRate?: number;
    }[];
  } | null;

  for (const row of payload?.signers ?? []) {
    const key = normaliseKey(row.signerPublicKey);
    if (key === null) continue;
    found.set(key, {
      name: row.name ?? null,
      participationRate: Number(row.participationRate ?? 0),
      degradationRate: Number(row.degradationRate ?? 0),
      signedCount: Number(row.signedCount ?? 0),
      missedCount: Number(row.missedCount ?? 0),
      acceptedCount: Number(row.acceptedCount ?? 0),
      rejectedCount: Number(row.rejectedCount ?? 0),
      preCommitRate: Number(row.preCommitRate ?? 0),
    });
  }
  return found;
}

/**
 * Where the guide's arithmetic and the signer set disagree, and about whom.
 *
 * Three numbers and two lists. The guide's total is every uSTX pox-5 counts as
 * stacked; the seated total is what the signer set was built from; the pools
 * in the gap are stacked with no seat in this cycle. Rotated keys net to zero
 * in the totals and are still worth naming, because a pool with no weight
 * beside a weight with no pool is one operator, not two problems.
 */
export interface Reconciliation {
  ourUstx: bigint;
  seatedUstx: bigint;
  totalSlots: number;
  /** Pools holding STX whose key has no seat in this cycle's signer set. */
  stackedWithoutSeat: { name: string; ustx: bigint }[];
  /** Seats the guide cannot put a name to. */
  seatsWithoutPool: { signerKey: string; ustx: bigint }[];
}

export function reconcile(
  rows: NodeRow[],
  ourUstx: bigint,
  weights: Map<string, SignerWeight>,
): Reconciliation {
  let seatedUstx = 0n;
  let totalSlots = 0;
  for (const weight of weights.values()) {
    seatedUstx += weight.stackedUstx;
    totalSlots += weight.weight;
  }

  return {
    ourUstx,
    seatedUstx,
    totalSlots,
    stackedWithoutSeat: rows
      .filter(
        (row) =>
          row.weight === null &&
          row.pools.length > 0 &&
          (row.ourUstx ?? 0n) > 0n,
      )
      .map((row) => ({ name: row.pools.join(', '), ustx: row.ourUstx ?? 0n })),
    seatsWithoutPool: rows
      .filter((row) => row.pools.length === 0 && row.weight !== null)
      .map((row) => ({
        signerKey: row.signerKey,
        ustx: row.weight?.stackedUstx ?? 0n,
      })),
  };
}

/**
 * The guide's own nodes, joined to everything else that was readable.
 *
 * Built from the committed signers rather than from the API's signer list, so
 * a node the guide does not know about is visible as a row with no pools
 * rather than absent — a signer holding weight that this guide cannot name is
 * exactly the thing worth noticing.
 */
export function buildRows(
  signers: SignerData['signers'],
  ustx: Record<string, string | null>,
  weights: Map<string, SignerWeight>,
  versions: Map<string, SignerVersion>,
  behaviour: Map<string, SignerBehaviour>,
): NodeRow[] {
  const groupsByContract = new Map<string, string[]>();
  for (const group of allGroups()) {
    for (const contract of groupContracts(group, signers)) {
      const list = groupsByContract.get(contract.contractId) ?? [];
      list.push(group.name);
      groupsByContract.set(contract.contractId, list);
    }
  }

  const rows: NodeRow[] = [];
  const seen = new Set<string>();

  for (const node of nodesBySignerKey(signers)) {
    const key = normaliseKey(node.signerKey);
    if (key === null) continue;
    seen.add(key);
    const groups = new Set<string>();
    for (const contract of node.contracts) {
      for (const name of groupsByContract.get(contract.contractId) ?? []) {
        groups.add(name);
      }
    }
    let held: bigint | null = null;
    for (const contract of node.contracts) {
      const amount = ustx[contract.contractId];
      if (amount === null || amount === undefined) continue;
      held = (held ?? 0n) + BigInt(amount);
    }

    rows.push({
      signerKey: key,
      pools: node.contracts.map((contract) => contract.displayName),
      groups: [...groups],
      ourUstx: held,
      weight: weights.get(key) ?? null,
      version: versions.get(key) ?? null,
      behaviour: behaviour.get(key) ?? null,
      region: null,
    });
  }

  // Signers the chain counts and the guide has never seen. Worth a line each:
  // this is weight nobody here can put a name to.
  for (const [key, weight] of weights) {
    if (seen.has(key)) continue;
    rows.push({
      signerKey: key,
      pools: [],
      groups: [],
      ourUstx: null,
      weight,
      version: versions.get(key) ?? null,
      behaviour: behaviour.get(key) ?? null,
      region: null,
    });
  }

  return rows.sort(
    (a, b) => (b.weight?.weight ?? -1) - (a.weight?.weight ?? -1),
  );
}

const pct = (value: number | null | undefined) =>
  typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : '—';

/**
 * One row, as a line. Kept apart from the fetching so it can be tested.
 *
 * `totalSlots` is the sum of the weights the chain reported, not a constant:
 * how many slots a cycle shares out is the sort of thing that changes with a
 * PoX version, and a number written down here would be quietly wrong the day
 * it did. Zero means nothing was read, and the column says so.
 */
export function formatRow(row: NodeRow, totalSlots: number): string {
  const name =
    row.pools[0] ?? row.behaviour?.name ?? `(${row.signerKey.slice(0, 8)}…)`;
  const groups = row.groups.length ? ` [${row.groups.join(', ')}]` : '';
  const weight = row.weight
    ? `${row.weight.weightPercent.toFixed(3).padStart(7)}%  ${String(
        row.weight.weight,
      ).padStart(4)}/${totalSlots || '?'}`
    : '      —            ';
  const version = row.version
    ? row.version.local < row.version.active
      ? `v${row.version.local} (behind v${row.version.active})`
      : `v${row.version.local}`
    : 'version not known';
  const behaviour = row.behaviour
    ? `signed ${pct(row.behaviour.participationRate)}, missed ${row.behaviour.missedCount}`
    : 'behaviour not known';

  return `${weight}  ${version.padEnd(22)} ${behaviour.padEnd(26)} ${name}${groups}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const signers = (signerData as SignerData).signers;

  const cycle = options.cycle ?? (await fetchCurrentCycle());
  if (cycle === null) {
    console.error(`${describeNode()} would not say what cycle it is in.`);
    process.exit(1);
  }

  console.log(`Reading signer nodes for cycle ${cycle} from ${describeNode()}`);
  console.log(`and behaviour over the last ${options.blocks} blocks from slotwatch.dev …\n`);

  const [weights, versions, behaviour] = await Promise.all([
    fetchWeights(cycle),
    fetchVersions(200),
    fetchBehaviour(options.blocks),
  ]);

  const totals = totalsData as LockedTotals;
  const ustx = totals.cycle === cycle ? totals.ustx : {};
  const rows = buildRows(signers, ustx, weights, versions, behaviour);
  const ourUstx = Object.values(ustx).reduce<bigint>(
    (sum, amount) => (amount === null ? sum : sum + BigInt(amount)),
    0n,
  );
  const books = reconcile(rows, ourUstx, weights);

  if (options.json) {
    const out = JSON.stringify(
      {
        cycle,
        blocks: options.blocks,
        generatedAt: new Date().toISOString(),
        regionAvailable: false,
        nodes: rows.map((row) => ({
          ...row,
          weight: row.weight
            ? { ...row.weight, stackedUstx: row.weight.stackedUstx.toString() }
            : null,
        })),
      },
      null,
      2,
    );
    if (options.out) {
      mkdirSync(dirname(options.out), { recursive: true });
      writeFileSync(options.out, `${out}\n`);
      console.log(`Written to ${options.out}`);
    } else {
      console.log(out);
    }
    return;
  }

  console.log(
    ' weight   slots      protocol version       behaviour                  node',
  );
  console.log('-'.repeat(100));
  for (const row of rows) console.log(formatRow(row, books.totalSlots));

  const unnamed = rows.filter((row) => row.pools.length === 0).length;
  const behind = rows.filter(
    (row) => row.version && row.version.local < row.version.active,
  ).length;
  const quiet = rows.filter(
    (row) => row.behaviour && row.behaviour.participationRate === 0,
  ).length;

  console.log(`\n${rows.length} nodes, ${books.totalSlots} slots between them.`);
  if (unnamed) console.log(`${unnamed} of them hold weight this guide cannot name.`);
  console.log(`${behind} are behind the active signer protocol version.`);
  console.log(`${quiet} signed nothing in the window.`);

  /*
   * The two totals, and who is between them. Printed every run rather than
   * worked out by hand the next time somebody wonders why the guide's
   * percentage and the signer set's disagree.
   */
  if (books.ourUstx > 0n && books.seatedUstx > 0n) {
    const stx = (value: bigint) =>
      `${(Number(value / 1_000_000n) / 1_000_000).toFixed(6)}M STX`;
    console.log(`\nStacked, by pox-5's count:  ${stx(books.ourUstx)}`);
    console.log(`Seated in the signer set:   ${stx(books.seatedUstx)}`);
    console.log(
      `Difference:                 ${stx(books.ourUstx - books.seatedUstx)}` +
        ' — the guide divides by the first, the signer set by the second.',
    );
    for (const pool of books.stackedWithoutSeat) {
      console.log(`  stacked, no seat this cycle:  ${pool.name} (${stx(pool.ustx)})`);
    }
    for (const seat of books.seatsWithoutPool) {
      console.log(
        `  seat, no pool on that key:    ${seat.signerKey.slice(0, 12)}… (${stx(seat.ustx)})` +
          ' — usually a key rotated since the cycle was locked in',
      );
    }
  }
  console.log(
    '\nWhere a node runs is not knowable: signers post to StackerDB rather than\n' +
      'talking to each other by address, so nothing ties a key to a host. See the\n' +
      'note at the top of this script before adding a region column to anything.',
  );
}

if (process.argv[1]?.endsWith('signer-nodes-report.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
