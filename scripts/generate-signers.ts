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
 * Three steps, in this order: read every registered signer from the chain,
 * lay `src/data/signers-manual.json` over the result, write the file.
 *
 * The output is replaced, not merged into. An earlier version kept whatever
 * was already recorded for a contract and only appended contracts it had not
 * seen, which meant the hand-written names survived a refresh — and so did
 * every fee, read once when the pool first appeared and never again. The
 * decisions a person made now live in their own file instead, where they can
 * be read in one go, and everything else is whatever the chain said this run.
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
import { detectFeatures, type Reading } from '../src/lib/features.js';
import { profileFor } from '../src/lib/profiles.js';
import type {
  KeyRotation,
  KeyRotations,
  Signer,
  SignerData,
} from '../src/lib/types.js';
import {
  parseUint,
  serializeContractPrincipal,
  serializeUint,
} from '../src/lib/clarity.js';
import { API_URL, describeNode, nodeHeaders, SPACING_MS } from './node.js';
import { callReadOnly as callPox5 } from './pox5.js';
import {
  clarinetVersion,
  identiconHashOf,
  identiconsBySource,
} from './identicon.js';
import { humanizeContractName } from './humanize.js';
import { applyManualData, type ManualData } from './manual-data.js';
import { mergeRotations, rotationsBetween } from './key-rotations.js';
import manualSigners from '../src/data/signers-manual.json';

const manual = manualSigners as ManualData;

const OUTPUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'signers.json',
);

const ROTATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'key-rotations.json',
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What is already committed, or null on the first run. */
function readCommitted(): SignerData | null {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) as SignerData;
  } catch {
    return null;
  }
}

/** The rotation log, or an empty one for a repository that has none yet. */
function readRotations(): KeyRotation[] {
  try {
    return (JSON.parse(fs.readFileSync(ROTATIONS, 'utf8')) as KeyRotations)
      .rotations;
  } catch {
    return [];
  }
}

