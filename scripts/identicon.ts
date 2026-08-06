/**
 * The identicon hash of a contract, per SIP-043 (draft).
 * https://github.com/stacksgov/sips/pull/266
 *
 * Two steps, and the SIP pins both:
 *
 *  1. Standardise the source — the byte-for-byte output of `clarinet format`
 *     with default settings. Not the deployed bytes: the whole point is that
 *     the same code deployed twice, formatted differently, is the same code
 *     and gets the same icon.
 *  2. Hash it — SHA-512/256 over the UTF-8 bytes, lowercase hex.
 *
 * The guide already has three hashes of its own (src/lib/canonical.ts) and
 * this is deliberately none of them. Those answer "have we read this code
 * before"; they are ours, and only mean something here. This one answers "is
 * this the same code you saw in your wallet", so it has to be the number
 * everyone else computes, down to the formatter.
 *
 * Which does not make clarinet an hourly dependency, because a deployed
 * contract's source cannot change: the hash is computed once per distinct
 * source, ever. `identiconsBySource` below is how the refresh reuses what is
 * already committed — keyed on `sourceSha256`, so a byte's difference is a
 * miss and gets standardised properly. Nine distinct sources have appeared
 * across the whole history of signers.json; the formatter has nine runs of
 * work to do, not thirty-seven an hour.
 *
 * So the formatter is wanted only when code nobody has hashed shows up, which
 * is the same moment somebody is being asked to read that contract anyway.
 * Without it that pool carries no hash and the page marks it as new code
 * rather than drawing something.
 *
 * `clarinet format --stdin` still wants a Clarinet.toml in the working
 * directory even though it never reads a contract from it, hence the throwaway
 * project below.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Enough of a project for `clarinet format` to agree to run. */
const MANIFEST = '[project]\nname = "format"\n\n[contracts]\n';

let projectDir: string | null = null;

function formatProject(): string {
  if (projectDir) return projectDir;
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarity-format-'));
  fs.writeFileSync(path.join(projectDir, 'Clarinet.toml'), MANIFEST);
  return projectDir;
}

/**
 * `clarinet 3.23.1`, or null when it is not on PATH.
 *
 * Not an error. The hourly refresh runs without it and reuses what is
 * committed; only source nobody has hashed needs the formatter, and the run
 * says so when it hits some.
 */
export function clarinetVersion(): string | null {
  try {
    return execFileSync('clarinet', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The hashes already worked out, keyed by the deployed bytes they came from.
 *
 * This is a cache and not the merge the generator was rid of in "keep what a
 * person decided in its own file". The difference is the key: a fee or a
 * feature reading carried forward is a value that has gone stale unnoticed,
 * whereas source at a known `sourceSha256` is the same source — the bytes are
 * immutable once deployed, and one character's difference misses.
 */
export function identiconsBySource(
  signers: readonly {
    sourceSha256: string;
    identiconHash: string | null;
  }[],
): Map<string, string> {
  const known = new Map<string, string>();
  for (const signer of signers) {
    if (signer.identiconHash) known.set(signer.sourceSha256, signer.identiconHash);
  }
  return known;
}

/**
 * The standardised source: `clarinet format` output, UTF-8.
 *
 * Null when the formatter will not take this contract. That is a real
 * possibility — the formatter is beta and these contracts come from the chain,
 * not from us — and it costs one pool its icon rather than the whole refresh.
 */
export function standardiseClaritySource(source: string): string | null {
  try {
    const formatted = execFileSync('clarinet', ['format', '--stdin'], {
      cwd: formatProject(),
      input: source,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return formatted.length > 0 ? formatted : null;
  } catch {
    return null;
  }
}

/** SHA-512/256 as lowercase hex — the seed the SIP hands to the renderer. */
export function identiconHash(standardisedSource: string): string {
  return createHash('sha512-256')
    .update(standardisedSource, 'utf8')
    .digest('hex');
}

/** Both steps: deployed source in, seed out. Null if it cannot be formatted. */
export function identiconHashOf(source: string): string | null {
  const standardised = standardiseClaritySource(source);
  return standardised === null ? null : identiconHash(standardised);
}
