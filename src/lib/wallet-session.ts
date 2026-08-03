import { useSyncExternalStore } from 'react';

/**
 * The connected wallet, held in memory for as long as the page is open.
 *
 * `@stacks/connect` caches addresses in localStorage but strips the public key
 * out of them on the way in — `StorageData` is `Omit<AddressEntry, 'publicKey'>`.
 * Building an unsigned transaction needs that public key, so a page that only
 * restored from localStorage had to call `connect()` a second time at the
 * moment the user pressed Stake, which puts a wallet-picker in front of
 * somebody who thought they had already connected.
 *
 * Keeping the key here instead means one connect per visit. It is module
 * state, not React state, so every stake dialog on the page shares it: connect
 * on one pool's card and the others are ready too.
 *
 * Nothing here is persisted. A public key is not a secret, but it is a
 * fingerprint, and there is no reason for it to outlive the tab.
 */
export type WalletSession = {
  stxAddress: string;
  publicKey: string;
  btcAddress: string | null;
};

let session: WalletSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getWalletSession(): WalletSession | null {
  return session;
}

export function setWalletSession(next: WalletSession): void {
  session = next;
  emit();
}

export function clearWalletSession(): void {
  if (session === null) return;
  session = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Null on the server, where there is no wallet to have connected to. */
function serverSnapshot(): WalletSession | null {
  return null;
}

export function useWalletSession(): WalletSession | null {
  return useSyncExternalStore(subscribe, getWalletSession, serverSnapshot);
}

export type WalletAddress = { address: string; publicKey?: string };

export function isStacksAddress(address: string): boolean {
  return /^S[PTMN][A-Z0-9]{20,}$/i.test(address);
}

export function isBtcAddress(address: string): boolean {
  return /^(bc1|tb1|[13mn2])[a-zA-Z0-9]{20,}$/i.test(address);
}

/**
 * The STX entry with a public key, and the BTC address beside it.
 *
 * Returns null when the wallet answered without a public key — the caller
 * cannot build a transaction from that, and should say so rather than carry on
 * with half a session.
 */
export function sessionFromAddresses(
  addresses: WalletAddress[],
): WalletSession | null {
  const stx = addresses.find(
    (entry) => isStacksAddress(entry.address) && entry.publicKey,
  );
  if (!stx?.publicKey) return null;
  const btc = addresses.find((entry) => isBtcAddress(entry.address));
  return {
    stxAddress: stx.address,
    publicKey: stx.publicKey,
    btcAddress: btc?.address ?? null,
  };
}
