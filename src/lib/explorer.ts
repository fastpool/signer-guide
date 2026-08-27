const EXPLORER = 'https://explorer.hiro.so';

/** Hiro's explorer takes contract ids and transaction ids on the same route. */
export function explorerUrl(idOrTxid: string): string {
  return `${EXPLORER}/txid/${idOrTxid}?chain=mainnet`;
}

/**
 * A Bitcoin block by its height.
 *
 * The heights on the rewards pages are burn heights — Bitcoin's, not Stacks's
 * — and this is the route that takes one as a number rather than as a hash.
 */
export function burnBlockUrl(height: number): string {
  return `${EXPLORER}/btcblock/${height}?chain=mainnet`;
}
