/**
 * The bar at the top of the page, on a phone.
 *
 * Whether it appears at all is `shouldOfferWalletBrowser`, tested in
 * `lib/wallet-browser.test.ts` — including the two cases that matter most, a
 * desktop and a page inside a wallet's own browser, where offering a way into
 * the room somebody is standing in would send them out of it and back.
 *
 * What is left here is the bar itself, and the only thing that can be wrong
 * with it is the links.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletBrowserBar } from './WalletBrowserBanner';

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const render = (here: string, locale: 'en' | 'ko' = 'en') =>
  renderToStaticMarkup(
    <WalletBrowserBar locale={locale} here={here} onClose={() => {}} />,
  );

describe('the two ways in', () => {
  const html = () => render('https://signer-guide.fastpool.org/#/');

  it('offers both wallets, Leather first', () => {
    // Not alphabetical and not an accident: Leather has no WalletConnect and
    // no extension on a phone, so its browser is the only route there is.
    const page = html();
    expect(page.indexOf('Open in Leather')).toBeGreaterThan(-1);
    expect(page.indexOf('Open in Leather')).toBeLessThan(
      page.indexOf('Open in Xverse'),
    );
  });

  it('sends each one to the link it actually answers', () => {
    const page = html();
    // Leather's own scheme, and the app link Xverse verifies rather than the
    // xverse:// one its documentation calls deprecated.
    expect(page).toContain(
      'href="leather://browser?url=https%3A%2F%2Fsigner-guide.fastpool.org%2F%23%2F"',
    );
    expect(page).toContain(
      'href="https://connect.xverse.app/browser?url=https%3A%2F%2Fsigner-guide.fastpool.org%2F%23%2F"',
    );
  });

  it('uses anchors, which is what iOS will follow', () => {
    /*
     * A custom-scheme navigation that did not come from a gesture is refused,
     * and a gesture on an anchor is the one it always accepts. A button with
     * an onClick would silently do nothing for Leather on an iPhone.
     */
    const page = html();
    expect(page).not.toContain('<button type="button">Open in');
    expect((page.match(/<a href="/g) ?? []).length).toBe(2);
  });

  it('carries the pool the reader was looking at', () => {
    // The hash is the route on this site. Unescaped it ends the query string
    // and the wallet opens on the front page instead.
    const page = render(
      'https://signer-guide.fastpool.org/#/signer/SP1N8F8B.signer-manager',
    );
    expect(page).toContain('%23%2Fsigner%2FSP1N8F8B.signer-manager');
  });

  it('speaks the language the page is in', () => {
    expect(render('https://signer-guide.fastpool.org/', 'ko')).toContain(
      'Xverse에서 열기',
    );
  });

  it('can be shut', () => {
    // A banner nobody can close is an advertisement.
    expect(html()).toContain('aria-label="Hide this"');
  });
});
