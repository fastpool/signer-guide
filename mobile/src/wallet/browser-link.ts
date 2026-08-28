import { contractHref, signerHref } from '@guide/lib/route';
import type { WalletId } from './types';

/**
 * The other way to a mobile wallet: its own browser.
 *
 * Leather and Xverse both ship an in-app browser, and a page opened inside one
 * reaches the wallet through the provider it injects — the same route the web
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
 */
const BROWSER_LINKS: Partial<Record<WalletId, string>> = {
  leather: 'leather://browser',
  xverse: 'https://connect.xverse.app/browser',
};

/** Wallets that will open a page in a browser of their own. */
export const BROWSER_WALLETS: WalletId[] = ['leather', 'xverse'];

/**
 * Where to send a wallet so that it opens `url` in its own browser.
 *
 * Null for a wallet with no browser to open, which is not a failure — it is a
 * wallet this route does not apply to, and the caller should not offer it.
 */
export function walletBrowserUrl(walletId: WalletId, url: string): string | null {
  const base = BROWSER_LINKS[walletId];
  return base === undefined ? null : `${base}?url=${encodeURIComponent(url)}`;
}

/**
 * The page to open there.
 *
 * The web guide, which already has the whole staking flow and already talks to
 * an injected provider. Opening the app's own domain would be opening a page
 * that does not exist; opening the guide is opening the thing this app is a
 * view onto.
 */
export const GUIDE_URL =
  process.env.EXPO_PUBLIC_GUIDE_URL || 'https://signer-guide.fastpool.org';

/**
 * What the person was doing when they asked for a wallet.
 *
 * Handing every route the guide's front page is handing somebody who was two
 * taps into choosing a pool a list of forty-five of them and asking them to
 * start again. The guide's own hash routes are reused rather than rebuilt —
 * `signerHref` and `contractHref` are the site's, so a route that moves there
 * moves here.
 */
export type GuideTarget =
  | { kind: 'guide' }
  | { kind: 'pool'; contractId: string }
  | { kind: 'contract'; profileId: string };

export function guideUrlFor(target: GuideTarget): string {
  switch (target.kind) {
    case 'pool':
      return `${GUIDE_URL}/${signerHref(target.contractId)}`;
    case 'contract':
      return `${GUIDE_URL}/${contractHref(target.profileId)}`;
    default:
      return GUIDE_URL;
  }
}
