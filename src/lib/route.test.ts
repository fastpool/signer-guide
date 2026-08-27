import { describe, expect, it } from 'vitest';
import {
  contractHref,
  parseHash,
  signerHref,
  statusHref,
  stxOnlyRewardsHref,
} from './route';

/*
 * The hash is the one part of the page a stranger can hand somebody a link to,
 * and the signer route puts what it reads into the path of a fetch. So the
 * tests that matter here are the ones about what it refuses.
 */

const MAX500 =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';
const ADDRESS = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const STAKING_CONTRACT =
  'SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X.ccd014-pox5-staking-mia';

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

  it('reads the STX-only rewards route', () => {
    expect(parseHash('#/rewards/stx-only')).toEqual({
      name: 'stxOnlyRewards',
    });
  });

  it('tells the payout history from the estimate it hangs off', () => {
    // One hash is a prefix of the other, and getting that order wrong lands a
    // reader on the estimate whichever link they followed.
    expect(parseHash('#/rewards/stx-only/history')).toEqual({
      name: 'stxOnlyHistory',
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

  it('reads the bare status route as the empty box', () => {
    expect(parseHash('#/status')).toEqual({ name: 'status', principals: [] });
    expect(parseHash('#/status/')).toEqual({ name: 'status', principals: [] });
  });

  it('reads one address, and a contract, out of the path', () => {
    expect(parseHash(`#/status/${ADDRESS}`)).toEqual({
      name: 'status',
      principals: [ADDRESS],
    });
    expect(parseHash(`#/status/${STAKING_CONTRACT}`)).toEqual({
      name: 'status',
      principals: [STAKING_CONTRACT],
    });
  });

  it('carries a whole list in one link', () => {
    expect(parseHash(`#/status/${ADDRESS},${STAKING_CONTRACT}`)).toEqual({
      name: 'status',
      principals: [ADDRESS, STAKING_CONTRACT],
    });
  });

  it('drops anything in the list that is not a principal', () => {
    // These go into the path of a request, and a link handed to somebody is
    // exactly where an unchecked string should not be trusted. Dropping the
    // bad ones leaves a page that still works for the good ones.
    expect(parseHash(`#/status/${ADDRESS},../../etc/passwd,%2e%2e`)).toEqual({
      name: 'status',
      principals: [ADDRESS],
    });
    expect(parseHash('#/status/nonsense')).toEqual({
      name: 'status',
      principals: [],
    });
  });

  it('survives a status hash that is not valid percent-encoding', () => {
    expect(() => parseHash('#/status/%')).not.toThrow();
    expect(parseHash('#/status/%')).toEqual({ name: 'list' });
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
    expect(parseHash(statusHref([ADDRESS, STAKING_CONTRACT]))).toEqual({
      name: 'status',
      principals: [ADDRESS, STAKING_CONTRACT],
    });
    expect(parseHash(statusHref())).toEqual({ name: 'status', principals: [] });
    expect(parseHash(stxOnlyRewardsHref())).toEqual({
      name: 'stxOnlyRewards',
    });
  });
});