function writeRotations(rotations: KeyRotation[]): void {
  fs.writeFileSync(
    ROTATIONS,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), rotations }, null, 2)}\n`,
  );
}

/**
 * Ask the node, waiting out a rate limit rather than reporting ignorance.
 *
 * `init` is for the read-only calls, which are POSTs. They go through here
 * rather than calling `fetch` themselves because a 429 answered with null is
 * this script telling a reader a pool holds nothing when the node only asked
 * it to slow down — and with three readings taken per contract now instead of
 * one, an unretried limit eats three times as much.
 */
async function getJson<T>(
  url: string,
  init: RequestInit = {},
  attempts = 5,
): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: nodeHeaders(
          init.body ? { 'Content-Type': 'application/json' } : {},
        ),
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
 * Read one `uint` off a contract, wherever the source said it lives.
 *
 * Three fields come through here — the fee, the sBTC waiting for stakers, and
 * the fees taken — because the awkward part is the same for all of them: some
 * contracts publish a getter and some only hold a data var, and the node
 * answers those over different endpoints.
 *
 * Null is "could not read", never zero. Every caller passes it straight to the
 * page, which says "not known" rather than drawing a nought.
 */
async function fetchReading(
  contractId: string,
  reading: Reading,
): Promise<bigint | null> {
  const [address, name] = contractId.split('.');
  try {
    if (reading.kind === 'data-var') {
      const body = await getJson<{ data?: string }>(
        `${API_URL}/v2/data_var/${address}/${name}/${reading.name}?proof=0`,
      );
      return body?.data ? parseUint(body.data) : null;
    }

    const body = await getJson<{ okay?: boolean; result?: string }>(
      `${API_URL}/v2/contracts/call-read/${address}/${name}/${reading.name}`,
      {
        method: 'POST',
        body: JSON.stringify({ sender: address, arguments: [] }),
      },
    );
    return body?.okay && body.result ? parseUint(body.result) : null;
  } catch {
    return null;
  }
}

/** `(uint N)` as the JSON wants it, or null for a reading we could not take. */
const sats = (amount: bigint | null): string | null =>
  amount === null ? null : amount.toString();

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
  reading: Reading,
): Promise<number | null> {
  const bips = await fetchReading(contractId, reading);
  return bips === null ? null : Number(bips);
}

/** Clarity `none`, for the bond-index argument. */
const NONE = '0x09';

/**
 * Every cycle pox-5 could be holding rewards for, and which are finished with.
 *
 * Rewards are keyed by the cycle they were earned in and stay there until
 * somebody claims them, so "what is pox-5 holding for this pool" is a question
 * about all of them, not about the current one. Null when the chain would not
 * say, because a shorter list would understate what a pool is owed.
 *
 * A cycle is `settled` once every distribution in it has been computed —
 * `last-reward-compute-height` has reached its final burn block. That is what
 * makes a zero permanent: before it, a cycle reads zero because nothing has
 * been worked out yet and will read something later; after it, a zero is a
 * pool that has collected and can never be owed for that cycle again. The
 * current cycle is never settled, because its second distribution lands on its
 * last block.
 */
async function rewardCycles(currentCycle: number): Promise<{
  cycles: number[];
  settled: (cycle: number) => boolean;
} | null> {
  const answer = await callPox5('get-first-pox-5-reward-cycle', []);
  const first = answer === null ? null : parseUint(answer);
  if (first === null) return null;

  const computedTo = await readUint('get-last-reward-compute-height', []);
  if (computedTo === null) return null;

  const cycles: number[] = [];
  const lastBlock = new Map<number, bigint>();
  for (let cycle = Number(first); cycle <= currentCycle; cycle += 1) {
    cycles.push(cycle);
    // The cycle's own final block: where the next one starts, less one.
    const startsNext = await readUint('reward-cycle-to-burn-height', [
      `0x${serializeUint(cycle + 1)}`,
    ]);
    if (startsNext === null) return null;
    lastBlock.set(cycle, startsNext - 1n);
    await sleep(SPACING_MS);
  }

  return {
    cycles,
    settled: (cycle) => {
      const last = lastBlock.get(cycle);
      return last !== undefined && computedTo >= last;
    },
  };
}

/** A pox-5 read-only call that answers a uint. Null when it could not be read. */
async function readUint(fn: string, args: string[]): Promise<bigint | null> {
  const result = await callPox5(fn, args);
  return result === null ? null : parseUint(result);
}

/**
 * What pox-5 has earned for this signer and nobody has claimed, in sats.
 *
 * This is how the guide answers "has the pool claimed the last distribution?"
 * and it is asked of pox-5 rather than of the signer manager on purpose. Every
 * implementation wraps `claim-rewards` in its own way — Juice Pool calls its
 * wrapper `pox-claim-rewards` — but the money they are all reaching for is in
 * one map, and pox-5 zeroes that map when the claim lands. So one call means
 * the same thing for forty-four contracts, and no new contract can quietly
 * fall out of it by naming its function something else.
 *
 * Asked for **every cycle**, and that is the whole point. `get-earned` is keyed
 * by the cycle the rewards were earned in, so asking only about the current one
 * answers 0 for a pool sitting on an uncollected payout from the cycle before —
 * which is precisely the pool this is meant to catch. Cycle 141's second
 * distribution landed hours into cycle 142, and this page told a reader that
 * Fast Pool Max500 had collected everything while pox-5 held 22 million sats
 * for it.
 *
 * Asking about every cycle for ever would be a call per pool per cycle, so
 * each pool carries a floor — `unclaimedFromCycle` — and this asks from there.
 * See `summariseEarned` for what moves it.
 *
 * The STX leg only (`bond-index` is `none`): no protocol bonds exist on
 * mainnet, and the guide's subject is STX stacking.
 */
async function fetchUnclaimedFromPox(
  contractId: string,
  opts: {
    cycles: number[];
    settled: (cycle: number) => boolean;
    /** The earliest cycle this pool might still be owed for. */
    from: number;
  },
): Promise<{ sats: bigint; from: number } | null> {
  let signerArg: string;
  try {
    signerArg = `0x${serializeContractPrincipal(contractId)}`;
  } catch {
    return null;
  }

  const asked = opts.cycles.filter((cycle) => cycle >= opts.from);
  const readings: { cycle: number; earned: bigint }[] = [];
  for (const cycle of asked) {
    const result = await callPox5('get-earned', [
      signerArg,
      `0x${serializeUint(cycle)}`,
      NONE,
    ]);
    await sleep(SPACING_MS);
    // A cycle pox-5 will not answer for is not a cycle owed nothing, and a
    // total short by one cycle is worse than saying we do not know.
    const earned = result === null ? null : parseUint(result);
    if (earned === null) return null;
    readings.push({ cycle, earned });
  }

  return summariseEarned(readings, opts.settled, opts.from);
}

/**
 * The total owed, and the earliest cycle worth asking about next time.
 *
 * The fold rather than the reading, so the rule can be tested without a node.
 *
 * A settled cycle a pool has emptied can never owe it anything again — the
 * rewards were computed, they were claimed, and pox-5 zeroed the entry — so a
 * leading run of those is dropped and the next run starts after them. The walk
 * stops at the first cycle that is *not* both: an unsettled cycle will have
 * rewards computed into it later, and a cycle with something in it is the
 * whole reason for asking. Only a leading run is dropped, never a gap in the
 * middle, because the point is to move a floor forward and not to decide a
 * cycle is uninteresting.
 *
 * The total is still the whole of what pox-5 owes: everything below the floor
 * was read as zero on the run that set it.
 */
export function summariseEarned(
  readings: readonly { cycle: number; earned: bigint }[],
  settled: (cycle: number) => boolean,
  from: number,
): { sats: bigint; from: number } {
  let sats = 0n;
  let floor = from;
  let stillLeading = true;

  for (const reading of readings) {
    sats += reading.earned;
    if (stillLeading && reading.earned === 0n && settled(reading.cycle)) {
      floor = reading.cycle + 1;
    } else {
      stillLeading = false;
    }
  }

  return { sats, from: floor };
}

async function main() {
  /*
   * The icons, before anything is read.
   *
   * A deployed contract's source cannot change, so its identicon hash is
   * worked out once and then carried by the file itself. The formatter is
   * wanted only for source nobody has hashed — and when the version it would
   * be standardised with is not the one the committed hashes came from, in
   * which case they all go again, so the file never holds two formatters'
   * work at once.
   */
  const committed = readCommitted();
  const known = identiconsBySource(committed?.signers ?? []);
  // How far back each pool still has to be asked about. See `summariseEarned`.
  const unclaimedFrom = new Map<string, number>(
    (committed?.signers ?? []).flatMap((signer) =>
      typeof signer.unclaimedFromCycle === 'number'
        ? [[signer.contractId, signer.unclaimedFromCycle] as [string, number]]
        : [],
    ),
  );
  // When each pool was first seen, so that a pool the guide has only just
  // noticed is not confused with one that has been empty for cycles.
  const firstSeen = new Map<string, number>(
    (committed?.signers ?? []).flatMap((signer) =>
      typeof signer.firstSeenCycle === 'number'
        ? [[signer.contractId, signer.firstSeenCycle] as [string, number]]
        : [],
    ),
  );
  const formatter = clarinetVersion();
  const restandardise =
    formatter !== null &&
    committed?.standardisedWith != null &&
    committed.standardisedWith !== formatter;

  if (restandardise) {
    console.log(
      `Standardising every contract again: ${committed?.standardisedWith}` +
        ` -> ${formatter}`,
    );
    known.clear();
  } else if (formatter) {
    console.log(`Standardising new source with ${formatter}`);
  } else {
    console.log(
      'Standardising nothing: clarinet is not on PATH.' +
        ' Icons already worked out are carried forward; code nobody has' +
        ' hashed will show on the page as new.',
    );
  }

  const reused: string[] = [];
  const standardised: string[] = [];
  const unstandardised: string[] = [];

  const identiconFor = (
    contractId: string,
    sourceSha256: string,
    source: string,
  ): string | null => {
    const already = known.get(sourceSha256);
    if (already) {
      reused.push(contractId);
      return already;
    }
    if (!formatter) {
      unstandardised.push(contractId);
      return null;
    }
    const hash = identiconHashOf(source);
    if (!hash) {
      console.log(`  ! could not standardise the source of ${contractId}`);
      unstandardised.push(contractId);
      return null;
    }
    known.set(sourceSha256, hash);
    standardised.push(contractId);
    return hash;
  };

  console.log(`Reading registered signers from ${describeNode()} ...`);
  const registered = await fetchRegisteredSigners();
  const cycle = await fetchCurrentCycle();
  // Every cycle pox-5 might still be holding rewards for, read once for the
  // whole run rather than per pool.
  const pox5Cycles = await rewardCycles(cycle);
  console.log(
    `  ${registered.size} registered, cycle ${cycle} is current` +
      (pox5Cycles
        ? `, pox-5 has cycles ${pox5Cycles.cycles.join(', ')}`
        : ', and pox-5 would not say which cycles it has'),
  );

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
    // Profiles are keyed by the group hash, so a contract that was only
    // reformatted still lands in the entry it belongs to.
    const groupSha256 = await claritySourceSha256(
      strictCanonicalizeClaritySource(source),
    );
    const profile = profileFor(groupSha256);
    // Nothing to do with the three hashes above: this one is SIP-043's, taken
    // from the source as `clarinet format` standardises it, and it is what
    // makes the icon here the same icon a wallet draws.
    const identiconHash = identiconFor(contractId, sourceSha256, source);
    const features = detectFeatures(source);
    const feeBips = features.feeReading
      ? await fetchFeeBips(contractId, features.feeReading)
      : null;
    // What the contract is holding: for its stakers, and for itself.
    const undistributed = features.undistributedReading
      ? await fetchReading(contractId, features.undistributedReading)
      : null;
    const earnedFees = features.earnedFeesReading
      ? await fetchReading(contractId, features.earnedFeesReading)
      : null;
    // And what it has not collected yet, which is pox-5's answer, not its own.
    // Asked only from the cycle this pool might still be owed for: everything
    // below that was read as zero when the cycle was already settled, and a
    // settled zero cannot become anything else.
    const owed = pox5Cycles
      ? await fetchUnclaimedFromPox(contractId, {
          ...pox5Cycles,
          from: unclaimedFrom.get(contractId) ?? pox5Cycles.cycles[0] ?? cycle,
        })
      : null;
    const unclaimedFromPox = owed?.sats ?? null;

    if (!profile) unmatched.push(`${contractId}  ${groupSha256}`);

    signers.push({
      contractId,
      displayName: humanizeContractName(contractId),
      // Everything the generator can do is read the contract id. An entry in
      // signers-manual.json turns this to 'manual' when it lands.
      displayNameSource: 'contract',
      implementationName: profile?.name ?? null,
      registered: true,
      // The cycle this pool first turned up in, kept from the last run rather
      // than worked out: nothing on chain says when a signer registered, and
      // the guide's own record of when it first saw one is the honest answer
      // to "is this new". A pool the file already knows keeps its first
      // sighting whatever else about it changes.
      firstSeenCycle: firstSeen.get(contractId) ?? cycle,
      signerKey,
      sourceSha256,
      canonicalSha256,
      groupSha256,
      identiconHash,
      match: profile ? 'canonical' : 'unknown',
      profileId: profile?.id ?? null,
      bitcoinRewards: features.bitcoinRewards.value,
      openToAnyone: features.openToAnyone.value,
      feeBips,
      maxFeeBips: features.maxFeeBips,
      feeChangeNotice: features.feeChangeNotice,
      feeExemption: features.feeExemption,
      undistributedSats: sats(undistributed),
      unclaimedFromPoxSats: sats(unclaimedFromPox),
      // Bookkeeping, not a fact about the pool: where the next run starts
      // asking. Left where it was when the read failed, because a floor moved
      // on an answer nobody got would skip a cycle for good.
      unclaimedFromCycle: owed?.from ?? unclaimedFrom.get(contractId),
      earnedFeesSats: sats(earnedFees),
      evidence: {
        bitcoinRewards: features.bitcoinRewards.evidence,
        openToAnyone: features.openToAnyone.evidence,
        maxFee: features.maxFeeEvidence,
      },
    });

    await sleep(SPACING_MS);
  }

  signers.sort((a, b) => a.contractId.localeCompare(b.contractId));

  // Everything above is what the chain said. Everything a person decided is
  // in one file, and goes on last.
  const {
    signers: withManual,
    applied,
    unused,
    redundant,
  } = applyManualData(signers, manual);

  const data: SignerData = {
    generatedAt: new Date().toISOString(),
    cycle,
    // What drew the icons, which is not necessarily what ran today: a refresh
    // with no formatter carries both the hashes and the version that made
    // them. Only a run that actually standardises something changes this.
    standardisedWith: standardised.length
      ? formatter
      : (committed?.standardisedWith ?? null),
    signers: withManual,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));

  /*
   * What changed hands since the last run, appended to a log rather than
   * written into the file above.
   *
   * `signers.json` is a snapshot — everything in it is what the chain said
   * this run — and a rotation is the one thing about a pool that only exists
   * as a difference between two runs. Nothing on chain announces one, so this
   * is the only record there will ever be, and it is kept as a record: entries
   * are added and never rewritten. Everything before the day this was written
   * is recovered by scripts/backfill-key-rotations.ts, out of the commits of
   * the file above.
   */
  const rotations = rotationsBetween(committed?.signers ?? [], withManual, {
    observedAt: data.generatedAt,
    cycle,
  });
  if (rotations.length > 0) {
    const before = readRotations();
    writeRotations(mergeRotations(before, rotations));
    console.log(`\n${rotations.length} key rotation(s) recorded:`);
    for (const rotation of rotations) {
      console.log(`    ${rotation.contractId}`);
      console.log(`      ${rotation.from} -> ${rotation.to}`);
    }
  }

  console.log(
    `\nApplied ${applied.length} manual entr(y/ies) from signers-manual.json`,
  );
  for (const id of applied) console.log(`    ~ ${id}`);
  if (unused.length) {
    console.log(
      `\n  ${unused.length} manual entr(y/ies) name a contract no longer` +
        ` registered — remove them from src/data/signers-manual.json:`,
    );
    for (const id of unused) console.log(`    ? ${id}`);
  }
  if (redundant.length) {
    console.log(
      `\n  ${redundant.length} manual value(s) now match what the generator` +
        ` works out on its own — delete them, the override is done its job:`,
    );
    for (const line of redundant) console.log(`    = ${line}`);
  }

  console.log(`\nWrote ${withManual.length} signer(s) to ${OUTPUT}`);
  console.log(
    `  open to anyone: ${withManual.filter((s) => s.openToAnyone).length}` +
      `  |  Bitcoin rewards: ${withManual.filter((s) => s.bitcoinRewards).length}`,
  );
  console.log(
    `  icons: ${reused.length} carried forward, ${standardised.length}` +
      ` standardised, ${unstandardised.length} without one`,
  );
  if (unstandardised.length) {
    console.log(
      `\n  ${unstandardised.length} signer(s) run code nobody has hashed, so` +
        ` the page shows them as new rather than drawing an icon.` +
        (formatter
          ? ' The formatter would not take them:'
          : ' Install clarinet and run this again to give them one:'),
    );
    for (const id of unstandardised) console.log(`    ${id}`);
  }
  if (unmatched.length) {
    console.log(
      `\n  ${unmatched.length} signer(s) match no reviewed profile — add the` +
        ` canonical hash to src/lib/profiles.ts after reading the code:`,
    );
    for (const line of unmatched) console.log(`    ${line}`);
  }
}

// Only when run, so the pure parts above can be imported by a test.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
