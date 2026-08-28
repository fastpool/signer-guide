/**
 * What the app needs from a wallet, and nothing more.
 *
 * Two implementations sit behind this: WalletConnect, which reaches the real
 * Leather and Xverse apps on the phone, and a mock used by the tests and by
 * the on-device E2E run. Keeping them behind one interface is what lets the
 * whole stake flow — pick a contract, pick a pool, fill the form, sign — be
 * exercised on a device with no wallet installed.
 */

export type WalletId = 'xverse' | 'leather' | 'okx' | 'any' | 'mock';

export type WalletAccount = {
  stxAddress: string;
  /**
   * The Bitcoin address the wallet reported, when it reported one.
   *
   * Offered as the default place to send rewards, and never more than a
   * default: the staker types their own if they would rather.
   */
  btcAddress: string | null;
  /**
   * Present only when the wallet published one.
   *
   * Deliberately optional, and deliberately unused by the stake path. See
   * `contract-call.ts`: this app asks the wallet to build and sign, so it
   * never needs the staker's public key — which is the whole reason
   * WalletConnect works here and does not on the web page.
   */
  publicKey?: string;
  walletId: WalletId;
};

/** One contract call, in the shape `stx_callContract` takes. */
export type ContractCallRequest = {
  /** `SP….contract-name` */
  contract: string;
  functionName: string;
  /** Clarity values, hex-encoded. */
  functionArgs: string[];
  /** Post conditions, hex-encoded. */
  postConditions: string[];
  postConditionMode: 'deny' | 'allow';
  network: 'mainnet' | 'testnet';
};

export type Wallet = {
  id: WalletId;
  /** What to call it on a button. */
  name: string;
  /**
   * Opens the wallet and asks who it is.
   *
   * Rejects with a `WalletCancelled` if the person dismissed it, which is not
   * a failure and should not be shown as one.
   */
  connect(): Promise<WalletAccount>;
  /** Hands the call over; the wallet builds, signs and broadcasts it. */
  callContract(request: ContractCallRequest): Promise<{ txid: string }>;
  /**
   * Abandons a connect that is still waiting.
   *
   * `connect()` does not come back until the wallet approves or the proposal
   * expires, which is minutes. Without this the app spins with no way out —
   * and for the copy-a-link route there is nothing to wait for at all, because
   * the person has to go and paste it somewhere.
   */
  cancel(): Promise<void>;
  disconnect(): Promise<void>;
};

export class WalletCancelled extends Error {
  constructor(message = 'Cancelled in the wallet') {
    super(message);
    this.name = 'WalletCancelled';
  }
}

/** A wallet that answered, but not with anything this app can use. */
export class WalletUnusable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletUnusable';
  }
}

const CANCEL_PATTERNS =
  /reject|denied|declin|cancel|user closed|closed the (walletconnect )?modal|proposal expired/i;

/** Somebody dismissed the sheet or pressed reject — not a broken wallet. */
export function isCancellation(error: unknown): boolean {
  if (error instanceof WalletCancelled) return true;
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) return true; // the JSON-RPC "user rejected" code
  const message = error instanceof Error ? error.message : String(error);
  return CANCEL_PATTERNS.test(message);
}

export function isStacksAddress(address: string): boolean {
  return /^S[PTMN][A-Z0-9]{20,}$/i.test(address);
}

export function isBtcAddress(address: string): boolean {
  return /^(bc1|tb1|[13mn2])[a-zA-Z0-9]{20,}$/i.test(address);
}
