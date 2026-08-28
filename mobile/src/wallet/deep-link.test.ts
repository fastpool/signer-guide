import { watchAddressFromUrl, watchUrlFor } from './deep-link';

const ADDRESS = 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR';

/*
 * A link that can only ever show somebody a public fact about the chain.
 *
 * The tests below are mostly about what it will *not* do: a link is a thing
 * that arrives from outside, and one that could connect a wallet, prefill an
 * amount or choose a pool would be a link that could be sent to somebody with
 * intent. This one carries an address and nothing else.
 */

describe('watchAddressFromUrl', () => {
  it('reads the address out of the app’s own scheme', () => {
    expect(watchAddressFromUrl(`signerguide://watch/${ADDRESS}`)).toBe(ADDRESS);
  });

  it('takes a contract principal too, since a contract can stake', () => {
    expect(
      watchAddressFromUrl('signerguide://watch/SMEVJTEWM9AE521B8E3HWQTHQR0WAPASHATZTA6Y'),
    ).toBe('SMEVJTEWM9AE521B8E3HWQTHQR0WAPASHATZTA6Y');
  });

  it('normalises case, because an address is upper case', () => {
    expect(watchAddressFromUrl(`signerguide://watch/${ADDRESS.toLowerCase()}`)).toBe(
      ADDRESS,
    );
  });

  it('ignores a query string or fragment hung off the end', () => {
    expect(watchAddressFromUrl(`signerguide://watch/${ADDRESS}?from=twitter`)).toBe(
      ADDRESS,
    );
  });

  it('refuses anything that is not a Stacks address', () => {
    expect(watchAddressFromUrl('signerguide://watch/../../etc/passwd')).toBeNull();
    expect(watchAddressFromUrl('signerguide://watch/<script>')).toBeNull();
    expect(watchAddressFromUrl('signerguide://watch/')).toBeNull();
  });

  it('understands no other path, and no other scheme', () => {
    // Nothing here can stake, sign, choose a pool or connect a wallet.
    expect(watchAddressFromUrl(`signerguide://stake/${ADDRESS}`)).toBeNull();
    expect(watchAddressFromUrl(`signerguide://connect/${ADDRESS}`)).toBeNull();
    expect(watchAddressFromUrl(`https://signer-guide.fastpool.org/watch/${ADDRESS}`))
      .toBeNull();
    expect(watchAddressFromUrl(`wc://watch/${ADDRESS}`)).toBeNull();
  });

  it('is nothing at all when the app was not opened on a link', () => {
    expect(watchAddressFromUrl(null)).toBeNull();
    expect(watchAddressFromUrl('')).toBeNull();
  });
});

describe('watchUrlFor', () => {
  it('round-trips', () => {
    expect(watchAddressFromUrl(watchUrlFor(ADDRESS))).toBe(ADDRESS);
  });
});
