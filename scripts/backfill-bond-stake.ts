/**
 * Fills in the bond split (`bond`) on the committed totals.json and every
 * signer history, from the copy of pox-5's prints alone — no chain calls.
 *
 * The hourly refresh does this itself (generate-totals.ts for the amounts,
 * generate-signer-history.ts for the histories). This is for a checkout that
 * wants the split now, without a node: the replay is checked against the
 * amounts already on file, exactly as the refresh checks it.
 *
 * Usage: pnpm exec tsx scripts/backfill-bond-stake.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  LockedTotals,
  SignerCycleMembers,
  SignerHistory,
} from '../src/lib/types.js';
import { contractBondSplit, replay, withBondStake } from './bond-stake.js';
import { readEventLog } from './pox5-events.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);

const log = readEventLog();
if (!log) {
  console.error('No usable copy of the pox-5 prints in cache/pox5-events.');
  process.exit(1);
}
const state = replay(log.entries);

const totalsPath = path.join(DATA, 'totals.json');
const totals = JSON.parse(fs.readFileSync(totalsPath, 'utf8')) as LockedTotals;
const filled = withBondStake(totals, state, null);
fs.writeFileSync(totalsPath, `${JSON.stringify(filled, null, 2)}\n`);
for (const [cycle, stake] of Object.entries(filled.bond ?? {})) {
  console.log(
    `totals.json cycle ${cycle}: ${Object.keys(stake.ustx).length} pool(s) with bond stake, ${stake.unknown.length} unknown`,
  );
}

const historyDir = path.join(DATA, 'signers');
let checked = 0;
let tagged = 0;
let missed = 0;
for (const file of fs
  .readdirSync(historyDir)
  .filter((f) => f.endsWith('.json'))) {
  const full = path.join(historyDir, file);
  const history = JSON.parse(fs.readFileSync(full, 'utf8')) as SignerHistory;
  let changed = false;
  for (const summary of history.cycles) {
    const split: Record<string, Record<string, string>> = {};
    let ok = true;
    for (const contractId of history.contractIds) {
      const one = contractBondSplit(
        state,
        contractId,
        summary.cycle,
        summary.ustx[contractId],
      );
      if (one === null) {
        ok = false;
        break;
      }
      if (Object.keys(one).length > 0) split[contractId] = one;
    }
    if (!ok) {
      missed += 1;
      continue;
    }
    checked += 1;
    if (JSON.stringify(summary.bondUstx) !== JSON.stringify(split)) {
      summary.bondUstx = split;
      changed = true;
    }
    tagMembers(
      path.join(historyDir, file.replace(/\.json$/, '')),
      summary.cycle,
    );
  }
  if (changed) fs.writeFileSync(full, `${JSON.stringify(history, null, 2)}\n`);
}
/**
 * Marks the bond holders in one cycle's member list, from the replay. Only
 * called for a cycle whose split added up, so the rows are the chain's.
 */
function tagMembers(dir: string, cycle: number): void {
  const file = path.join(dir, `${cycle}.json`);
  if (!fs.existsSync(file)) return;
  const list = JSON.parse(fs.readFileSync(file, 'utf8')) as SignerCycleMembers;
  list.members = list.members.map((member) => {
    const row = state.get(member.staker)?.get(cycle);
    const { bondIndex: _old, ...rest } = member;
    if (row?.kind === 'bond' && row.signer === member.contractId) {
      return { ...rest, bondIndex: row.bondIndex ?? null };
    }
    return rest;
  });
  const text = `${JSON.stringify(list, null, 2)}\n`;
  if (fs.readFileSync(file, 'utf8') !== text) {
    fs.writeFileSync(file, text);
    tagged += 1;
  }
}

console.log(`member lists with bond holders marked: ${tagged}`);
console.log(
  `signer histories: ${checked} cycle(s) split, ${missed} that did not add up`,
);
