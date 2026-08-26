/**
 * Writes a Clarinet deployment plan that recovers every failed distribution.
 *
 *   pnpm plan:recovery
 *   pnpm plan:recovery --sender SP… --out deployments/recover.mainnet-plan.yaml
 *   HIRO_API_KEY=… pnpm plan:recovery --from 2500
 *
 * The scan is one read-only call per sBTC withdrawal request ever issued, so
 * it is slow anonymously and quick with a key or a node of your own — see
 * `node.ts`. `--from` bounds it: a rejection never un-rejects, so a range
 * already cleared need not be walked again.
 *
 * Nothing here signs or sends anything. It writes a file, prints what is in
 * it, and stops. Applying it is a deliberate second step:
 *
 *   clarinet deployments apply -p deployments/recover.mainnet-plan.yaml
 *
 * By default each transaction is expected from the staker who is owed, which
 * says plainly whose money it is but needs one key per staker. Since
 * `reclaim-failed-withdrawal` is permissionless and pays the staker whoever
 * sends it, `--sender` rewrites them all to one operator and makes the plan
 * runnable in a single pass. That is a change in who pays the fees, not in
 * who gets the sats.
 */

import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  buildRecoveryPlan,
  findFailedDistributions,
  summarise,
} from './failed-distributions.js';
import { describeNode } from './node.js';

const DEFAULT_OUT = 'deployments/recover-failed-distributions.mainnet-plan.yaml';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function numericFlag(name: string): number | undefined {
  const raw = flag(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} needs a number, got ${raw}`);
  }
  return value;
}

const sats = (value: bigint) =>
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

async function main() {
  const out = flag('out') ?? DEFAULT_OUT;
  const sender = flag('sender');

  console.log(`Reading ${describeNode()}`);

  let lastLogged = 0;
  const scan = await findFailedDistributions({
    fromId: numericFlag('from'),
    toId: numericFlag('to'),
    onProgress: (id, toId, found) => {
      // Quiet enough to leave running, often enough to show it is alive.
      if (id - lastLogged < 250 && id !== toId) return;
      lastLogged = id;
      console.log(`  request ${id}/${toId} — ${found} to recover so far`);
    },
  });

  if (scan === null) {
    console.error(
      'Could not read the sBTC registry, so nothing was written. A plan built ' +
        'from a half-read chain would quietly leave money behind.',
    );
    process.exitCode = 1;
    return;
  }

  const total = scan.found.reduce((sum, e) => sum + e.recoverableSats, 0n);
  console.log(
    `\nWalked requests ${scan.fromId}–${scan.toId}: ` +
      `${scan.found.length} failed distribution(s), ${sats(total)} sats.`,
  );

  for (const row of summarise(scan.found)) {
    console.log(`  ${row.pool}`);
    console.log(`    ${row.count} request(s), ${sats(row.sats)} sats`);
  }

  const unreadable = scan.skipped
    .filter((s) => s.reason === 'unreadable-pool')
    .map((s) => s.requestId);
  if (unreadable.length > 0) {
    // Named, not counted: a re-run wants `--from`/`--to` around them, and
    // "some requests were missed" with no ids is not something to act on.
    console.warn(
      `\n${unreadable.length} request(s) could not be read at all: ` +
        `${unreadable.join(', ')}\n` +
        'They are NOT in the plan. Re-run over that range before treating it ' +
        'as complete — anonymous requests get rate-limited.',
    );
  }

  const plan = buildRecoveryPlan(scan.found, {
    sender,
    cost: numericFlag('cost'),
    batchSize: numericFlag('batch-size'),
    epoch: flag('epoch'),
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, plan);
  console.log(`\nWrote ${out}`);
  console.log(
    sender
      ? `Every transaction is expected from ${sender}; the sats still go to each staker.`
      : 'Each transaction is expected from the staker it pays. Pass --sender to ' +
          'have one operator send them all.',
  );
  console.log(`Apply it with:\n  clarinet deployments apply -p ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
