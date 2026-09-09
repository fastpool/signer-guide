/**
 * Builds src/data/bonds.json: what the current and next bond hold.
 *
 * Usage: npx tsx scripts/generate-bonds.ts
 *
 * pox-5's bonds are the other half of staking, and the guide has never said
 * anything about them: every page here is about STX and the pool looking
 * after it. This is the bitcoin side — which stakers a bond has invited, how
 * much each of them may lock, and how much of that they have actually locked.
 *
 * Two numbers per bond, and they are not the same claim:
 *
 *   the ceiling     every allowlisted staker's `max-sats` added up. Nobody
 *                   has promised any of it. It is what the bond can hold.
 *   the registered  pox-5's own `get-total-sbtc-staked-for-bond`. Locked,
 *                   and not an estimate of anything.
 *
 * The gap between them is what is still open, which is the figure somebody
 * looking at the next bond actually wants. See scripts/bonds.ts for how the
 * allowlist is recovered — pox-5 will not list it, so it comes out of the
 * `setup-bond` transaction's events and is then confirmed name by name
 * against the allowance map.
 *
 * Allowed to fail in the refresh, like the amounts and the nodes: a bond page
 * showing yesterday's figures is better than a pool list that did not ship
 * because an indexer had a bad afternoon.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BondPeriod, BondsData, BondStaker } from '../src/lib/types.js';
import {
  allowlistComplete,
  allowlistFromEvents,
  bondIndexes,
  bondLengthFromEvents,
  BOND_LENGTH_CYCLES,
  buildStakerRows,
  fetchPrintEvents,
  findSetupBondTxid,
  readBondAdmin,
  readBondPeriodCycle,
  readBondStartHeight,
  readCurrentCycle,
  readFirstBondPeriodCycle,
  readGapCycles,
  readProtocolBond,
  readRegisteredSats,
  sumMaxSats,
  type StakerRow,
} from './bonds.js';
import { describeNode } from './node.js';
import { fetchJson } from './read-only.js';

const OUTPUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'bonds.json',
);

function toStaker(row: StakerRow): BondStaker {
  return {
    staker: row.staker,
    maxSats: row.maxSats.toString(),
    registeredSats: row.registeredSats.toString(),
    amountUstx: row.amountUstx === null ? null : row.amountUstx.toString(),
    isL1Lock: row.isL1Lock,
    signer: row.signer,
  };
}

/**
 * One period, read end to end.
 *
 * The order matters for what it costs: a period nobody has set up has no
 * allowlist to recover and no stakers to confirm, so it stops after four
 * cheap reads. Only a real bond pays for the transaction search and the two
 * reads per name.
 */
async function readPeriod(
  bondIndex: number,
  burnHeight: number | null,
  admin: string | null,
  fallbackLength: number,
): Promise<BondPeriod | null> {
  const [firstRewardCycle, startBurnHeight, terms, registered] =
    await Promise.all([
      readBondPeriodCycle(bondIndex),
      readBondStartHeight(bondIndex),
      readProtocolBond(bondIndex),
      readRegisteredSats(bondIndex),
    ]);

  // The schedule is the one thing this file cannot do without: without the
  // cycle a period opens at there is no period to describe.
  if (firstRewardCycle === null) return null;

  const setUp = terms.kind === 'value';
  let lengthCycles = fallbackLength;
  let rows: StakerRow[] = [];

  if (setUp && admin !== null) {
    const txid = await findSetupBondTxid(admin, bondIndex);
    const events = txid === null ? null : await fetchPrintEvents(txid);
    if (events !== null) {
      lengthCycles = bondLengthFromEvents(events, bondIndex) ?? fallbackLength;
      rows = await buildStakerRows(
        bondIndex,
        allowlistFromEvents(events, bondIndex),
      );
    }
  }

  return {
    bondIndex,
    firstRewardCycle,
    unlockCycle: firstRewardCycle + lengthCycles,
    startBurnHeight,
    started:
      burnHeight !== null &&
      startBurnHeight !== null &&
      burnHeight >= startBurnHeight,
    setUp,
    targetRate: terms.kind === 'value' ? Number(terms.value.targetRate) : null,
    stxValueRatio:
      terms.kind === 'value' ? terms.value.stxValueRatio.toString() : null,
    minUstxRatio:
      terms.kind === 'value' ? Number(terms.value.minUstxRatio) : null,
    allowlistedSats: sumMaxSats(rows).toString(),
    registeredSats: registered === null ? null : registered.toString(),
    allowlistComplete: allowlistComplete(rows, registered),
    stakers: rows.map(toStaker),
  };
}

