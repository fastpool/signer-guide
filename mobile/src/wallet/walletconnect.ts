import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import UniversalProvider from '@walletconnect/universal-provider';
import {
  isBtcAddress,
  isStacksAddress,
  WalletCancelled,
  WalletUnusable,
  type ContractCallRequest,
  type Wallet,
  type WalletAccount,
  type WalletId,
} from './types';

/**
 * Reaching Leather and Xverse, which on a phone are other applications.
 *
 * There is no extension to inject anything into a native app, so the only
 * route to a wallet is WalletConnect: this app publishes a pairing URI, the
 * wallet is opened on it by deep link, the person approves in their own app,
 * and the reply comes back over the relay.
 *
 * WALLETCONNECT.md explains why the web page switched this off — the approved
 * session carries no public key, and a page that builds the transaction itself
 * cannot proceed without one. This app never builds one. It asks for
 * `stx_callContract` and lets the wallet build, sign and broadcast, so an
 * address-only session is everything it needs. That is the route the document
 * describes as the answer if the wallets will not publish the key, and it is
 * the route taken here.
 */

export const STACKS_MAINNET_CHAIN = 'stacks:1';

/**
 * A Reown project id is a public client identifier, not a secret. It ships
 * inside every app that uses WalletConnect and is read straight out of them.
 * What stops somebody else spending the quota is the allowed-list in the Reown
 * dashboard, which is where that belongs.
 */
export function projectId(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (fromEnv) return fromEnv;
  const fromConfig = (Constants.expoConfig?.extra as
    | { walletConnectProjectId?: string }
    | undefined)?.walletConnectProjectId;
  return fromConfig || null;
}

const METADATA = {
  name: 'Signer Guide',
  description: 'Stake your STX with a Stacks signer pool.',
  url: 'https://signer-guide.fastpool.org',
  icons: ['https://signer-guide.fastpool.org/icon-512.png'],
  /**
   * Where the wallet sends the person back to.
   *
   * Approving happens in another app. Without a link to return on, the wallet
   * approves and leaves them looking at the wallet with this app still waiting
   * behind it. `linkMode` stays off: it is a stricter transport that wants a
   * verified universal link at both ends, and a custom scheme is not one.
   */
  redirect: { native: 'signerguide://', universal: '' },
};

const METHODS = [
  'stx_callContract',
  'stx_getAddresses',
  'stx_signMessage',
  'stx_signTransaction',
  'stx_transferStx',
];

/** Bitcoin mainnet, by the first 32 characters of its genesis hash. */
export const BITCOIN_MAINNET_CHAIN = 'bip122:000000000019d6689c085ae165831e93';

/**
 * How to reach each wallet on this phone.
 *
 * `scheme` is what Android is asked to open, and `wcPath` is where that wallet
 * takes a pairing URI — the two are not the same shape for every wallet, so
 * they are written out rather than assembled from one rule.
 *
 * `null` means hand the raw `wc:` URI to the system, which offers whatever
 * wallets are installed. That is the honest choice for "another wallet", and
 * every named wallet falls back to it if the phone will not open its scheme —
 * a deep link into an app that is not installed should cost the person a
 * chooser, not the pairing.
 */
export const WALLET_LINKS: Record<
  Exclude<WalletId, 'mock'>,
  { scheme: string; wcPath: string } | null
> = {
  xverse: { scheme: 'xverse', wcPath: 'wc' },
  leather: { scheme: 'leather', wcPath: 'wc' },
  // OKX routes everything through `main/`, unlike the two above.
  okx: { scheme: 'okx', wcPath: 'main/wc' },
  any: null,
};

function linkFor(walletId: WalletId) {
  return WALLET_LINKS[walletId as Exclude<WalletId, 'mock'>] ?? null;
}

/** Where to send the person to approve a pairing. */
export function pairingUrl(walletId: WalletId, uri: string): string {
  const link = linkFor(walletId);
  return link === null
    ? uri
    : `${link.scheme}://${link.wcPath}?uri=${encodeURIComponent(uri)}`;
}

