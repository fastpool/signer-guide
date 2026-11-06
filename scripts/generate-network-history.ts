/**
 * Writes src/data/network-history.json — the whole network, one line per
 * pox-5 reward cycle.
 *
 * Everything in it is already on file, so this reads no chain and makes no
 * call: the signers' histories in src/data/signers/ for what each contract
 * held, stx-only-history.json for what each payout paid and the price it was
 * paid at, and signer-groups.json to count Stacking DAO's contracts as the one
 * pool a reader thinks of it as, and cache/pox5-events/rewards.json for how
 * each payout split between bonds, foundation and STX-only. The arithmetic is in
 * src/lib/network-history.ts, shared with the page and the phone app.
 *
 * The file is left alone when nothing but the time would change, so an hour
 * with nothing new in it is not a commit saying nothing.
 *
 * Usage:
 *   pnpm generate:network-history
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNetworkHistory,
  type GroupInput,
  type KeyHistoryInput,
} from '../src/lib/network-history.js';
import type { NetworkHistory, StxOnlyHistory } from '../src/lib/types.js';
import { readRewardSplits } from './pox5-events.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SIGNERS_DIR = path.join(DATA, 'signers');
const PAYOUTS = path.join(DATA, 'stx-only-history.json');
const GROUPS = path.join(DATA, 'signer-groups.json');
export const OUTPUT = path.join(DATA, 'network-history.json');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** One summary per signer key: `<key>.json`, not the per-cycle member lists. */
function readKeyHistories(): KeyHistoryInput[] {
  return fs
    .readdirSync(SIGNERS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson<KeyHistoryInput>(path.join(SIGNERS_DIR, name)))
    .filter((history) => Array.isArray(history.cycles));
}

function main(): void {
  const payouts = readJson<StxOnlyHistory>(PAYOUTS);
  const groups = Object.values(readJson<Record<string, GroupInput>>(GROUPS));
  const history = buildNetworkHistory({
    keyHistories: readKeyHistories(),
    distributions: payouts.distributions,
    groups,
    rewardSplits: readRewardSplits() ?? undefined,
    generatedAt: new Date().toISOString(),
  });

  let previous: NetworkHistory | null = null;
  try {
    previous = readJson<NetworkHistory>(OUTPUT);
  } catch {
    previous = null;
  }
  if (
    previous &&
    JSON.stringify(previous.cycles) === JSON.stringify(history.cycles)
  ) {
    console.log(`Network history unchanged: ${history.cycles.length} cycles.`);
    return;
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(history, null, 2)}\n`);
  console.log(
    `Wrote ${history.cycles.length} cycles to ${path.relative(process.cwd(), OUTPUT)}.`,
  );
}

main();
