import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { watchAddressFromUrl } from './deep-link';
import { mockWallet, mockWalletEnabled } from './mock';
import {
  isCancellation,
  type ContractCallRequest,
  type Wallet,
  type WalletAccount,
  type WalletId,
} from './types';
import { walletConnectWallet } from './walletconnect';

/**
 * Who the app is looking at, and how it asks them to sign.
 *
 * Two things are kept apart here on purpose:
 *
 *   the account   an address, which is all that is needed to *show* a stake
 *   the wallet    a live session, which is what is needed to *change* one
 *
 * They come apart in both directions. Somebody can watch an address they do
 * not hold the keys to — worth doing, and the only way to see the position
 * screens on a phone with no wallet on it. And a connected wallet can lose its
 * session to a dropped relay while the address it named stays perfectly good
 * to read. Treating "connected" as one flag made the app claim it could sign
 * when it could not, so it is two.
 *
 * The address survives a restart; the session does not. An address is not a
 * secret, and a person who watched one yesterday means to watch it today. A
 * WalletConnect session is a live pairing, and one restored silently is one
 * nobody remembers approving.
 */

const ADDRESS_KEY = 'signer-guide:address:v1';

export type WalletState = {
  /** The address the app is showing, from a wallet or typed in. */
  account: WalletAccount | null;
  /** True when there is a session that could sign something. */
  canSign: boolean;
  connecting: boolean;
  error: string | null;
  connect: (walletId: WalletId) => Promise<void>;
  /** Read-only: show this address without a wallet behind it. */
  watch: (address: string) => Promise<void>;
  disconnect: () => Promise<void>;
  callContract: (request: ContractCallRequest) => Promise<{ txid: string }>;
  clearError: () => void;
  /** True while the saved address is still being read off the device. */
  restoring: boolean;
};

const WalletContext = createContext<WalletState | null>(null);

/** Swapped out by the tests, and by the on-device E2E run. */
export type WalletFactory = (walletId: WalletId) => Wallet;

export function defaultWalletFactory(walletId: WalletId): Wallet {
  if (walletId === 'mock' || mockWalletEnabled()) return mockWallet();
  return walletConnectWallet(walletId);
}

export function WalletProvider({
  children,
  factory = defaultWalletFactory,
}: {
  children: ReactNode;
  factory?: WalletFactory;
}) {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wallet = useRef<Wallet | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(ADDRESS_KEY)
      .then((saved) => {
        if (cancelled || !saved) return;
        // Read-only until a wallet is connected: the session behind it is
        // gone, whatever the address says.
        setAccount({ stxAddress: saved, btcAddress: null, walletId: 'any' });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((address: string | null) => {
    void (address === null
      ? AsyncStorage.removeItem(ADDRESS_KEY)
      : AsyncStorage.setItem(ADDRESS_KEY, address)
    ).catch(() => {});
  }, []);

  const connect = useCallback(
    async (walletId: WalletId) => {
      setError(null);
      setConnecting(true);
      const next = factory(walletId);
      try {
        const connected = await next.connect();
        wallet.current = next;
        setAccount(connected);
        remember(connected.stxAddress);
      } catch (err) {
        wallet.current = null;
        // Dismissing the wallet is a decision, not a fault. Reporting it as
        // one leaves an error on screen that the person meant to cause.
        if (!isCancellation(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setConnecting(false);
      }
    },
    [factory, remember],
  );

  const watch = useCallback(
    async (address: string) => {
      setError(null);
      wallet.current = null;
      const trimmed = address.trim().toUpperCase();
      setAccount({ stxAddress: trimmed, btcAddress: null, walletId: 'any' });
      remember(trimmed);
    },
    [remember],
  );

  /*
   * `signerguide://watch/SP…`, whether the app was cold-started on it or was
   * already open. It can only ever put the app into the read-only state — see
   * `deep-link.ts` for why that limit is the whole design of it.
   */
  useEffect(() => {
    let cancelled = false;
    const open = (url: string | null) => {
      const address = watchAddressFromUrl(url);
      if (cancelled || !address) return;
      void watch(address);
    };

    void Linking.getInitialURL().then(open).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [watch]);

  const disconnect = useCallback(async () => {
    const current = wallet.current;
    wallet.current = null;
    setAccount(null);
    setError(null);
    remember(null);
    if (current) await current.disconnect().catch(() => {});
  }, [remember]);

  const callContract = useCallback(async (request: ContractCallRequest) => {
    const current = wallet.current;
    if (!current) {
      throw new Error(
        'No wallet is connected, so there is nothing to sign with.',
      );
    }
    return current.callContract(request);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      account,
      canSign: wallet.current !== null && account !== null,
      connecting,
      restoring,
      error,
      connect,
      watch,
      disconnect,
      callContract,
      clearError: () => setError(null),
    }),
    [account, connecting, restoring, error, connect, watch, disconnect, callContract],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet outside a WalletProvider');
  return value;
}
