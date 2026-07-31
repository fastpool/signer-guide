/**
 * Builds src/data/totals.json: how much STX each pool is looking after.
 *
 * The pools come from src/data/signers.json, so this runs after
 * `generate-signers.ts` and covers exactly the pools the page will show.
 *
 * This is the one number on the page that moves between refreshes, and it
 * used to be read in the browser on every visit. It is read here instead:
 * once an hour for every reader, rather than once a reader. See the note at
 * the top of scripts/locked.ts.
 *
 * A pool the node will not answer for is recorded as null — "not known" —
 * never as zero. If the node answers for nothing at all, this writes nothing
 * and fails, so the page keeps the last amounts it had rather than blanking.
 *
 * Usage: npx tsx scripts/generate-totals.ts
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLockedTotals } from './locked.js';
import { describeNode } from './node.js';
import type { SignerData } from '../src/lib/types.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SIGNERS = path.join(DATA, 'signers.json');
const OUTPUT = path.join(DATA, 'totals.json');

async function main() {
  const signers = JSON.parse(fs.readFileSync(SIGNERS, 'utf8')) as SignerData;
  const contractIds = signers.signers.map((s) => s.contractId);

  console.log(
    `Reading what ${contractIds.length} pools hold from ${describeNode()} ...`,
  );
  const totals = await readLockedTotals(contractIds);

  if (!totals) {
    console.error(
      'The node answered for no pool at all. Leaving the last amounts in' +
        ' place: stale numbers beat a page of blanks.',
    );
    process.exit(1);
  }

  const unknown = Object.values(totals.ustx).filter((v) => v === null).length;
  fs.writeFileSync(OUTPUT, `${JSON.stringify(totals, null, 2)}\n`);

  console.log(`\nWrote cycle ${totals.cycle} amounts to ${OUTPUT}`);
  if (unknown) {
    console.log(`  ${unknown} pool(s) would not read, recorded as not known`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
