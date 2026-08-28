import {
  WalletCancelled,
  type ContractCallRequest,
  type Wallet,
  type WalletAccount,
} from './types';

/**
 * A wallet that answers without an app behind it.
 *
 * This exists because the stake flow is the app, and it cannot be exercised on
 * a phone with no wallet installed — which is the state of the device this was
 * built against, and the state of a CI runner always. With this switched on,
 * every screen from "connect" to "broadcast" runs for real: the same
 * navigation, the same form rules, the same call built by the same staking
 * package. The only thing that does not happen is the signature.
 *
 * It is off unless `EXPO_PUBLIC_MOCK_WALLET` is set, so a release build has no
 * route to it. The address below is a real mainnet address with a real
 * position, chosen so that the position screen has something to draw; nothing
 * is signed on its behalf and no key for it exists here.
 */

export const MOCK_ADDRESS =
  process.env.EXPO_PUBLIC_MOCK_ADDRESS ||
  'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR';

export const MOCK_BTC_ADDRESS =
  process.env.EXPO_PUBLIC_MOCK_BTC_ADDRESS ||
  'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

/**
 * A txid shaped like a real one, so the screens that show it are honest about
 * what they are showing. Recognisably not a real transaction — it is all `d`
 * and `e` — and the right length and alphabet for every place one is printed,
 * copied or linked.
 */
export const MOCK_TXID =
  '0xdeadbeef' + 'de'.repeat(28);

export function mockWalletEnabled(): boolean {
  return process.env.EXPO_PUBLIC_MOCK_WALLET === '1';
}

export type MockWalletOptions = {
  address?: string;
  btcAddress?: string;
  txid?: string;
  /** Rejects instead of answering, to exercise the error paths. */
  failWith?: Error;
  /** Records every call handed over, for the tests to assert on. */
  calls?: ContractCallRequest[];
};

export function mockWallet(options: MockWalletOptions = {}): Wallet {
  return {
    id: 'mock',
    name: 'Test wallet',

    async connect(): Promise<WalletAccount> {
      if (options.failWith) throw options.failWith;
      return {
        stxAddress: options.address ?? MOCK_ADDRESS,
        btcAddress: options.btcAddress ?? MOCK_BTC_ADDRESS,
        walletId: 'mock',
      };
    },

    async callContract(request: ContractCallRequest): Promise<{ txid: string }> {
      options.calls?.push(request);
      if (options.failWith) throw options.failWith;
      return { txid: options.txid ?? MOCK_TXID };
    },

    async cancel(): Promise<void> {},

    async disconnect(): Promise<void> {},
  };
}

export { WalletCancelled };
