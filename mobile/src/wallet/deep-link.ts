import { isStacksAddress } from './types';

/**
 * `signerguide://watch/SP…` — opening the app on somebody's position.
 *
 * A shareable link to a stake: send it to somebody and they see what that
 * address has staked and what it earns, read-only. Nothing is signed and no
 * wallet is involved, which is exactly what makes it safe to pass around — the
 * address is a public fact about the chain.
 *
 * It is also how the on-device tests reach the position screens. Typing a
 * forty-character address through an emulated keyboard takes over two minutes
 * on the device these were written against and times the runner out; a link
 * takes no time at all and exercises the same screens.
 *
 * Deliberately narrow. Only this one shape is understood, only a Stacks
 * address is accepted from it, and it can only put the app into a read-only
 * state — a link that could connect a wallet, prefill an amount or pick a pool
 * would be a link that could be sent to somebody with intent.
 */
export function watchAddressFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = /^signerguide:\/\/watch\/([^/?#]+)/i.exec(url.trim());
  if (!match) return null;
  const address = decodeURIComponent(match[1]).toUpperCase();
  return isStacksAddress(address) ? address : null;
}

export function watchUrlFor(address: string): string {
  return `signerguide://watch/${address.toUpperCase()}`;
}
