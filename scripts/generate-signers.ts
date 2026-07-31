/**
 * Builds src/data/signers.json for the guide.
 *
 * For every signer registered on pox-5 it records:
 *  - the raw and canonical source hashes (see src/lib/canonical.ts)
 *  - which reviewed implementation it matches, if any
 *  - what the contract itself allows (Bitcoin rewards, open to anyone), with
 *    the line of Clarity each decision came from
 *  - the fee in force right now, read live
 *
 * The fee is read rather than derived on purpose: no implementation caps it
 * below 100%, so it is a current value, not a promise. Anything the contract
 * does not guarantee is not presented as a guarantee.
 *
 * Usage: npx tsx scripts/generate-signers.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeClaritySource, claritySourceSha256 } from '../src/lib/canonical.js';
import { detectFeatures } from '../src/lib/features.js';
import { profileFor } from '../src/lib/profiles.js';
import type { Signer, SignerData } from '../src/lib/types.js';

const API_URL = process.env.STACKS_API_URL ?? 'https://api.hiro.so';
const OUTPUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'signers.json',
);

// The node allows roughly 50 requests a minute per IP.
const SPACING_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, attempts = 5): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) return (await response.json()) as T;
      if (response.status === 429 || response.status >= 500) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      return null;
    } catch {
      await sleep(3_000 * (attempt + 1));
    }
  }
  return null;
}

async function fetchRegisteredSigners(): Promise<Map<string, string>> {
  const signers = new Map<string, string>();
  let cursor: string | null = null;

  do {
    const url = new URL(`${API_URL}/extended/v3/staking/signers`);
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('cursor', cursor);

    const page = await getJson<{
      results: { signer: string; signer_key: string }[];
      cursor?: { next: string | null };
    }>(url.toString());
    if (!page) break;

    for (const entry of page.results ?? []) {
      signers.set(entry.signer, entry.signer_key);
    }
    cursor = page.cursor?.next ?? null;
    await sleep(SPACING_MS);
  } while (cursor);

  return signers;
}

async function fetchSource(contractId: string): Promise<string | null> {
  const [address, name] = contractId.split('.');
  const result = await getJson<{ source?: string }>(
    `${API_URL}/v2/contracts/source/${address}/${name}?proof=0`,
  );
  return result?.source ?? null;
}

async function fetchCurrentCycle(): Promise<number> {
  const pox = await getJson<{ current_cycle: { id: number } }>(
    `${API_URL}/v2/pox`,
  );
  return pox?.current_cycle.id ?? 0;
}

/**
 * A readable name for the pool from its contract name: drop the plumbing
 * words every one of them carries, and title-case the rest.
 *   signer-manager-hiro        -> Hiro
 *   fastpool-1-signer-manager  -> Fastpool 1
 *   native-pool-signer-manager -> Native Pool
 * Falls back to the raw contract name when nothing distinctive is left.
 */
export function humanizeContractName(contractId: string): string {
  const name = contractId.split('.')[1] ?? contractId;
  const words = name
    .split('-')
    .filter((word) => !['signer', 'manager'].includes(word));
  if (words.length === 0) return name;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Hex-encode a Clarity `(uint N)` argument for the read-only call. */
function uintArg(value: number): string {
  return `0x01${value.toString(16).padStart(32, '0')}`;
}

/**
 * The fee the signer charges for `cycle`, in basis points (100 = 1%).
 * Returns null when the contract has no fee call at all.
 */
async function fetchFeeBips(
  contractId: string,
  cycle: number,
): Promise<number | null> {
  const [address, name] = contractId.split('.');
  try {
    const response = await fetch(
      `${API_URL}/v2/contracts/call-read/${address}/${name}/get-fee-bips-for-cycle`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: address,
          // (uint cycle) and (optional uint) = none
          arguments: [uintArg(cycle), '0x09'],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { okay?: boolean; result?: string };
    if (!body.okay || !body.result) return null;
    // (uint N) -> 0x01 followed by a 16-byte big-endian value
    const hex = body.result.replace(/^0x/, '');
    if (!hex.startsWith('01')) return null;
    return Number(BigInt(`0x${hex.slice(2)}`));
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Reading registered signers from ${API_URL} ...`);
  const registered = await fetchRegisteredSigners();
  const feeCycle = await fetchCurrentCycle();
  console.log(`  ${registered.size} registered, reading fees for cycle ${feeCycle}`);

  const signers: Signer[] = [];
  const unmatched: string[] = [];

  for (const [contractId, signerKey] of registered) {
    const source = await fetchSource(contractId);
    if (!source) {
      console.log(`  ! could not read source of ${contractId}`);
      continue;
    }

    const sourceSha256 = await claritySourceSha256(source);
    const canonicalSha256 = await claritySourceSha256(
      canonicalizeClaritySource(source),
    );
    const profile = profileFor(canonicalSha256);
    const features = detectFeatures(source);
    const feeBips = features.hasFeeFunction
      ? await fetchFeeBips(contractId, feeCycle)
      : null;

    if (!profile) unmatched.push(`${contractId}  ${canonicalSha256}`);

    signers.push({
      contractId,
      displayName: humanizeContractName(contractId),
      implementationName: profile?.name ?? null,
      registered: true,
      signerKey,
      sourceSha256,
      canonicalSha256,
      match: profile ? 'canonical' : 'unknown',
      profileId: profile?.id ?? null,
      bitcoinRewards: features.bitcoinRewards.value,
      openToAnyone: features.openToAnyone.value,
      feeBips,
      evidence: {
        bitcoinRewards: features.bitcoinRewards.evidence,
        openToAnyone: features.openToAnyone.evidence,
      },
    });

    await sleep(SPACING_MS);
  }

  signers.sort((a, b) => a.contractId.localeCompare(b.contractId));

  const data: SignerData = {
    generatedAt: new Date().toISOString(),
    feeCycle,
    signers,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));

  console.log(`\nWrote ${signers.length} signer(s) to ${OUTPUT}`);
  console.log(
    `  open to anyone: ${signers.filter((s) => s.openToAnyone).length}` +
      `  |  Bitcoin rewards: ${signers.filter((s) => s.bitcoinRewards).length}`,
  );
  if (unmatched.length) {
    console.log(
      `\n  ${unmatched.length} signer(s) match no reviewed profile — add the` +
        ` canonical hash to src/lib/profiles.ts after reading the code:`,
    );
    for (const line of unmatched) console.log(`    ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
