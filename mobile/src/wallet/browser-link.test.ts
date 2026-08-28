import {
  BROWSER_WALLETS,
  GUIDE_URL,
  guideUrlFor,
  walletBrowserUrl,
} from './browser-link';

/*
 * The links below were fired at a real device with both wallets installed:
 * Leather opened its in-app browser on the guide, Xverse opened on its lock
 * screen. What is tested here is the shape — that the URL survives being put
 * inside another URL, which is the part that breaks silently.
 */

describe('walletBrowserUrl', () => {
  it('sends Leather to its own scheme', () => {
    expect(walletBrowserUrl('leather', 'https://example.org')).toBe(
      'leather://browser?url=https%3A%2F%2Fexample.org',
    );
  });

  it('sends Xverse to the app link it verifies, not the deprecated scheme', () => {
    const link = walletBrowserUrl('xverse', 'https://example.org');
    expect(link).toBe(
      'https://connect.xverse.app/browser?url=https%3A%2F%2Fexample.org',
    );
    expect(link).not.toMatch(/^xverse:/);
  });

  it('escapes the page, which carries characters a query string would eat', () => {
    const link = walletBrowserUrl('leather', 'https://example.org/#/pool/SP1.a?b=c');
    expect(link).not.toContain('#');
    expect(link).not.toContain('?b=');
    expect(decodeURIComponent(link!.split('url=')[1])).toBe(
      'https://example.org/#/pool/SP1.a?b=c',
    );
  });

  it('has nothing to offer for a wallet with no browser of its own', () => {
    // OKX has one, but no documented link to it; "any" is not a wallet at all.
    expect(walletBrowserUrl('okx', GUIDE_URL)).toBeNull();
    expect(walletBrowserUrl('any', GUIDE_URL)).toBeNull();
  });

  it('offers exactly the wallets it has a link for', () => {
    for (const id of BROWSER_WALLETS) {
      expect(walletBrowserUrl(id, GUIDE_URL)).not.toBeNull();
    }
  });

  it('opens the guide, which is the page that can actually sign', () => {
    expect(GUIDE_URL).toMatch(/^https:\/\//);
  });
});

describe('guideUrlFor', () => {
  /*
   * Handing every route the guide's front page hands somebody who was two taps
   * into choosing a pool a list of forty-five of them and asks them to start
   * again. The hash routes are the site's own, so a route that moves there
   * moves here.
   */
  it('opens the guide itself when there is nothing more specific', () => {
    expect(guideUrlFor({ kind: 'guide' })).toBe(GUIDE_URL);
  });

  it('opens the pool somebody was looking at', () => {
    expect(
      guideUrlFor({ kind: 'pool', contractId: 'SP1.signer-manager' }),
    ).toBe(`${GUIDE_URL}/#/signer/SP1.signer-manager`);
  });

  it('opens the contract somebody was reading', () => {
    expect(guideUrlFor({ kind: 'contract', profileId: 'capped-fee' })).toBe(
      `${GUIDE_URL}/#/contract/capped-fee`,
    );
  });

  it('survives being put inside a wallet link', () => {
    const page = guideUrlFor({ kind: 'pool', contractId: 'SP1.signer-manager' });
    const link = walletBrowserUrl('leather', page)!;
    expect(decodeURIComponent(link.split('url=')[1])).toBe(page);
  });
});
