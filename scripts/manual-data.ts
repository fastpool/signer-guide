/**
 * What a person decided, kept apart from what the chain said.
 *
 * `src/data/signers.json` is now written from scratch on every refresh. That
 * is the point: a generated file that is also edited by hand cannot be read,
 * because nothing in it says which of the two put a value there.
 *
 * So the hand-decided parts live in `src/data/signers-manual.json`, keyed by
 * contract id, and are laid over the generated record afterwards. To see
 * everything anyone has decided about the pools, read that one short file.
 *
 * Only for things the generator cannot get right on its own. A name is the
 * usual case: a contract called `signer-manager-pox5` is run by Senseinode,
 * and no amount of reading the code will say so.
 *
 * A feature reading is the harder case, and is allowed where a detector is
 * known to be wrong about a specific contract — but it is a claim on the page
 * that the code is no longer being asked about, so it needs a `note` saying
 * who confirmed it. When the detector is fixed the entry becomes a no-op, and
 * `redundant` below is what makes that visible instead of leaving it to sit
 * there looking load-bearing.
 *
 * A fee is the one thing never to put here. It changes under us, and a value
 * written by hand would go on being stated as fact long after it stopped
 * being true.
 */

import type { Signer } from '../src/lib/types.js';

/**
 * An override for one contract.
 *
 * `note` is not applied — it is there so the file says *why*, next to the
 * value, rather than in a commit message nobody will find again.
 *
 * Overrides are shallow: giving `evidence` replaces the whole object rather
 * than merging into it.
 */
export type ManualSigner = Partial<Omit<Signer, 'contractId'>> & {
  note?: string;
};

/** The file's shape: contract id to what was decided about it. */
export type ManualData = Record<string, ManualSigner>;

export type ManualResult = {
  signers: Signer[];
  /** Contract ids that were overridden, in the order they appear. */
  applied: string[];
  /**
   * Entries naming a contract that is not in the generated data.
   *
   * Usually a pool that has deregistered, or a typo in a contract id. Either
   * way the entry is doing nothing, and silence would leave it there for
   * years — so the caller is told and can print it.
   */
  unused: string[];
  /**
   * Fields whose manual value is what the generator already produced, as
   * `contract id: field`.
   *
   * The way an override stops being needed. A detector learns to read a
   * contract it used to misread, and the hand-written value it was there to
   * correct silently becomes a copy of the generated one — still looking like
   * somebody's decision. Reported so it can be deleted.
   */
  redundant: string[];
};

/**
 * Lays the manual entries over the generated ones.
 *
 * Returns new objects rather than mutating: the caller compares the two in
 * places, and an override that quietly changed the generated record would
 * make that comparison meaningless.
 */
/**
 * `note` documents the entry rather than being part of it. `contractId` is the
 * key the entry is filed under, so letting it through would let an override
 * rename the thing it is keyed by. `displayNameSource` records whether a name
 * was decided here, so an entry that could set it could claim a name was
 * confirmed by a person when nobody confirmed anything.
 */
const NOT_OVERRIDES = new Set(['note', 'contractId', 'displayNameSource']);

export function applyManualData(
  signers: Signer[],
  manual: ManualData,
): ManualResult {
  const applied: string[] = [];
  const redundant: string[] = [];

  const next = signers.map((signer) => {
    const entry = manual[signer.contractId];
    if (!entry) return signer;

    const overrides = Object.fromEntries(
      Object.entries(entry).filter(([key]) => !NOT_OVERRIDES.has(key)),
    ) as Partial<Signer>;
    if (Object.keys(overrides).length === 0) return signer;

    for (const [key, value] of Object.entries(overrides)) {
      const generated = (signer as unknown as Record<string, unknown>)[key];
      // Compared as JSON so a nested override is judged by what it says, not
      // by which object it happens to be.
      if (JSON.stringify(generated) === JSON.stringify(value)) {
        redundant.push(`${signer.contractId}: ${key}`);
      }
    }

    applied.push(signer.contractId);
    // Setting the name here is what makes it a person's, so the record says so
    // rather than leaving the page to guess from the string itself. Derived
    // from the override actually being present, not written in the entry — see
    // NOT_OVERRIDES above for why an entry may not claim this for itself.
    const source: Partial<Signer> =
      overrides.displayName === undefined
        ? {}
        : { displayNameSource: 'manual' };
    return { ...signer, ...overrides, ...source };
  });

  const known = new Set(signers.map((signer) => signer.contractId));
  const unused = Object.keys(manual).filter((id) => !known.has(id));

  return { signers: next, applied, unused, redundant };
}
