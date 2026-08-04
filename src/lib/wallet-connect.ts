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
 * WalletConnect needs a project id from Reown. Without one the connector
 * cannot be created at all, so it is left out entirely rather than
 * half-configured: the picker then shows whatever is injected, which is the
 * behaviour this app had before.
 */

/**
 * Fast Pool's own, committed rather than kept in the environment.
 *
 * A Reown project id is a public client identifier, not a secret — it ships
 * inside the bundle of every site that uses WalletConnect, and it is read
 * straight out of this one. What stops somebody else spending the quota is the
 * allowed-domains list in the Reown dashboard, which is where that belongs.
 *
 * Committing it means a fork or a preview deploy gets a working wallet picker
 * without anyone having to be told about an environment variable. A deployment
 * that wants its own id sets `VITE_WALLETCONNECT_PROJECT_ID`.
 */
const DEFAULT_PROJECT_ID = 'a013ec0fd2d07ac0ba6c2e2512fd8a23';

const PROJECT_ID =
  typeof import.meta.env.VITE_WALLETCONNECT_PROJECT_ID === 'string' &&
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID.length > 0
    ? import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    : DEFAULT_PROJECT_ID;

const METADATA = {
  name: 'Bitcoin Staking',
  description: 'Stake your STX with a Stacks signer pool.',
  url: typeof location === 'undefined' ? '' : location.origin,
  icons: [
    typeof location === 'undefined' ? '' : `${location.origin}/icon-512.png`,
  ],
};

/**
 * Options for `connect()` / `request()`. Safe to pass to either, in any
 * environment — on a desktop browser the injected wallets are still listed
 * first and WalletConnect is simply one more entry in the picker.
 */
export function walletOptions(): ConnectRequestOptions {
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
