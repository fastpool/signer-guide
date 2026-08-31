/**
 * Builds the record of how every signer has answered the miners.
 *
 *   src/data/performance.json          the current cycle, every seated signer
 *   src/data/performance/<key>.json    one key, every cycle it was seated for
 *
 * The split is the same one the member history makes, for the same reason.
 * The summary is twenty-six rows and ships with the pool list, because "is
 * this signer doing the job" belongs on the page a reader is already looking
 * at. The history behind it is per key and costs a request only when somebody
 * opens one.
 *
 * Usage:
 *   npx tsx scripts/generate-signer-performance.ts            # what is due
 *   npx tsx scripts/generate-signer-performance.ts --all      # every cycle
 *   npx tsx scripts/generate-signer-performance.ts --from 130
 *
 * A first run with `--all` reads about sixty cycles, one request each. After
 * that a run reads two: the cycle being signed and the one that just closed.
 *
 * Allowed to fail. This is somebody else's observation of somebody else's
 * node, and a guide that cannot say how a signer behaved is worse than
 * yesterday's answer but far better than no pool list — so a failed read
 * leaves what is on file alone rather than writing an absence over it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  PerformanceData,
  SignerCyclePerformance,
  SignerPerformance,
} from '../src/lib/types.js';
import { fetchCurrentCycle } from './pox5.js';
import { describeNode, sleep, SPACING_MS } from './node.js';
import {
  cyclesToRead,
  fetchCyclePerformance,
  mergeCycles,
  METRICS_URL,
} from './signer-performance.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SUMMARY = path.join(DATA, 'performance.json');
const HISTORY = path.join(DATA, 'performance');

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv: string[]): { all: boolean; from?: number } {
  const all = argv.includes('--all');
  const at = argv.indexOf('--from');
  const from = at === -1 ? undefined : Number(argv[at + 1]);
  if (at !== -1 && !Number.isInteger(from)) {
    throw new Error('--from takes a cycle number');
  }
  return { all, from };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Reading signer conduct from ${METRICS_URL}`);
  console.log(`Cycle and chain from ${describeNode()}`);

  const current = await fetchCurrentCycle();
  if (current === null) {
    console.error('The node would not say what cycle it is. Nothing written.');
    process.exit(1);
  }

  const summary = readJson<PerformanceData>(SUMMARY);
  const onFile = summary?.cycles ?? [];
  const wanted = cyclesToRead(current, onFile, options);
  console.log(
    `Cycle ${current}; ${onFile.length} on file; reading ${wanted.length}:` +
      ` ${wanted[0]}…${wanted[wanted.length - 1]}`,
  );

  /** Everything read this run, by key then cycle. */
  const byKey = new Map<string, SignerCyclePerformance[]>();
  const covered = new Set<number>(onFile);
  let failed = 0;

  for (const cycle of wanted) {
    const rows = await fetchCyclePerformance(cycle, cycle < current);
    if (rows === null) {
      // Not an empty cycle — an unanswered question. Say so and keep what is
      // already on file for it.
      console.warn(`  cycle ${cycle}: no answer`);
      failed += 1;
      await sleep(SPACING_MS);
      continue;
    }
    if (rows.size === 0) {
      console.log(`  cycle ${cycle}: nothing recorded`);
      await sleep(SPACING_MS);
      continue;
    }

    covered.add(cycle);
    for (const [key, row] of rows) {
      const list = byKey.get(key) ?? [];
      list.push(row);
      byKey.set(key, list);
    }
    console.log(`  cycle ${cycle}: ${rows.size} signers`);
    await sleep(SPACING_MS);
  }

  if (byKey.size === 0) {
    console.error('Nothing was read. Leaving every file as it was.');
    process.exit(failed > 0 ? 1 : 0);
  }

  for (const [key, fresh] of byKey) {
    const file = path.join(HISTORY, `${key}.json`);
    const existing = readJson<SignerPerformance>(file);
    const merged: SignerPerformance = {
      signerKey: key,
      cycles: mergeCycles(existing?.cycles ?? [], fresh),
    };
    writeJson(file, merged);
  }

  /*
   * The summary carries the current cycle only. A key that was seated last
   * cycle and is not now has a history file and no row here, which is the
   * truth: it is not being asked to sign anything.
   */
  const signers: Record<string, SignerCyclePerformance> = {};
  for (const [key, rows] of byKey) {
    const row = rows.find((entry) => entry.cycle === current);
    if (row) signers[key] = row;
  }

  const written: PerformanceData = {
    generatedAt: new Date().toISOString(),
    cycle: current,
    cycles: [...covered].sort((a, b) => a - b),
    // Sorted, so a refresh that changed nothing writes a file that differs in
    // no line but the timestamp.
    signers: Object.fromEntries(
      Object.entries(signers).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  writeJson(SUMMARY, written);

  console.log(
    `Wrote ${Object.keys(signers).length} signers for cycle ${current},` +
      ` ${byKey.size} history files, ${written.cycles.length} cycles covered.`,
  );
  if (failed > 0) console.warn(`${failed} cycle(s) went unread.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
