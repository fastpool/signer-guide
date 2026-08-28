import { describe, expect, it } from 'vitest';
import {
  BROWSER_WALLETS,
  hasInjectedWallet,
  isBrowserWallet,
  shouldOfferWalletBrowser,
  walletBrowserUrl,
} from './wallet-browser';

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

  /*
   * This site's routes live in the hash, so every link it hands a wallet
   * carries a `#`. Unescaped, the query string ends there and the wallet opens
   * the front page instead of the pool somebody was reading.
   */
  it('escapes the page, which carries characters a query string would eat', () => {
    const page = 'https://signer-guide.fastpool.org/#/signer/SP1.a?b=c';
    const link = walletBrowserUrl('leather', page)!;
    expect(link).not.toContain('#');
    expect(link).not.toContain('?b=');
    expect(decodeURIComponent(link.split('url=')[1])).toBe(page);
  });

  it('has nothing to offer for a wallet with no browser of its own', () => {
    // OKX has one, but no documented link to it.
    expect(walletBrowserUrl('okx', 'https://example.org')).toBeNull();
    expect(walletBrowserUrl('any', 'https://example.org')).toBeNull();
  });

  it('offers exactly the wallets it has a link for', () => {
    for (const id of BROWSER_WALLETS) {
      expect(walletBrowserUrl(id, 'https://example.org')).not.toBeNull();
      expect(isBrowserWallet(id)).toBe(true);
    }
  });
});

const PHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' };
const DESKTOP = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' };

describe('shouldOfferWalletBrowser', () => {
  it('offers the route on a phone with no wallet in the page', () => {
    expect(shouldOfferWalletBrowser({ navigator: PHONE })).toBe(true);
    expect(
      shouldOfferWalletBrowser({
        navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' },
      }),
    ).toBe(true);
  });

  /*
   * The loop this exists to prevent: inside Leather's own browser a provider
   * is injected and the ordinary picker works, so an "open in Leather" button
   * there sends somebody out of the wallet they are already inside.
   */
  it('is silent inside a wallet browser, where a provider is already there', () => {
    expect(
      shouldOfferWalletBrowser({ navigator: PHONE, LeatherProvider: {} }),
    ).toBe(false);
    expect(
      shouldOfferWalletBrowser({ navigator: PHONE, XverseProviders: {} }),
    ).toBe(false);
  });

  it('is silent on a desktop, where the extension is the route', () => {
    expect(shouldOfferWalletBrowser({ navigator: DESKTOP })).toBe(false);
  });

  it('spots an iPad, which claims to be a desktop', () => {
    expect(
      shouldOfferWalletBrowser({
        navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 5 },
        matchMedia: () => ({ matches: true }),
      }),
    ).toBe(true);
  });

  it('survives a page with no navigator at all', () => {
    expect(shouldOfferWalletBrowser({})).toBe(false);
  });
});

describe('hasInjectedWallet', () => {
  it('knows the keys the two wallets publish', () => {
    expect(hasInjectedWallet({ LeatherProvider: {} })).toBe(true);
    expect(hasInjectedWallet({ XverseProviders: {} })).toBe(true);
    expect(hasInjectedWallet({ StacksProvider: {} })).toBe(true);
    expect(hasInjectedWallet({})).toBe(false);
  });
});
