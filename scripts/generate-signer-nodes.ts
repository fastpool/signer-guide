/**
 * Builds src/data/signer-nodes.json: what is known about the nodes themselves.
 *
 * Usage: npx tsx scripts/generate-signer-nodes.ts [--blocks 50]
 *
 * The guide has always described pools. This describes the signer keys behind
 * them — what each one weighs in the signer set, what it says it is running,
 * and whether it has been signing — so the page can say something about a
 * node rather than only about the money in front of it.
 *
 * Everything here is read by `scripts/signer-nodes-report.ts`, which is the
 * same job as a table on a terminal and carries the long argument about what
 * can and cannot be known. Two things from it are worth repeating where the
 * file is written:
 *
 * **Region is not in here and will not be.** Signers post to StackerDB, which
 * is on chain, so they never talk to each other by address and there is
 * nothing to look up. Matching P2P peers to signer keys by guesswork would put
 * a country against somebody's name on no evidence, so the field does not
 * exist rather than existing empty.
 *
 * **The version is the signer protocol version**, which each signer
 * broadcasts, not the version of the binary, which nobody publishes. It
 * answers the question worth asking — is this node behind the network — and
 * not "what build is it on".
 *
 * ## Two numbers that are not the same number
 *
 * `stackedUstx` is every uSTX pox-5 counts as stacked. `seatedUstx` is the
 * uSTX that got a seat in the signer set. The guide's percentages divide by
 * the first and the signer set's by the second, and they differ by whoever
 * stacked without earning a slot. Both are written down so a page can say
 * which one it means.
 *
 * `ustxPerSlot` is the second over `slots`, and it is the number that decides
 * who is in the set at all: slots are shared in proportion and rounded, so a
 * signer under half a slot rounds to nothing. 98,112 STX a slot in cycle 141
 * and 105,373 in 142 — and a pool sitting on 50,020 STX went from 0.5097
 * slots to 0.4746 between them and lost its seat without moving a STX.
 *
 * ## Rotated keys
 *
 * A cycle's signer set is fixed when the cycle is locked in; a contract's
 * registered key is whatever it is now. Rotate, and the old key keeps the seat
 * for every cycle already settled while the new one holds nothing until the
 * next set is computed — which in this file reads as a pool with no seat
 * beside a seat with no pool. It is indistinguishable from a signer leaving
 * and another arriving, because from the chain's side that is what it is.
 *
 * Allowed to fail in the refresh, like the other softer files: a page that
 * cannot say what a node is running is worse than yesterday's answer, and both
 * are better than no pool list.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import signerData from '../src/data/signers.json' with { type: 'json' };
import totalsData from '../src/data/totals.json' with { type: 'json' };
import type {
  LockedTotals,
  SignerData,
  SignerNodeRecord,
  SignerNodesData,
} from '../src/lib/types.js';
import { describeNode } from './node.js';
import { fetchCurrentCycle } from './pox5.js';
import {
  buildRows,
  fetchBehaviour,
  fetchVersions,
  fetchWeights,
  reconcile,
  type NodeRow,
} from './signer-nodes-report.js';

const OUTPUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'signer-nodes.json',
);

/** One row as the file holds it: bigints as strings, nothing invented. */
export function toRecord(row: NodeRow): SignerNodeRecord {
  return {
    signerKey: row.signerKey,
    pools: row.pools,
    groups: row.groups,
    ourUstx: row.ourUstx === null ? null : row.ourUstx.toString(),
    seat: row.weight
      ? {
          weight: row.weight.weight,
          weightPercent: row.weight.weightPercent,
          stackedUstx: row.weight.stackedUstx.toString(),
          signerAddress: row.weight.signerAddress,
        }
      : null,
    version: row.version
      ? {
          local: row.version.local,
          active: row.version.active,
          observedAt: row.version.observedAt,
        }
      : null,
    behaviour: row.behaviour
      ? {
          participationRate: row.behaviour.participationRate,
          degradationRate: row.behaviour.degradationRate,
          signedCount: row.behaviour.signedCount,
          missedCount: row.behaviour.missedCount,
          acceptedCount: row.behaviour.acceptedCount,
          rejectedCount: row.behaviour.rejectedCount,
          preCommitRate: row.behaviour.preCommitRate,
        }
      : null,
  };
}

/**
 * Whether this run learned enough to be worth writing.
 *
 * The seats come from the chain and are the point of the file; the version and
 * behaviour columns come from somebody else's service and are allowed to be
 * missing. Writing a file with no seats in it would replace a good answer with
 * an empty one on the day an endpoint moved.
 */
export function worthWriting(nodes: SignerNodeRecord[]): boolean {
  return nodes.some((node) => node.seat !== null);
}

async function main() {
  const argv = process.argv.slice(2);
  const blocksArg = argv.indexOf('--blocks');
  const blocks = blocksArg === -1 ? 50 : Number(argv[blocksArg + 1]);

  const signers = (signerData as SignerData).signers;
  const totals = totalsData as LockedTotals;

  const cycle = await fetchCurrentCycle();
  if (cycle === null) {
    console.error(`${describeNode()} would not say what cycle it is in.`);
    process.exit(1);
  }

  console.log(`Reading signer nodes for cycle ${cycle} from ${describeNode()} ...`);

  const [weights, versions, behaviour] = await Promise.all([
    fetchWeights(cycle),
    fetchVersions(200),
    fetchBehaviour(blocks),
  ]);

  // Only the amounts read for this cycle. A cycle's worth of totals under
  // another cycle's heading is a wrong number, not a stale one.
  const ustx = totals.cycle === cycle ? totals.ustx : {};
  const rows = buildRows(signers, ustx, weights, versions, behaviour);
  const ourUstx = Object.values(ustx).reduce<bigint>(
    (sum, amount) => (amount === null ? sum : sum + BigInt(amount)),
    0n,
  );
  const books = reconcile(rows, ourUstx, weights);
  const nodes = rows.map(toRecord);

  if (!worthWriting(nodes)) {
    console.error(
      'No seats were readable, so nothing was written: an empty file here ' +
        'would say the signer set is empty.',
    );
    process.exit(1);
  }

  const data: SignerNodesData = {
    generatedAt: new Date().toISOString(),
    cycle,
    blocks,
    slots: books.totalSlots,
    ustxPerSlot:
      books.ustxPerSlot === null ? null : books.ustxPerSlot.toString(),
    stackedUstx: books.ourUstx.toString(),
    seatedUstx: books.seatedUstx.toString(),
    nodes,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);

  const seated = nodes.filter((node) => node.seat !== null).length;
  const versioned = nodes.filter((node) => node.version !== null).length;
  const watched = nodes.filter((node) => node.behaviour !== null).length;
  console.log(
    `  ${nodes.length} nodes: ${seated} seated, ${versioned} said what they run, ` +
      `${watched} have a record over ${blocks} blocks.`,
  );
  if (books.ustxPerSlot !== null) {
    console.log(
      `  ${books.totalSlots} slots at ${(
        Number(books.ustxPerSlot) / 1e6
      ).toFixed(0)} STX each.`,
    );
  }
  console.log(`  Written to ${path.relative(process.cwd(), OUTPUT)}`);
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
