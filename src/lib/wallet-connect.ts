import { disconnect, WalletConnect } from '@stacks/connect';
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
 * Stacks only, deliberately.
 *
 * Left to itself `@stacks/connect` uses its `Default` config, which asks for
 * two namespaces: `stacks` and `bip122`. Xverse on mobile does not serve the
 * bip122 `getAccountAddresses` method over WalletConnect, so a session that
 * negotiated it came back with no addresses and an error about a bip method
 * being unavailable — after the user had already approved in the wallet.
 *
 * Nothing here needs the Bitcoin namespace. The STX address and
 * `stx_signTransaction` are what staking uses; the Bitcoin address is only
 * ever a convenience prefill for the reward field, and `sessionFromAddresses`
 * already treats it as optional. So this asks for what it uses and no more,
 * which is also the smaller thing for a wallet to approve.
 *
 * The cost is real but small: over WalletConnect there is no BTC address to
 * prefill, and somebody choosing Bitcoin rewards types theirs in.
 */
const NETWORKS = [WalletConnect.Networks.Stacks];

const WALLET_CONNECT_CONFIG = {
  projectId: PROJECT_ID,
  metadata: METADATA,
  networks: NETWORKS,
};

/**
 * Options for `connect()` / `request()`. Safe to pass to either, in any
 * environment — on a desktop browser the injected wallets are still listed
 * first and WalletConnect is simply one more entry in the picker.
 */
export function walletOptions(): ConnectRequestOptions {
  return { walletConnect: WALLET_CONNECT_CONFIG };
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
  initialized ??= WalletConnect.initializeProvider(WALLET_CONNECT_CONFIG).catch(
    () => {
      // Let the next attempt try again rather than caching the failure.
      initialized = null;
    },
  );
  return initialized;
}

/**
 * Puts the page back to knowing no wallet at all.
 *
 * `clearLocalStorage` only drops the cached addresses. It leaves the
 * WalletConnect session live and the chosen wallet remembered, so the next
 * `connect()` quietly reuses both — which is why a failed connect used to
 * leave no way back: pressing the button again did nothing visible, while
 * `isConnected()` still answered true because an address was in storage.
 *
 * `disconnect()` is the one that ends the session, forgets the provider
 * choice and clears storage, so the picker genuinely opens again.
 */
export function forgetWallet(): void {
  try {
    disconnect();
  } catch {
    // Nothing connected, or a provider that dislikes being asked twice.
  }
}
