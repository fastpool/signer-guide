import { contractHref, signerHref } from '@guide/lib/route';
import {
  BROWSER_WALLETS as SHARED_BROWSER_WALLETS,
  walletBrowserUrl as sharedWalletBrowserUrl,
} from '@guide/lib/wallet-browser';
import type { WalletId } from './types';

/**
 * The other way to a mobile wallet: its own browser.
 *
 * The links themselves, and the reasoning behind them, live in
 * `@guide/lib/wallet-browser` — the web guide offers the same route from the
 * other direction, sending a phone browser into the wallet, and both ends need
 * the same two links to be right. This module is the app's view onto that
 * table plus the one thing the web page has no use for: which page of the
 * guide to open.
 */

/** Wallets that will open a page in a browser of their own. */
export const BROWSER_WALLETS: WalletId[] = [...SHARED_BROWSER_WALLETS];

/**
 * Where to send a wallet so that it opens `url` in its own browser.
 *
 * Null for a wallet with no browser to open, which is not a failure — it is a
 * wallet this route does not apply to, and the caller should not offer it.
 */
export function walletBrowserUrl(walletId: WalletId, url: string): string | null {
  return sharedWalletBrowserUrl(walletId, url);
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