/**
 * How to bring an already-paired wallet back to the front.
 *
 * No URI on it: the request is already at the wallet over the relay, and this
 * only asks Android to show the app that is holding it.
 */
export function foregroundUrl(walletId: WalletId): string | null {
  const link = linkFor(walletId);
  return link === null ? null : `${link.scheme}://`;
}

/**
 * What each wallet calls itself.
 *
 * Proper nouns, and never translated — Xverse is Xverse in every language.
 * Two entries are not wallets and so are not here: `any` and `mock` say what
 * they do rather than who they are, which makes them sentences, and sentences
 * live in the catalogue. `walletLabel` puts the two together.
 */
export const WALLET_NAMES: Record<Exclude<WalletId, 'any' | 'mock'>, string> = {
  xverse: 'Xverse',
  leather: 'Leather',
  okx: 'OKX Wallet',
};

type Provider = Awaited<ReturnType<typeof UniversalProvider.init>>;

let providerPromise: Promise<Provider> | null = null;

async function getProvider(): Promise<Provider> {
  const id = projectId();
  if (!id) {
    throw new WalletUnusable(
      'No WalletConnect project id is configured, so there is no route to a wallet.',
    );
  }
  providerPromise ??= UniversalProvider.init({
    projectId: id,
    metadata: METADATA,
  }).catch((error: unknown) => {
    // Let the next attempt try again rather than caching the failure.
    providerPromise = null;
    throw error;
  });
  return providerPromise;
}

/** Only for the tests, which drive a stub provider through this module. */
export function __setProvider(provider: Provider | null): void {
  providerPromise = provider === null ? null : Promise.resolve(provider);
}

/**
 * The Stacks address out of an approved session.
 *
 * Accounts arrive CAIP-10 encoded — `stacks:1:SP…` — so the address is the
 * last segment. A session with none is a wallet that approved something other
 * than what was asked for, and saying so beats carrying on with half of one.
 */
export function accountFromSession(session: {
  namespaces?: Record<string, { accounts?: string[] }>;
  sessionProperties?: Record<string, string>;
}): { stxAddress: string; btcAddress: string | null; publicKey?: string } {
  const accounts = session.namespaces?.stacks?.accounts ?? [];
  const addresses = accounts.map((account) => account.split(':')[2] ?? '');
  const stxAddress = addresses.find(isStacksAddress);
  if (!stxAddress) {
    throw new WalletUnusable(
      'The wallet approved a session with no Stacks address in it.',
    );
  }

  const btcAddress =
    (session.namespaces?.bip122?.accounts ?? [])
      .map((account) => account.split(':')[2] ?? '')
      .find(isBtcAddress) ?? null;

  /*
   * A public key if the wallet volunteered one, and nothing lost if not. See
   * `contract-call.ts`: the stake path does not use it. It is read only so
   * that the account screen can say the wallet published one, which is the
   * fact WALLETCONNECT.md is waiting on.
   */
  let publicKey: string | undefined;
  try {
    const published = session.sessionProperties?.stacks_getAddresses;
    if (published) {
      const entries = JSON.parse(published) as { address?: string; publicKey?: string }[];
      publicKey = entries.find((e) => e.address === stxAddress && e.publicKey)?.publicKey;
    }
  } catch {
    // A wallet publishing something we cannot parse tells us nothing, which
    // is what we had anyway.
  }

  return { stxAddress, btcAddress, publicKey };
}

