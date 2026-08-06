import { describe, expect, it } from 'vitest';
import {
  identiconHash,
  identiconHashOf,
  identiconsBySource,
  standardiseClaritySource,
} from './identicon.js';

/*
 * The identicon hash is only worth having if it is the same number everyone
 * else computes, so what is tested here is agreement with things outside this
 * repo: the published SHA-512/256 vector, and what the formatter does to
 * source that differs only in how it is laid out.
 */

const hasClarinet = standardiseClaritySource('(define-read-only (a) u1)');

describe('identiconHash', () => {
  it('is SHA-512/256, not SHA-256 and not SHA-512', () => {
    // FIPS 180-4 §5.3.6's own vector for "abc". Clarity's `sha512/256` is the
    // same function, which is what lets a contract state its own hash.
    expect(identiconHash('abc')).toBe(
      '53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23',
    );
  });

  it('hashes the UTF-8 bytes', () => {
    expect(identiconHash(';; ü\n')).toBe(
      identiconHash(Buffer.from(';; ü\n', 'utf8').toString('utf8')),
    );
    expect(identiconHash('a')).not.toBe(identiconHash('a\n'));
  });
});

describe('identiconsBySource', () => {
  const entry = (sourceSha256: string, identiconHash: string | null) => ({
    sourceSha256,
    identiconHash,
  });

  it('keys on the deployed bytes, so the same source is one entry', () => {
    // Twenty pools deploy the Standard contract; the formatter has one
    // contract's work to do, not twenty.
    const known = identiconsBySource([
      entry('aaa', 'hash-1'),
      entry('aaa', 'hash-1'),
      entry('bbb', 'hash-2'),
    ]);
    expect(known.size).toBe(2);
    expect(known.get('aaa')).toBe('hash-1');
  });

  it('carries nothing forward for source that has no hash', () => {
    // Otherwise a null would be remembered as an answer, and the contract
    // would never be standardised on a run that could have done it.
    const known = identiconsBySource([entry('aaa', null)]);
    expect(known.has('aaa')).toBe(false);
  });
});

describe.skipIf(!hasClarinet)('standardiseClaritySource', () => {
  const CONTRACT = '(define-read-only (answer) (ok u42))\n';

  it('gives the same bytes for source that differs only in layout', () => {
    // The whole reason the icon is taken from the standardised source: this
    // pair is one contract, and a reader should not be shown two.
    const spread = '(define-read-only  (answer)\n    (ok   u42))\n';
    expect(standardiseClaritySource(spread)).toBe(
      standardiseClaritySource(CONTRACT),
    );
    expect(identiconHashOf(spread)).toBe(identiconHashOf(CONTRACT));
  });

  it('keeps comments, which are part of the source it hashes', () => {
    const commented = `;; who wrote this matters\n${CONTRACT}`;
    expect(identiconHashOf(commented)).not.toBe(identiconHashOf(CONTRACT));
  });

  it('ends in a newline and uses LF', () => {
    const standardised = standardiseClaritySource(CONTRACT);
    expect(standardised?.endsWith('\n')).toBe(true);
    expect(standardised).not.toContain('\r');
  });

  it('gives no hash for source it cannot read, rather than a wrong one', () => {
    expect(identiconHashOf('(define-read-only (answer)')).toBeNull();
  });
});

if (!hasClarinet) {
  // Not silent: without the formatter the hash above is the only half of this
  // that ran, and the half that ties the number to other implementations did
  // not. See scripts/identicon.ts for where to get it.
  console.warn(
    'clarinet is not on PATH — the standardisation tests did not run.',
  );
}
