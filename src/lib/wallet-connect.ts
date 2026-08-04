import {
  connect as connectWallet,
  DEFAULT_PROVIDERS,
  disconnect,
  request,
  WALLET_CONNECT_PROVIDER,
  WalletConnect,
} from '@stacks/connect';
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
 * Fast Pool's own — commented out, so nothing offers WalletConnect for now.
 *
 * Approving over WalletConnect does not currently end in a usable session.
 * `@stacks/connect` reads addresses out of the WalletConnect session rather
 * than asking the wallet, and unless the wallet published a public key into
 * `sessionProperties`, this app cannot build a transaction from what comes
 * back — so the user approves in their wallet and is met with an error. An
 * option that fails after the user has already committed to it is worse than
 * an option that is not there, so it is not there. See WALLETCONNECT.md, and
 * uncomment this line to put it back once the wallets have answered.
 *
 * A Reown project id is a public client identifier, not a secret — it ships
 * inside the bundle of every site that uses WalletConnect, and it is read
 * straight out of this one. What stops somebody else spending the quota is the
 * allowed-domains list in the Reown dashboard, which is where that belongs.
 *
 * Committing it means a fork or a preview deploy gets a working wallet picker
 * without anyone having to be told about an environment variable. A deployment
 * that wants its own id — or wants WalletConnect back before this line is
 * uncommented — sets `VITE_WALLETCONNECT_PROJECT_ID`.
 */
// const DEFAULT_PROJECT_ID = 'a013ec0fd2d07ac0ba6c2e2512fd8a23';
const DEFAULT_PROJECT_ID: string | null = null;

const ENV_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const PROJECT_ID: string | null =
  typeof ENV_PROJECT_ID === 'string' && ENV_PROJECT_ID.length > 0
    ? ENV_PROJECT_ID
    : DEFAULT_PROJECT_ID;

const ORIGIN = typeof location === 'undefined' ? '' : location.origin;

const METADATA = {
  name: 'Bitcoin Staking',
  description: 'Stake your STX with a Stacks signer pool.',
  url: ORIGIN,
  icons: [ORIGIN ? `${ORIGIN}/icon-512.png` : ''],
  /**
   * Where the wallet sends the user back to.
   *
   * On a phone, approving happens in another app. Without somewhere to return
   * to, the wallet has nothing to open when it is done: it approves, and the
   * user is left looking at the wallet with the page still waiting behind it.
   * `universal` is the link the wallet opens to bring the browser back.
   *
   * `linkMode` stays off, and not for the reason an earlier note here gave.
   * It is a native-app transport: both ends declare a universal link and
   * carry requests over links instead of the relay. A web page has no
   * universal link of its own to be reached at, so turning it on would claim
   * something untrue. It is unrelated to `/.well-known/walletconnect.txt`,
   * which verifies the domain for the Verify API and changes what a wallet
   * *displays* about who is asking, not how the reply gets back.
   */
  redirect: { native: '', universal: ORIGIN },
};

/**
 * Both namespaces, which is the library's own default.
 *
 * Restricting this to `stacks` looked like the fix for Xverse failing on a
 * bip122 address method, and made things worse: AppKit builds the wallet list
 * from `networks.flatMap(n => n.chains)`, so asking for one namespace shrinks
 * the picker to wallets registered for it — and Xverse dropped out of the list
 * entirely.
 *
 * It was also never the cause. `UniversalConnector.connect` passes everything
 * as `optionalNamespaces`, so naming bip122 never required a wallet to support
 * it. A wallet approves what it can.
 *
 * Nor is the cause in which method asks for the addresses, which an earlier
 * note here claimed: over WalletConnect `getAddresses` makes no RPC call at
 * all. It reads the session. What it finds there is the real problem, and it
 * is why WalletConnect is switched off — see WALLETCONNECT.md.
 */
export function walletConnectConfig(projectId: string) {
  return {
    projectId,
    metadata: METADATA,
    networks: WalletConnect.Default.networks,
  };
}

/** Every wallet the library knows about, except WalletConnect. */
const INJECTED_ONLY = DEFAULT_PROVIDERS.filter(
  (provider) => provider.id !== WALLET_CONNECT_PROVIDER.id,
);

/**
 * Options for `connect()` / `request()`. Safe to pass to either, in any
 * environment — on a desktop browser the injected wallets are listed and
 * WalletConnect is one more entry in the picker, when there is a project id
 * for it.
 *
 * Taking it away needs both halves, which is worth knowing before anyone tries
 * one of them:
 *
 *  - `WALLET_CONNECT_PROVIDER` is already in `DEFAULT_PROVIDERS`, so the picker
 *    lists it whether or not a `walletConnect` option is passed. Dropping the
 *    option alone leaves the entry there, leading to a wallet that was never
 *    initialised. So the list itself is narrowed.
 *  - The library appends the entry again, and creates the connector, whenever
 *    `walletConnect` is *present* — it never looks at the id first — so the key
 *    has to be absent rather than empty.
 */
export function walletOptions(): ConnectRequestOptions {
  if (PROJECT_ID === null) return { defaultProviders: INJECTED_ONLY };
  return { walletConnect: walletConnectConfig(PROJECT_ID) };
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
  initialized ??= WalletConnect.initializeProvider(
    walletConnectConfig(PROJECT_ID),
  ).catch(() => {
    // Let the next attempt try again rather than caching the failure.
    initialized = null;
  });
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

/** Somebody dismissed the picker or pressed reject — not a broken wallet. */
function isUserCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) return true; // the JSON-RPC "user rejected" code
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return /reject|denied|declin|cancel|closed the walletconnect modal/.test(
    message,
  );
}

export type AddressEntry = { address: string; publicKey?: string };

/**
 * Opens the picker and asks the chosen wallet who it is.
 *
 * `connect()` asks through the WBIP `getAddresses`, which wants Stacks *and*
 * Bitcoin addresses. Over WalletConnect that reaches for a bip122 method, and
 * a wallet whose approved session has no bip122 in it — Xverse on mobile —
 * answers that the method is unavailable, after the user has already approved.
 *
 * `stx_getAddresses` asks the same question inside the Stacks namespace alone,
 * so any session that approved `stacks` can answer it. It runs as a fallback
 * rather than as the first choice because `connect()` is what works today with
 * the browser extensions, and the session is already live by the time the
 * first attempt fails — so the retry costs no second approval.
 *
 * A cancelled picker is not retried; asking twice would just reopen it.
 */
export async function requestAddresses(): Promise<AddressEntry[]> {
  try {
    const { addresses } = await connectWallet(walletOptions());
    if (addresses.length > 0) return addresses;
  } catch (error) {
    if (isUserCancellation(error)) throw error;
  }
  const { addresses } = await request(walletOptions(), 'stx_getAddresses');
  return addresses;
}