export function walletConnectWallet(walletId: WalletId): Wallet {
  return {
    id: walletId,
    /*
     * A fallback only. What a button says comes from `walletLabel`, which can
     * reach the catalogue; this is here because the `Wallet` interface asks
     * for a name and an adapter has no translator.
     */
    name: walletId,

    async connect(): Promise<WalletAccount> {
      const provider = await getProvider();

      /*
       * The URI is only useful while the wallet is being opened on it, so the
       * listener goes on for this connect and comes off again after.
       *
       * A named wallet is opened on its own scheme. "Another wallet" copies
       * the link instead, and that is the whole reason it exists: handing a
       * bare `wc:` URI to Android does not raise a chooser — it opens whatever
       * app claimed the scheme, which on a phone with OKX installed is OKX,
       * under a button that does not say OKX. A link on the clipboard works in
       * every wallet that takes one and lies about none of them.
       */
      const openWallet = (uri: string) => {
        if (linkFor(walletId) === null) {
          void Clipboard.setStringAsync(uri).catch(() => {});
          return;
        }
        void Linking.openURL(pairingUrl(walletId, uri)).catch(() => {
          // A wallet that is not installed, or a scheme the phone will not
          // open. The pairing is still live, so the link is worth having.
          void Clipboard.setStringAsync(uri).catch(() => {});
        });
      };
      provider.on('display_uri', openWallet);

      try {
        /*
         * Both namespaces, and both optional.
         *
         * This app only ever uses the Stacks one, and asking for Stacks alone
         * looked like the tidier proposal. Xverse rejects it — the wallet
         * answers with an error naming *bitcoin*, which is a wallet that
         * expected a bip122 namespace in a proposal and did not find one. The
         * guide's own `wallet-connect.ts` reached the same conclusion from the
         * other end and kept both.
         *
         * Naming bip122 asks nothing of a wallet that does not have it:
         * everything here is `optionalNamespaces`, and a wallet approves what
         * it can. A session that comes back with only `stacks` in it is
         * exactly as usable as before — `accountFromSession` reads the Bitcoin
         * address if there is one and carries on if there is not.
         */
        const session = await provider.connect({
          optionalNamespaces: {
            stacks: {
              chains: [STACKS_MAINNET_CHAIN],
              methods: METHODS,
              events: [],
            },
            bip122: {
              chains: [BITCOIN_MAINNET_CHAIN],
              methods: [],
              events: [],
            },
          },
        });
        if (!session) throw new WalletCancelled();
        return { ...accountFromSession(session), walletId };
      } finally {
        provider.removeListener('display_uri', openWallet);
      }
    },

    async callContract(request: ContractCallRequest): Promise<{ txid: string }> {
      const provider = await getProvider();
      if (!provider.session) {
        throw new WalletUnusable('The wallet is no longer connected.');
      }

      /*
       * Bring the wallet forward. The request has already gone over the relay
       * by the time this runs, so the wallet has something to show — without
       * it the person is left on a spinner while the approval waits in an app
       * they cannot see.
       */
      const front = foregroundUrl(walletId);
      if (front) void Linking.openURL(front).catch(() => {});

      const result = (await provider.request(
        { method: 'stx_callContract', params: request },
        STACKS_MAINNET_CHAIN,
      )) as { txid?: string; txId?: string } | string;

      const txid =
        typeof result === 'string' ? result : (result?.txid ?? result?.txId);
      if (!txid) {
        throw new WalletUnusable(
          'The wallet did not return a transaction id, so nothing was broadcast.',
        );
      }
      return { txid };
    },

    async cancel(): Promise<void> {
      try {
        const provider = await getProvider();
        /*
         * Two calls, because they undo different halves: `abortPairingAttempt`
         * rejects the `connect()` that is still awaiting, and
         * `cleanupPendingPairings` drops the topic so the next attempt starts a
         * new one rather than reusing a proposal the person walked away from.
         *
         * Both are guarded: they are on `UniversalProvider` but not in every
         * version's types, and a failure here must not stop the app forgetting
         * the attempt.
         */
        const abortable = provider as unknown as {
          abortPairingAttempt?: () => void;
          cleanupPendingPairings?: () => Promise<void>;
        };
        abortable.abortPairingAttempt?.();
        await abortable.cleanupPendingPairings?.();
      } catch {
        // Nothing pending, or a provider that was never created.
      }
    },

    async disconnect(): Promise<void> {
      try {
        const provider = await getProvider();
        if (provider.session) await provider.disconnect();
      } catch {
        // Nothing connected, or a relay that has already dropped it.
      }
    },
  };
}