async function main() {
  console.log(`Reading the bonds from ${describeNode()} ...`);

  const [cycle, firstBondPeriodCycle, gapCycles, admin, pox] =
    await Promise.all([
      readCurrentCycle(),
      readFirstBondPeriodCycle(),
      readGapCycles(),
      readBondAdmin(),
      fetchJson<{ current_burnchain_block_height?: number }>('/v2/pox'),
    ]);

  // Three answers the whole file is expressed in terms of. A run that has to
  // guess at any of them would describe the wrong periods, which is worse
  // than describing none — so it stops and the last file stands.
  if (cycle === null || firstBondPeriodCycle === null || gapCycles === null) {
    console.error(
      `${describeNode()} would not say what cycle it is in, or when the bond ` +
        'periods start. Nothing written.',
    );
    process.exit(1);
  }

  const burnHeight = pox?.current_burnchain_block_height ?? null;
  const indexes = bondIndexes(cycle, firstBondPeriodCycle, gapCycles);

  if (admin === null) {
    // The terms and the totals still read; only the allowlist needs the
    // admin's transactions, so this costs the ceiling and nothing else.
    console.warn(
      '  Could not read the bond admin, so no allowlist could be recovered.',
    );
  }

  const [current, next] = await Promise.all([
    indexes.current === null
      ? Promise.resolve(null)
      : readPeriod(indexes.current, burnHeight, admin, BOND_LENGTH_CYCLES),
    readPeriod(indexes.next, burnHeight, admin, BOND_LENGTH_CYCLES),
  ]);

  if (next === null) {
    console.error(
      'The bond schedule could not be read, so nothing was written: a file ' +
        'with no next period in it would say the bonds have stopped.',
    );
    process.exit(1);
  }

  // Every period runs for the same number of cycles, but only one that was
  // set up carries the term in its own print — see `bondLengthFromEvents`. So
  // the figure is taken from a real bond where there is one, and from the
  // constant only when neither period exists yet.
  const measured = [current, next].find((period) => period?.setUp) ?? next;

  const data: BondsData = {
    generatedAt: new Date().toISOString(),
    cycle,
    burnHeight,
    firstBondPeriodCycle,
    gapCycles,
    lengthCycles: measured.unlockCycle - measured.firstRewardCycle,
    current,
    next,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);

  for (const period of [current, next]) {
    if (!period) continue;
    const role = period === current ? 'current' : 'next';
    if (!period.setUp) {
      console.log(
        `  ${role}: bond ${period.bondIndex} (cycle ${period.firstRewardCycle}) ` +
          'has not been set up.',
      );
      continue;
    }
    const btc = (sats: string | null) =>
      sats === null ? 'unknown' : `${(Number(sats) / 1e8).toFixed(8)} BTC`;
    console.log(
      `  ${role}: bond ${period.bondIndex}, cycles ${period.firstRewardCycle}` +
        `-${period.unlockCycle - 1}: ${btc(period.registeredSats)} of ` +
        `${btc(period.allowlistedSats)} across ${period.stakers.length} ` +
        `allowlisted staker(s)` +
        (period.allowlistComplete ? '' : ' — allowlist incomplete'),
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
