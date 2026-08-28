/**
 * The other way to a mobile wallet: its own browser.
 *
 * Leather and Xverse both ship an in-app browser, and a page opened inside one
 * reaches the wallet through the provider it injects — the same route this
 * guide already uses on a desktop, and the one Xverse's own documentation
 * calls the way to reach it from a phone.
 *
 * This matters most for **Leather**, which does not support WalletConnect at
 * all: reading the intent filters off a device shows it registering `leather`
 * and nothing else, with no `wc:` among them, which is exactly what the wallet
 * says when it is handed a pairing. Its browser is not a fallback for Leather;
 * it is the only route there is.
 *
 * Both links below were fired at a real device with both wallets installed:
 * Leather opened its browser on the guide, and Xverse opened on its lock
 * screen — as far as anything automated can get, since past it is a PIN.
 *
 *   leather://browser?url=…                    the scheme it registers
 *   https://connect.xverse.app/browser?url=…   an app link Xverse verifies
 *
 * Xverse's `xverse://browser?url=` still works and its own documentation calls
 * it deprecated, so the app link is what is used.
 *
 * Shared, not duplicated: the phone app sends people here, and this page sends
 * people to the wallet. Both ends of that round trip need the same two links
 * to be right, so they read them from the same table.
 */

/** A wallet with a browser of its own to open a page in. */
export type BrowserWalletId = 'leather' | 'xverse';

const BROWSER_LINKS: Record<BrowserWalletId, string> = {
  leather: 'leather://browser',
  xverse: 'https://connect.xverse.app/browser',
};

/**
 * Wallets that will open a page in a browser of their own.
 *
 * Leather first, and not alphabetically: it is the one with no other route, so
 * for its users this is the only entry on the list that works at all.
 */
export const BROWSER_WALLETS: BrowserWalletId[] = ['leather', 'xverse'];

/** A wallet's name is a proper noun, and is never translated. */
export const BROWSER_WALLET_NAMES: Record<BrowserWalletId, string> = {
  leather: 'Leather',
  xverse: 'Xverse',
};

export function isBrowserWallet(walletId: string): walletId is BrowserWalletId {
  return walletId in BROWSER_LINKS;
}

/**
 * Where to send a wallet so that it opens `url` in its own browser.
 *
 * Null for a wallet with no browser to open, which is not a failure — it is a
 * wallet this route does not apply to, and the caller should not offer it.
 *
 * `encodeURIComponent` is the whole substance here: the page being carried has
 * a `#` in it on this site, and a hash left unescaped ends the query string
 * and takes the route with it.
 */
export function walletBrowserUrl(walletId: string, url: string): string | null {
  if (!isBrowserWallet(walletId)) return null;
  return `${BROWSER_LINKS[walletId]}?url=${encodeURIComponent(url)}`;
}

/**
 * As much of a `Window` as this module looks at.
 *
 * Written as optional properties rather than an index signature so that the
 * real `window` is assignable to it without a cast, and so a test can pass a
 * two-key object without inventing the rest of a browser.
 */
export type PageWindow = {
  navigator?: { userAgent?: string; maxTouchPoints?: number };
  matchMedia?: (query: string) => { matches: boolean };
  LeatherProvider?: unknown;
  XverseProviders?: unknown;
  btc?: unknown;
  StacksProvider?: unknown;
};

/**
 * Whether opening the wallet's browser is worth offering at all.
 *
 * Three things have to be true, and the first two are the interesting ones:
 *
 *  - **No wallet is reachable here already.** Inside Leather's or Xverse's own
 *    browser a provider is injected and the ordinary picker works, so offering
 *    "open in Xverse" from inside Xverse is a loop with a worse ending.
 *  - **It is a phone.** On a desktop the extension is the route, and a
 *    `leather://` link resolves to nothing at all.
 *  - Something has to be installed to answer, which cannot be detected and is
 *    left to the copy to say.
 *
 * Deliberately not a user-agent sniff for wallet browsers: they do not all
 * announce themselves, and what actually matters is whether a provider is
 * there, which is a fact rather than a guess.
 */
export function shouldOfferWalletBrowser(win: PageWindow): boolean {
  if (hasInjectedWallet(win)) return false;
  return isHandheld(win);
}

/**
 * Whether a Stacks wallet has injected itself into this page.
 *
 * The names are the ones the two wallets actually publish. `StacksProvider` is
 * the older shared key that either may still set, so it is checked as well
 * rather than assuming a wallet announces itself under its own name.
 */
export function hasInjectedWallet(win: PageWindow): boolean {
  return (
    win.LeatherProvider !== undefined ||
    win.XverseProviders !== undefined ||
    win.btc !== undefined ||
    win.StacksProvider !== undefined
  );
}

/** A phone or a tablet, by the two signals that are not trivially spoofed. */
function isHandheld(win: PageWindow): boolean {
  const ua = win.navigator?.userAgent ?? '';
  if (/Android|iPhone|iPod|iPad/i.test(ua)) return true;
  // iPadOS reports a desktop Safari string; touch points are what give it away.
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && (win.navigator?.maxTouchPoints ?? 0) > 1;
}
