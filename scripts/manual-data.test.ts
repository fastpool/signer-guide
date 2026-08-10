import { describe, expect, it } from 'vitest';
import signersData from '../src/data/signers.json';
import manualSigners from '../src/data/signers-manual.json';
import type { Signer, SignerData } from '../src/lib/types.js';
import { applyManualData, type ManualData } from './manual-data.js';
import { humanizeContractName } from './humanize.js';

const signer = (contractId: string, over: Partial<Signer> = {}): Signer =>
  ({
    contractId,
    displayName: 'Generated',
    implementationName: null,
    registered: true,
    feeBips: 500,
    ...over,
  }) as Signer;

describe('applyManualData', () => {
  it('lays the manual value over the generated one', () => {
    const { signers, applied } = applyManualData([signer('SP1.a')], {
      'SP1.a': { displayName: 'Senseinode' },
    });

    expect(signers[0].displayName).toBe('Senseinode');
    expect(applied).toEqual(['SP1.a']);
  });

  it('leaves everything the entry does not mention', () => {
    const { signers } = applyManualData([signer('SP1.a', { feeBips: 700 })], {
      'SP1.a': { displayName: 'Senseinode' },
    });

    // The whole point: an override names one field, not a whole record, so a
    // fee read this morning is still the fee that gets written.
    expect(signers[0].feeBips).toBe(700);
  });

  it('leaves a contract with no entry alone', () => {
    const { signers, applied } = applyManualData([signer('SP1.a')], {
      'SP2.b': { displayName: 'Elsewhere' },
    });

    expect(signers[0].displayName).toBe('Generated');
    expect(applied).toEqual([]);
  });

  it('reports entries for contracts that are not there', () => {
    // A pool that deregistered. Silence would leave the entry in the file for
    // years, looking like it still did something.
    const { unused } = applyManualData([signer('SP1.a')], {
      'SP1.a': { displayName: 'Here' },
      'SP9.gone': { displayName: 'Not here' },
    });

    expect(unused).toEqual(['SP9.gone']);
  });

  it('does not treat the note as a value to write', () => {
    const { signers, applied } = applyManualData([signer('SP1.a')], {
      'SP1.a': { note: 'why this is here' },
    });

    expect(signers[0]).not.toHaveProperty('note');
    // Nothing was overridden, so nothing is reported as overridden.
    expect(applied).toEqual([]);
  });

  it('refuses to let an entry rename the contract it is keyed by', () => {
    const { signers } = applyManualData([signer('SP1.a')], {
      'SP1.a': {
        contractId: 'SP9.elsewhere',
        displayName: 'X',
      } as ManualData[string],
    });

    expect(signers[0].contractId).toBe('SP1.a');
  });

  it('reports an override that matches what was generated', () => {
    const { redundant } = applyManualData(
      [signer('SP1.a', { displayName: 'Same', feeBips: 100 })],
      { 'SP1.a': { displayName: 'Same' } },
    );

    expect(redundant).toEqual(['SP1.a: displayName']);
  });

  it('does not call a real override redundant', () => {
    const { redundant } = applyManualData([signer('SP1.a')], {
      'SP1.a': { displayName: 'Different' },
    });

    expect(redundant).toEqual([]);
  });

  it('records that a name it wrote came from a person', () => {
    const { signers } = applyManualData(
      [signer('SP1.a', { displayNameSource: 'contract' })],
      { 'SP1.a': { displayName: 'Senseinode' } },
    );

    expect(signers[0].displayNameSource).toBe('manual');
  });

  it('leaves the name a reading of the contract when the entry says nothing about it', () => {
    // A feature override is not a name confirmation. Marking it as one would
    // put a tick on the page next to a string the generator invented.
    const { signers } = applyManualData(
      [signer('SP1.a', { displayNameSource: 'contract' })],
      { 'SP1.a': { bitcoinRewards: true } },
    );

    expect(signers[0].displayName).toBe('Generated');
    expect(signers[0].displayNameSource).toBe('contract');
  });

  it('refuses to let an entry claim a name was confirmed', () => {
    // The tick says a person decided this name. An entry that could set the
    // field directly could claim that without anyone having decided anything.
    const { signers } = applyManualData(
      [signer('SP1.a', { displayNameSource: 'contract' })],
      {
        'SP1.a': { displayNameSource: 'manual' } as ManualData[string],
      },
    );

    expect(signers[0].displayNameSource).toBe('contract');
  });

  it('does not mutate what it was given', () => {
    const generated = [signer('SP1.a')];
    applyManualData(generated, { 'SP1.a': { displayName: 'Senseinode' } });

    expect(generated[0].displayName).toBe('Generated');
  });
});

/*
 * The committed file, checked against the committed data.
 *
 * `signers.json` is rewritten from the chain every hour, so an entry here can
 * stop doing anything without anyone touching it — the pool deregisters, or
 * the generator learns to work the name out on its own. Either way the entry
 * should go, and nobody is going to notice unaided.
 */
describe('src/data/signers-manual.json', () => {
  const manual = manualSigners as ManualData;
  const { signers } = signersData as SignerData;

  it('only names contracts that are actually registered', () => {
    const { unused } = applyManualData(signers, manual);
    expect(unused).toEqual([]);
  });

  it('says why, for every entry', () => {
    for (const [id, entry] of Object.entries(manual)) {
      expect(entry.note, `${id} has no note`).toBeTruthy();
    }
  });

  it('never writes a fee, a hash or a profile by hand', () => {
    // A name is ours to decide, and a feature reading may be corrected where a
    // detector is known to be wrong about one contract. A fee changes under
    // us, and a hash or a profile is the identity of the code itself — a value
    // written here would go on being stated as fact long after it stopped
    // being true.
    const NEVER = [
      'feeBips',
      'maxFeeBips',
      'feeChangeNotice',
      'feeExemption',
      'sourceSha256',
      'canonicalSha256',
      'groupSha256',
      'identiconHash',
      'profileId',
      'implementationName',
      'match',
      'signerKey',
      // Not a value at all but a record of where displayName came from, which
      // only applyManualData is in a position to know.
      'displayNameSource',
    ];
    for (const [id, entry] of Object.entries(manual)) {
      for (const key of NEVER) {
        expect(key in entry, `${id} writes ${key} by hand`).toBe(false);
      }
    }
  });

  /*
   * There is no test here that the entries are still needed, and it is worth
   * saying why rather than leaving the gap to look like an oversight.
   *
   * `signers.json` is what came out *after* these were applied, so comparing
   * the two would find every entry equal to its own result and call all of
   * them redundant. Only the generator holds the record as the chain gave it,
   * so only the generator can tell — it prints `redundant` at the end of every
   * run, and the hourly job puts that in the log.
   *
   * The name case is checkable without the chain, and is checked below.
   */

  it('is only needed where the generated name is wrong', () => {
    // Guards against an entry that repeats what the generator already does,
    // which would look like a decision and be a no-op.
    for (const [id, entry] of Object.entries(manual)) {
      if (entry.displayName === undefined) continue;
      expect(entry.displayName, `${id} restates the generated name`).not.toBe(
        humanizeContractName(id),
      );
    }
  });
});
