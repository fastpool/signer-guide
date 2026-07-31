/**
 * Canonical form of a Clarity contract source, and the hashes taken from it.
 *
 * Deliberately the same shape as signer-sidekick's `manager-adapter.ts`, so a
 * hash produced here means the same thing there:
 * https://github.com/stx-labs/signer-sidekick/blob/main/packages/protocol/src/manager-adapter.ts
 *
 * Why two hashes:
 *  - `sourceSha256`    — the raw bytes as deployed. Reproducible by anyone:
 *      curl -s ".../v2/contracts/source/{addr}/{name}?proof=0" \
 *        | jq -r .source | sha256sum
 *  - `canonicalSha256` — after dropping comments and collapsing whitespace, so
 *    two deployments that differ only in formatting still match.
 *
 * That distinction is the whole point of the guide: most signer contracts are
 * redeployments of a handful of implementations, and the canonical hash is how
 * we tell "this is the reference contract, reviewed" from "this is something
 * we have never seen".
 */

export type SourceMatch = 'exact' | 'canonical' | 'unknown';

/**
 * Remove line comments and collapse whitespace while preserving string
 * contents. Deliberately lexical: it does not parse Clarity or attempt
 * semantic equivalence.
 */
export function canonicalizeClaritySource(source: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let pendingWhitespace = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) continue;

    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      if (pendingWhitespace && result.length > 0) result += ' ';
      pendingWhitespace = false;
      inString = true;
      result += character;
      continue;
    }

    if (character === ';' && source[index + 1] === ';') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      pendingWhitespace = true;
      continue;
    }

    if (/\s/.test(character)) {
      pendingWhitespace = true;
      continue;
    }

    if (pendingWhitespace && result.length > 0) result += ' ';
    pendingWhitespace = false;
    result += character;
  }

  if (inString) {
    throw new Error(
      'Cannot canonicalize Clarity source with an unterminated string',
    );
  }
  return result.trim();
}

/**
 * sha256 as lowercase hex. Uses Web Crypto so the same code runs in the
 * browser and in the generator script.
 */
export async function claritySourceSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface SourceHashes {
  sourceSha256: string;
  canonicalSha256: string;
}

export async function hashClaritySource(
  source: string,
): Promise<SourceHashes> {
  return {
    sourceSha256: await claritySourceSha256(source),
    canonicalSha256: await claritySourceSha256(
      canonicalizeClaritySource(source),
    ),
  };
}

/**
 * How a deployed contract relates to a reviewed one:
 *  - `exact`     byte-for-byte the reviewed contract
 *  - `canonical` the same code, formatted or commented differently
 *  - `unknown`   something we have not reviewed
 */
export function matchSource(
  deployed: SourceHashes,
  reviewed: SourceHashes,
): SourceMatch {
  if (deployed.sourceSha256 === reviewed.sourceSha256) return 'exact';
  if (deployed.canonicalSha256 === reviewed.canonicalSha256) return 'canonical';
  return 'unknown';
}
