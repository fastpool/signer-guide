/**
 * Says, in plain terms, what moved between two generations of signers.json.
 *
 * The refresh runs on a schedule, so most runs find nothing: the same pools,
 * the same fees, a new `generatedAt` and nothing else. Committing that would
 * bury the runs that matter under daily noise, so the timestamp alone does not
 * count as a change — everything else does.
 *
 * Usage: tsx scripts/describe-signer-changes.ts previous.json current.json
 *
 * Writes a summary to stdout, and when running under GitHub Actions also to
 * the job summary, to $GITHUB_OUTPUT (`changed`, `unreviewed`) and to a commit
 * message file, so the workflow itself stays free of logic.
 */

import * as fs from 'node:fs';
import type { Signer, SignerData } from '../src/lib/types.js';

export interface Changes {
  /** Anything other than the timestamp moved. */
  changed: boolean;
  /** One line per change, for a commit message and the job summary. */
  lines: string[];
  /** Contracts running code no profile matches, so nobody has read it yet. */
  unreviewed: string[];
}

const fee = (bips: number | null) =>
  bips === null ? 'no fee of its own' : `${bips / 100}%`;

/** "2 cycles", "144 blocks", or "none" — comparable across generations. */
const noticeOf = (signer: Signer) =>
  signer.feeChangeNotice
    ? `${signer.feeChangeNotice.amount} ${signer.feeChangeNotice.unit}`
    : 'none';

/** "is-og via og-stakers", or "none" — comparable across generations. */
const exemptionOf = (signer: Signer) =>
  signer.feeExemption
    ? `${signer.feeExemption.test} via ${signer.feeExemption.source}`
    : 'none';

/**
 * The three sBTC figures as one comparable string, `?` for a reading we could
 * not take. Compared together because they move together: a staker being paid
 * lowers what the pool is holding and raises nothing else, and a payout raises
 * what pox-5 owes every pool at once.
 */
const rewardsOf = (signer: Signer) =>
  [
    signer.unclaimedFromPoxSats ?? '?',
    signer.undistributedSats ?? '?',
    signer.earnedFeesSats ?? '?',
  ].join('/');

/** "fee 2.5%", but "no fee of its own" reads badly with "fee" in front. */
const feePhrase = (bips: number | null) =>
  bips === null ? fee(bips) : `fee ${fee(bips)}`;

export function describeChanges(
  previous: SignerData,
  current: SignerData,
): Changes {
  const before = new Map(previous.signers.map((s) => [s.contractId, s]));
  const after = new Map(current.signers.map((s) => [s.contractId, s]));
  const lines: string[] = [];

  if (previous.cycle !== current.cycle) {
    lines.push(`Cycle ${current.cycle} is now the current one`);
  }

  for (const [id, signer] of after) {
    if (before.has(id)) continue;
    lines.push(
      `+ registered  ${id}  (${signer.implementationName ?? 'code not reviewed'}, ${feePhrase(signer.feeBips)})`,
    );
  }

  for (const id of before.keys()) {
    if (!after.has(id)) lines.push(`- deregistered  ${id}`);
  }

  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) continue;

    if (was.feeBips !== now.feeBips) {
      lines.push(`~ fee  ${id}  ${fee(was.feeBips)} -> ${fee(now.feeBips)}`);
    }
    if (was.profileId !== now.profileId) {
      lines.push(
        `~ code  ${id}  now matches ${now.implementationName ?? 'no reviewed contract'}`,
      );
    }
    // A deployed contract cannot change, so this means our own reading of it
    // changed — a canonicalisation, a detector edit, or a `clarinet format`
    // release that lays some form out differently and moves the icon with it.
    // Worth a human's eye.
    for (const key of [
      'groupSha256',
      'identiconHash',
      'bitcoinRewards',
      'openToAnyone',
      'maxFeeBips',
    ] as const) {
      if (was[key] !== now[key]) {
        lines.push(`~ ${key}  ${id}  ${was[key]} -> ${now[key]}`);
      }
    }
    if (noticeOf(was) !== noticeOf(now)) {
      lines.push(
        `~ feeChangeNotice  ${id}  ${noticeOf(was)} -> ${noticeOf(now)}`,
      );
    }
    if (exemptionOf(was) !== exemptionOf(now)) {
      lines.push(
        `~ feeExemption  ${id}  ${exemptionOf(was)} -> ${exemptionOf(now)}`,
      );
    }
  }

  /*
   * The reward figures, counted rather than listed.
   *
   * These move with every payout and every staker who claims one, so a line
   * per pool would be an hourly page of noise — the thing this file exists to
   * keep out of the history. They are still news, though, and it matters that
   * they count as one: when nothing here reports a change the refresh puts
   * signers.json back, and the page would then show whatever reward figures
   * the last unrelated commit happened to catch, indefinitely.
   *
   * So: one line, whoever moved.
   */
  let rewardsMoved = 0;
  for (const [id, now] of after) {
    const was = before.get(id);
    if (was && rewardsOf(was) !== rewardsOf(now)) rewardsMoved += 1;
  }
  if (rewardsMoved > 0) {
    lines.push(
      `~ rewards  ${rewardsMoved} pool(s) claimed, paid out or charged sBTC`,
    );
  }

  const unreviewed = [...after.values()]
    .filter((s: Signer) => s.profileId === null)
    // These reach a shell in the workflow. They come from the chain, so they
    // are constrained to what a principal and contract name may contain
    // before they go anywhere near it.
    .filter((s) => /^[A-Z0-9]+\.[a-zA-Z0-9-]+$/.test(s.contractId))
    .map((s) => s.contractId);

  return { changed: lines.length > 0, lines, unreviewed };
}

function main() {
  const [previousPath, currentPath] = process.argv.slice(2);
  if (!previousPath || !currentPath) {
    console.error(
      'usage: describe-signer-changes.ts previous.json current.json',
    );
    process.exit(2);
  }

  const read = (p: string) =>
    JSON.parse(fs.readFileSync(p, 'utf8')) as SignerData;
  const current = read(currentPath);
  const { changed, lines, unreviewed } = describeChanges(
    read(previousPath),
    current,
  );

  const body = changed
    ? lines.join('\n')
    : 'No change beyond the timestamp; nothing to commit.';
  console.log(body);

  const summary = changed
    ? `Refresh signer data: ${lines.length} change${lines.length === 1 ? '' : 's'}`
    : 'Refresh signer data';

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changed=${changed}\nunreviewed=${unreviewed.join(' ')}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${summary}\n\n${current.signers.length} pools registered, ` +
        `${unreviewed.length} running code we have not reviewed.\n\n` +
        '```\n' +
        `${body}\n` +
        '```\n',
    );
  }
  if (process.env.COMMIT_MESSAGE_FILE) {
    fs.writeFileSync(
      process.env.COMMIT_MESSAGE_FILE,
      `${summary}\n\n${body}\n\nRead from the chain by the scheduled refresh.\n`,
    );
  }
}

// Only when run directly, so the tests can import describeChanges.
if (process.argv[1]?.endsWith('describe-signer-changes.ts')) main();
