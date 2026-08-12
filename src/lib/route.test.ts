import { describe, expect, it } from 'vitest';
import { contractHref, parseHash, signerHref } from './route';

/*
 * The hash is the one part of the page a stranger can hand somebody a link to,
 * and the signer route puts what it reads into the path of a fetch. So the
 * tests that matter here are the ones about what it refuses.
 */

const MAX500 =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';

describe('parseHash', () => {
  it('reads the list for anything it does not recognise', () => {
    expect(parseHash('')).toEqual({ name: 'list' });
    expect(parseHash('#/')).toEqual({ name: 'list' });
    expect(parseHash('#/nonsense')).toEqual({ name: 'list' });
  });

  it('reads a signer contract by profile id', () => {
    expect(parseHash('#/contract/standard')).toEqual({
      name: 'contract',
      profileId: 'standard',
    });
  });

  it('reads a deployed pool by contract id', () => {
    expect(parseHash(`#/signer/${MAX500}`)).toEqual({
      name: 'signer',
      contractId: MAX500,
    });
  });

  it('takes a contract id that arrived percent-encoded', () => {
    // A `.` needs no encoding, but plenty of things that share links encode it
    // anyway, and a reader should not land on the list for it.
    expect(parseHash(`#/signer/${encodeURIComponent(MAX500)}`)).toEqual({
      name: 'signer',
      contractId: MAX500,
    });
  });

  it('refuses anything that is not a contract id', () => {
    // Each of these would otherwise reach `fetch` as part of a path. A traversal
    // is the one that matters: `signers/../../something.json` is a request this
    // page has no business making.
    for (const hash of [
      '#/signer/../../etc/passwd',
      '#/signer/%2e%2e%2f%2e%2e%2fsecret',
      '#/signer/SP123',
      '#/signer/SP123.contract/extra',
      '#/signer/https://example.com/x.json',
      '#/signer/',
    ]) {
      expect(parseHash(hash), hash).toEqual({ name: 'list' });
    }
  });

  it('survives a hash that is not valid percent-encoding', () => {
    // `decodeURIComponent('%')` throws, and a malformed hash is a page that
    // does not render at all rather than one that shows the list.
    expect(() => parseHash('#/signer/%')).not.toThrow();
    expect(parseHash('#/signer/%')).toEqual({ name: 'list' });
  });

  it('round-trips the hrefs it hands out', () => {
    expect(parseHash(signerHref(MAX500))).toEqual({
      name: 'signer',
      contractId: MAX500,
    });
    expect(parseHash(contractHref('standard'))).toEqual({
      name: 'contract',
      profileId: 'standard',
    });
  });
});
