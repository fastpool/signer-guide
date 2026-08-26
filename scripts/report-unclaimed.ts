/**
 * Prints where the sBTC rewards are sitting, and how many stakers are owed.
 *
 *   pnpm report:unclaimed --skip-stakers      the amounts, in a few seconds
 *   HIRO_API_KEY=… pnpm report:unclaimed      the amounts and the head count
 *   pnpm report:unclaimed --json --out unclaimed.json
 *
 * The head count is the slow half: nothing enumerates a Clarity map, so every
 * `stake` / `stake-update` in pox-5's history has to be paged through before a
 * single staker can be asked anything. Anonymously that is a quarter of an
 * hour; with a key or a node of your own it is a couple of minutes. See
 * `node.ts`.
 *
 * Reads only. Nothing here claims anything on anybody's behalf — both hops
 * are permissionless, so a report is the honest half of the job.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import signerData from '../src/data/signers.json' with { type: 'json' };
import type { SignerData } from '../src/lib/types.js';
import { describeNode } from './node.js';
import { contractFunctions, sleep } from './read-only.js';
import { SPACING_MS } from './node.js';
import {
  enumerateStakers,
  fetchClaims,
  fetchMembers,
  fetchMembershipContract,
  mergeMembers,
  fetchPoolHoldings,
  fetchStakerBalance,
  rewardCycles,
  totalSbtcStaked,
  totals,
  type PoolKind,
  type Report,
  type StakerBalance,
} from './unclaimed-rewards.js';

const sats = (value: bigint | null) =>
  value === null
    ? 'not known'
    : `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} sats`;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const { signers } = signerData as SignerData;
  console.log(`Reading ${describeNode()}`);

  const cycles = await rewardCycles();
  if (cycles === null) {
    console.error('Could not read which cycles pox-5 has rewards for.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `pox-5 reward cycles so far: ${cycles.join(', ')} (${cycles.length})\n`,
  );

  const bonded = await totalSbtcStaked();
  if (bonded === null || bonded > 0n) {
    // Everything below reads the STX-only side. Saying so beats a total that
    // silently leaves out a whole class of rewards.
    console.warn(
      `Note: sBTC staked in bond periods is ${sats(bonded)}. Bond-period ` +
        'rewards are keyed per bond index and are NOT counted below.\n',
    );
  }

  const pools = [];
  for (const signer of signers) {
    process.stdout.write(`  ${signer.displayName}… `);
    const holdings = await fetchPoolHoldings(signer.contractId, cycles);
    pools.push(holdings);
    console.log(
      holdings.kind === 'unreadable'
        ? 'COULD NOT BE READ'
        : holdings.kind === 'keeps-none'
          ? 'keeps nothing for stakers'
          : `${sats(holdings.unattributedSats + holdings.pendingSats)} for stakers` +
            (holdings.kind === 'pox5-direct' ? ' (its sBTC balance)' : ''),
    );
  }

  let stakers: Report['stakers'] = null;
  if (!has('skip-stakers')) {
    console.log('\nWalking pox-5 for who has staked…');
    let lastLogged = 0;
    const staked = await enumerateStakers({
      onProgress: (seen, total, found) => {
        if (seen - lastLogged < 1_000 && seen !== total) return;
        lastLogged = seen;
        console.log(`  ${seen}/${total} transactions — ${found} stakers`);
      },
    });

    if (staked === null) {
      console.warn(
        'Could not page all of pox-5, so no head count. The amounts above ' +
          'stand on their own — they never needed the list.',
      );
    } else {
      // Probe each pool once, so the per-staker loop asks only for getters
      // that exist rather than eating a failed call per staker per pool.
      const getters = new Map<string, Set<string>>();
      for (const signer of signers) {
        await sleep(SPACING_MS);
        const functions = await contractFunctions(signer.contractId);
        getters.set(signer.contractId, functions?.readOnly ?? new Set());
      }
      const kinds = new Map<string, PoolKind>(
        pools.map((pool) => [pool.pool, pool.kind]),
      );

      // A gated pool's members joined through a wrapper, so pox-5's
      // transaction results never name them and the walk above missed every
      // one. Their own membership roll is the index.
      for (const pool of pools) {
        if (pool.kind !== 'pox5-direct') continue;
        const membership = await fetchMembershipContract(pool.pool);
        if (!membership) {
          console.warn(`  ${pool.pool}: no membership contract found.`);
          continue;
        }
        const members = await fetchMembers(membership);
        if (!members) {
          console.warn(`  ${membership}: membership roll unreadable.`);
          continue;
        }
        const added = mergeMembers(staked, pool.pool, members.ever);
        console.log(
          `  ${membership}: ${members.ever.length} member(s) ever, ` +
            `${members.current.length} still delegating (${added} new to the walk)`,
        );
      }

      console.log(`\nAsking ${staked.size} stakers what they are owed…`);
      const withUnclaimed: StakerBalance[] = [];
      let done = 0;
      for (const [staker, theirPools] of staked) {
        const balance = await fetchStakerBalance(
          staker,
          theirPools,
          cycles,
          getters,
          kinds,
        );
        if (balance.unsettledSats + balance.pendingSats > 0n) {
          withUnclaimed.push(balance);
        }
        done += 1;
        if (done % 100 === 0 || done === staked.size) {
          console.log(
            `  ${done}/${staked.size} — ${withUnclaimed.length} with something unclaimed`,
          );
        }
      }
      stakers = { total: staked.size, withUnclaimed };
    }
  }

  const report: Report = { cycles, pools, stakers, sbtcStakedSats: bonded };
  const t = totals(report);

  console.log('\n────────────────────────────────────────');
  console.log('Sitting in pox-5, not yet pulled by the pool');
  for (const pool of report.pools) {
    if (pool.owedByPox5Sats === null || pool.owedByPox5Sats === 0n) continue;
    console.log(`  ${sats(pool.owedByPox5Sats).padStart(18)}  ${pool.pool}`);
  }
  console.log(`  ${sats(t.inPox5Sats).padStart(18)}  TOTAL`);

  console.log('\nSitting in the signer managers, owed to stakers');
  for (const pool of report.pools) {
    const owed = pool.unattributedSats + pool.pendingSats;
    if (owed === 0n) continue;
    const settled = pool.pendingSats > 0n ? ` (${sats(pool.pendingSats)} settled)` : '';
    console.log(`  ${sats(owed).padStart(18)}  ${pool.pool}${settled}`);
  }
  console.log(`  ${sats(t.owedToStakersSats).padStart(18)}  TOTAL`);

  console.log('\nNot owed to stakers, listed so it is not double-counted');
  console.log(`  ${sats(t.inFlightSats).padStart(18)}  handed to sBTC withdrawals (in flight, or refused)`);
  console.log(`  ${sats(t.feesSats).padStart(18)}  operator fees earned`);

  if (t.unreadable.length > 0) {
    // Named, and the totals above are already null because of them. A gap
    // this report cannot see is the one thing worth shouting about.
    console.warn(
      `\n${t.unreadable.length} pool(s) could not be read, so the totals are ` +
        `incomplete rather than low:\n  ${t.unreadable.join('\n  ')}\n` +
        'Re-run — anonymous requests get rate-limited.',
    );
  }

  // Who has claimed, for the pools where that is a question with an answer.
  // A pool with its own books pays out on demand and keeps no record of who
  // has been; a pox5-direct pool's print log is the only ledger there is.
  for (const pool of report.pools) {
    if (pool.kind !== 'pox5-direct') continue;
    const claims = await fetchClaims(pool.pool);
    if (claims === null) {
      console.warn(`\nCould not read the claim log of ${pool.pool}.`);
      continue;
    }
    const claimed = claims.reduce((acc, c) => acc + c.claimedSats, 0n);
    const claimedBy = new Set(claims.map((c) => c.staker));
    console.log(`\nClaimed from ${pool.pool}`);
    console.log(
      `  ${claims.length} staker(s) have claimed, ${sats(claimed)} in total. ` +
        `${sats(pool.unattributedSats)} is still in the contract.`,
    );
    if (has('list-claims')) {
      for (const claim of claims) {
        console.log(
          `    ${sats(claim.claimedSats).padStart(16)}  ${claim.staker}  ` +
            `cycle ${claim.cycles.sort((a, b) => a - b).join(', ')}`,
        );
      }
    }

    // The other half of the same question, from the membership roll: who is
    // in this pool and has not been. Not the same as "is owed something" —
    // somebody who joined after the cycle was snapshotted has nothing to
    // claim and never will for that cycle.
    const membership = await fetchMembershipContract(pool.pool);
    const members = membership ? await fetchMembers(membership) : null;
    if (members === null) {
      console.warn('  Membership roll unreadable, so no not-claimed list.');
    } else {
      const notClaimed = members.ever.filter((m) => !claimedBy.has(m));
      console.log(
        `  ${notClaimed.length} of ${members.ever.length} member(s) have never ` +
          `claimed (${members.current.length} still delegating).`,
      );
      if (has('list-claims')) {
        for (const member of notClaimed) console.log(`    ${member}`);
      } else if (notClaimed.length > 0) {
        console.log('  Pass --list-claims to name them.');
      }
    }

    // Worth saying plainly before anyone offers to help: every other hop in
    // pox-5 is permissionless, and this one is not.
    console.log(
      '  Only they can claim it: claim-staker-rewards reads tx-sender, so no ' +
        'operator can sweep it out on their behalf.',
    );
  }

  if (report.stakers) {
    const owed = report.stakers.withUnclaimed.reduce(
      (acc, s) => acc + s.unsettledSats + s.pendingSats,
      0n,
    );
    console.log(
      `\n${report.stakers.withUnclaimed.length} of ${report.stakers.total} ` +
        `stakers have not claimed, ${sats(owed)} between them.`,
    );

    // The two halves are counted from different ends — contract totals above,
    // person by person here — so printing the gap turns a discrepancy a
    // reader would otherwise find into one the report already explains.
    if (t.owedToStakersSats !== null && t.owedToStakersSats !== owed) {
      const gap = t.owedToStakersSats - owed;
      console.log(
        `  ${sats(gap < 0n ? -gap : gap)} ${gap > 0n ? 'less' : 'more'} than the ` +
          'pool totals above. A share is computed with integer division, so ' +
          'the shares of a pooled bucket do not add back up to it exactly; ' +
          'the dust stays in the bucket and belongs to nobody in particular. ' +
          'A large gap would mean something else, and is worth chasing.',
      );
    }
  }

  const out = flag('out');
  if (out || has('json')) {
    const json = JSON.stringify(
      { ...report, totals: t },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    );
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${json}\n`);
      console.log(`\nWrote ${out}`);
    } else {
      console.log(`\n${json}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
