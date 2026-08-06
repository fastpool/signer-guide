import { describe, expect, it } from 'vitest';
import { matches, type FilterId } from './App';
import data from './data/signers.json';
import totals from './data/totals.json';
import { identiconSvg, isIdenticonHash } from './lib/identicon';
import { buildTemplates } from './lib/templates';
import type { Signer, SignerData } from './lib/types';

/*
 * The filters are what a reader actually touches, and each one is a claim
 * about their money. These run against the real generated data, so a filter
 * that quietly stops matching anything shows up here rather than on the page.
 */

const signers = (data as SignerData).signers;
const withFilter = (...ids: FilterId[]) =>
  signers.filter((s) => matches(s, new Set(ids)));

const base: Signer = {
  contractId: 'SP000.test',
  displayName: 'Test',
  implementationName: null,
  registered: true,
  sourceSha256: 'a',
  canonicalSha256: 'b',
  groupSha256: 'c',
  identiconHash: null,
  match: 'unknown',
  profileId: null,
  bitcoinRewards: false,
  openToAnyone: false,
  feeBips: null,
  maxFeeBips: null,
  feeChangeNotice: null,
  feeExemption: null,
  evidence: {
    bitcoinRewards: null,
    openToAnyone: null,
    maxFee: null,
  },
};

describe('filters', () => {
  it('shows everything when nothing is picked', () => {
    expect(withFilter()).toHaveLength(signers.length);
  });

  it('keeps only pools whose contract delays a fee change', () => {
    const shown = withFilter('feeNotice');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((s) => s.feeChangeNotice)).toBe(true);
    // Both shapes: Juice Pool counts in blocks, Fast Pool's max500 in cycles.
    const ids = shown.map((s) => s.contractId);
    expect(ids).toContain(
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer',
    );
    expect(ids).toContain(
      'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager',
    );
    // Which units appear, not how many pools carry each: a pool registering
    // is not a regression, a unit the page cannot word is.
    expect(new Set(shown.map((s) => s.feeChangeNotice?.unit))).toEqual(
      new Set(['blocks', 'cycles']),
    );
  });

  it('does not let a fee ceiling stand in for notice of a change', () => {
    // Different promises: a cap bounds how bad it gets, notice buys you time.
    expect(matches({ ...base, maxFeeBips: 2000 }, new Set(['feeNotice']))).toBe(
      false,
    );
    expect(
      matches(
        {
          ...base,
          feeChangeNotice: { amount: 144, unit: 'blocks', evidence: '…' },
        },
        new Set(['cappedFee']),
      ),
    ).toBe(false);
  });

  it('combines filters, so picking two narrows rather than widens', () => {
    const both = withFilter('feeNotice', 'open');
    expect(both.length).toBeLessThanOrEqual(withFilter('feeNotice').length);
    expect(both.every((s) => s.openToAnyone)).toBe(true);
  });

  it('leaves out a pool with no fee of its own rather than calling it cheap', () => {
    expect(matches(base, new Set(['lowFee']))).toBe(false);
  });
});

/*
 * The amounts are generated from the signer list, in the same run, so the two
 * files should always agree. If they ever do not, the page shows a pool with
 * no amount beside it for an hour, and this says so first.
 */
describe('the committed amounts', () => {
  it('covers every pool the page will list', () => {
    const missing = signers
      .map((s) => s.contractId)
      .filter((id) => !(id in totals.ustx));
    expect(missing).toEqual([]);
  });

  it('holds a cycle and uSTX counts, never a number a reader cannot trust', () => {
    expect(totals.cycle).toBeGreaterThan(0);
    const amounts: (string | null)[] = Object.values(totals.ustx);
    for (const amount of amounts) {
      // Null is "we could not read it" and is allowed. Anything else has to
      // be a plain uSTX count: the page does BigInt arithmetic on these.
      if (amount !== null) expect(amount).toMatch(/^\d+$/);
    }
  });
});

/*
 * The icons are drawn from what is committed, so a hash the renderer would
 * refuse is a blank space on the page — or, where a heading holds one, a
 * thrown error. Cheaper to find here.
 */
describe('the committed identicons', () => {
  it('gives every pool a hash to draw from, or says it has none', () => {
    // Null is "the formatter would not take this contract" and is allowed:
    // that pool keeps its name and badges and simply shows no icon.
    for (const signer of signers) {
      expect(
        signer.identiconHash === null || isIdenticonHash(signer.identiconHash),
        `${signer.contractId}: ${signer.identiconHash}`,
      ).toBe(true);
    }
  });

  it('has not quietly stopped computing them', () => {
    // Every pool at null would pass the test above while leaving the page
    // with no icons at all.
    expect(signers.some((s) => s.identiconHash !== null)).toBe(true);
  });

  it('draws the icon of every contract the page gives a page to', () => {
    for (const template of buildTemplates(signers)) {
      if (template.identiconHash === null) continue;
      expect(() => identiconSvg(template.identiconHash!)).not.toThrow();
    }
  });
});
