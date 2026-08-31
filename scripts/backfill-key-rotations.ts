/**
 * Reads every rotation out of the guide's own history, once.
 *
 * The refresh records a rotation when it sees one, which covers everything
 * from the day that was written onwards and nothing before it. What came
 * before is still on record, though, in the only place it could be: this
 * repository commits `src/data/signers.json` every hour, so walking those
 * commits and watching the `signerKey` of each contract is a complete account
 * of every key that has changed since the guide started looking.
 *
 * The same trick backfilled `firstSeenCycle`, and for the same reason: the
 * chain does not answer "when did this start", but the record of asking it
 * hourly does.
 *
 *   npx tsx scripts/backfill-key-rotations.ts [--limit 500]
 *
 * Safe to run again. Entries are merged by what happened rather than by when
 * it was noticed, so a rotation the refresh has already written down is not
 * recorded a second time under a slightly different timestamp.
 *
 * It is not part of the hourly run and should not become one: it reads every
 * commit that ever touched the file, which is a few hundred today and will be
 * tens of thousands in a year.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KeyRotation, KeyRotations, SignerData } from '../src/lib/types.js';
import { mergeRotations, rotationsBetween } from './key-rotations.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACKED = 'src/data/signers.json';
const OUTPUT = path.join(ROOT, 'src', 'data', 'key-rotations.json');

const git = (args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

/** Every commit that touched the pool list, oldest first. */
function commits(limit: number | null): { sha: string; at: string }[] {
  const args = ['log', '--format=%H %cI', '--reverse'];
  if (limit !== null) args.push(`-n${limit}`);
  args.push('--', TRACKED);
  return git(args)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [sha, at] = line.split(' ');
      return { sha, at };
    });
}

function readAt(sha: string): SignerData | null {
  try {
    return JSON.parse(git(['show', `${sha}:${TRACKED}`])) as SignerData;
  } catch {
    // A commit from before the file existed, or one where it would not parse.
    return null;
  }
}

function main(): void {
  const at = process.argv.indexOf('--limit');
  const limit = at === -1 ? null : Number(process.argv[at + 1]);
  if (at !== -1 && !Number.isInteger(limit)) {
    throw new Error('--limit takes a number of commits');
  }

  const history = commits(limit);
  console.log(`Walking ${history.length} commits of ${TRACKED}…`);

  let previous: SignerData | null = null;
  const found: KeyRotation[] = [];
  for (const commit of history) {
    const snapshot = readAt(commit.sha);
    if (snapshot === null) continue;
    if (previous !== null) {
      found.push(
        ...rotationsBetween(previous.signers, snapshot.signers, {
          observedAt: commit.at,
          cycle: typeof snapshot.cycle === 'number' ? snapshot.cycle : null,
        }),
      );
    }
    previous = snapshot;
  }

  let existing: KeyRotation[] = [];
  try {
    existing = (JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) as KeyRotations)
      .rotations;
  } catch {
    existing = [];
  }

  const rotations = mergeRotations(existing, found);
  const added = rotations.length - existing.length;
  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), rotations }, null, 2)}\n`,
  );

  console.log(`Found ${found.length}; ${added} new; ${rotations.length} on file.`);
  for (const rotation of rotations) {
    console.log(
      `  ${rotation.observedAt.slice(0, 16)}  cycle ${rotation.cycle}` +
        `  ${rotation.contractId}`,
    );
  }
}

main();
