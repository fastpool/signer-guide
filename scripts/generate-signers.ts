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
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalizeClaritySource,
  claritySourceSha256,
  strictCanonicalizeClaritySource,
} from '../src/lib/canonical.js';
import { detectFeatures } from '../src/lib/features.js';
import { profileFor } from '../src/lib/profiles.js';
import type { Signer, SignerData } from '../src/lib/types.js';
import { API_URL, describeNode, nodeHeaders, SPACING_MS } from './node.js';
import oldSigners from '../src/data/signers.json';

const oldSignersData = oldSigners as SignerData;

const OUTPUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'signers.json',
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, attempts = 5): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: nodeHeaders(),
        signal: AbortSignal.timeout(30_000),
      });
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

/** A Clarity `(uint N)` off the wire: 0x01 then 16 bytes big-endian. */
function parseUintHex(result: string | undefined): number | null {
  if (!result) return null;
  const hex = result.replace(/^0x/, '');
  if (!/^01[0-9a-f]{32}$/i.test(hex)) return null;
  return Number(BigInt(`0x${hex.slice(2)}`));
}

/**
 * The fee the signer charges right now, in basis points (100 = 1%).
 * Returns null when the fee is not kept in this contract at all.
 *
 * Note this is the *current* rate, not a per-cycle one. The Standard
 * contract's `get-fee-bips-for-cycle` looks like the right call and is not:
 * it reads a snapshot map written when a cycle's rewards are crystallised,
 * defaulting to u0, so before any pox-5 cycle has settled it reports every
 * pool as free however much they intend to charge.
 */
async function fetchFeeBips(
  contractId: string,
  reading: NonNullable<ReturnType<typeof detectFeatures>['feeReading']>,
): Promise<number | null> {
  const [address, name] = contractId.split('.');
  try {
    if (reading.kind === 'data-var') {
      const body = await getJson<{ data?: string }>(
        `${API_URL}/v2/data_var/${address}/${name}/${reading.name}?proof=0`,
      );
      return parseUintHex(body?.data);
    }

    const response = await fetch(
      `${API_URL}/v2/contracts/call-read/${address}/${name}/${reading.name}`,
      {
        method: 'POST',
        headers: nodeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sender: address, arguments: [] }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { okay?: boolean; result?: string };
    return body.okay ? parseUintHex(body.result) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Reading registered signers from ${describeNode()} ...`);
  const registered = await fetchRegisteredSigners();
  const cycle = await fetchCurrentCycle();
  console.log(`  ${registered.size} registered, cycle ${cycle} is current`);

  const signers: Signer[] = oldSignersData.signers;
  const unmatched: string[] = [];

  for (const [contractId, signerKey] of registered) {
    if (signers.some((s) => s.contractId === contractId)) {
      console.log(`  = skipping ${contractId} (already recorded)`);
      continue;
    }
    const source = await fetchSource(contractId);
    if (!source) {
      console.log(`  ! could not read source of ${contractId}`);
      continue;
    }

    const sourceSha256 = await claritySourceSha256(source);
    const canonicalSha256 = await claritySourceSha256(
      canonicalizeClaritySource(source),
    );
    // Profiles are keyed by the group hash, so a contract that was only
    // reformatted still lands in the entry it belongs to.
    const groupSha256 = await claritySourceSha256(
      strictCanonicalizeClaritySource(source),
    );
    const profile = profileFor(groupSha256);
    const features = detectFeatures(source);
    const feeBips = features.feeReading
      ? await fetchFeeBips(contractId, features.feeReading)
      : null;

    if (!profile) unmatched.push(`${contractId}  ${groupSha256}`);

    signers.push({
      contractId,
      displayName: humanizeContractName(contractId),
      implementationName: profile?.name ?? null,
      registered: true,
      signerKey,
      sourceSha256,
      canonicalSha256,
      groupSha256,
      match: profile ? 'canonical' : 'unknown',
      profileId: profile?.id ?? null,
      bitcoinRewards: features.bitcoinRewards.value,
      openToAnyone: features.openToAnyone.value,
      feeBips,
      maxFeeBips: features.maxFeeBips,
      feeChangeNotice: features.feeChangeNotice,
      feeExemption: features.feeExemption,
      evidence: {
        bitcoinRewards: features.bitcoinRewards.evidence,
        openToAnyone: features.openToAnyone.evidence,
        maxFee: features.maxFeeEvidence,
      },
    });

    await sleep(SPACING_MS);
  }

  signers.sort((a, b) => a.contractId.localeCompare(b.contractId));

  const data: SignerData = {
    generatedAt: new Date().toISOString(),
    cycle,
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
