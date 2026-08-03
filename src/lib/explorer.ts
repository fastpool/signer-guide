const EXPLORER = 'https://explorer.hiro.so';

/** Hiro's explorer takes contract ids and transaction ids on the same route. */
export function explorerUrl(idOrTxid: string): string {
  return `${EXPLORER}/txid/${idOrTxid}?chain=mainnet`;
}
