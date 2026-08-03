import type { connect } from '@stacks/connect';

/** The package does not export `ConnectRequestOptions`, so take it from `connect`. */
type ConnectRequestOptions = NonNullable<Parameters<typeof connect>[0]>;

/**
 * Reaching a wallet that is a separate app rather than a browser extension.
 *
 * On a desktop browser `connect()` finds Leather or Xverse injected into the
 * page and that is the end of it. On a phone — and especially in an installed
 * app, where there is no extension to inject anything — the wallet is another
 * application, and the only way to it is WalletConnect: the wallet scans or
 * deep-links, approves in its own app, and hands the signature back.
 *
 * `@stacks/connect` already carries a WalletConnect provider and lists it in
 * the same picker as the injected ones, so this adds a route to the wallets
 * rather than a second way of talking to them. Everything downstream —
 * `connect()`, `request('stx_signTransaction')` — is unchanged.
 *
 * WalletConnect needs a project id from Reown, which is per-deployment and
 * public. Without one the connector cannot be created at all, so it is left
 * out entirely rather than half-configured: the picker then shows whatever is
 * injected, which is the behaviour this app had before.
 */

const PROJECT_ID =
  typeof import.meta.env.VITE_WALLETCONNECT_PROJECT_ID === 'string' &&
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID.length > 0
    ? import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    : null;

export function isWalletConnectConfigured(): boolean {
  return PROJECT_ID !== null;
}

const METADATA = {
  name: 'Bitcoin Staking',
  description: 'Stake your STX with a Stacks signer pool.',
  url: typeof location === 'undefined' ? '' : location.origin,
  icons: [
    typeof location === 'undefined' ? '' : `${location.origin}/icon-512.png`,
  ],
};

/**
 * Options for `connect()` / `request()`, with WalletConnect added when it is
 * configured. Safe to spread into either call in every environment.
 */
export function walletOptions(): ConnectRequestOptions {
  if (PROJECT_ID === null) return {};
  return {
    walletConnect: {
      projectId: PROJECT_ID,
      metadata: METADATA,
    },
  };
}

let initialized: Promise<void> | null = null;

/**
 * Creates the connector, once. Must finish before the picker is shown, or
 * WalletConnect is missing from it.
 *
 * A failure here is not fatal — it costs the WalletConnect entry in the
 * picker, and any injected wallet still works — so the caller carries on.
 */
export function initWalletConnect(): Promise<void> {
  if (PROJECT_ID === null) return Promise.resolve();
  initialized ??= (async () => {
    const { WalletConnect } = await import('@stacks/connect');
    await WalletConnect.initializeProvider({
      projectId: PROJECT_ID,
      metadata: METADATA,
    });
  })().catch(() => {
    // Let the next attempt try again rather than caching the failure.
    initialized = null;
  });
  return initialized;
}
