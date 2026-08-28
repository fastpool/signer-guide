import type { MessageKey } from '../i18n/en';
import { WALLET_NAMES } from './walletconnect';
import type { WalletId } from './types';

/**
 * What to put on the button for each entry in the wallet list.
 *
 * A wallet's name is a proper noun and is never translated. The other two
 * entries are not wallets: `any` copies a pairing link and `mock` is a
 * stand-in, and both say what they do rather than who they are — which makes
 * them sentences, and sentences have to be translated like any other.
 */
export function walletLabel(
  walletId: WalletId,
  t: (key: MessageKey) => string,
): string {
  if (walletId === 'any') return t('wallet.copyLink');
  if (walletId === 'mock') return t('wallet.testWallet');
  return WALLET_NAMES[walletId];
}
