/**
 * The pools that stake sBTC for you, for the page that explains staking.
 *
 * Not the same kind of thing as the signer pools the rest of this guide is
 * about, and deliberately much thinner. A signer pool is read out of its own
 * contract every hour — the fee, the ceiling, who may join — which is why this
 * guide can say what one does without asking anybody. These are products with
 * their own front ends, their own terms and no shared contract to read, so
 * what is written down here is only the name and where to go, and the page
 * says out loud that the detail is theirs rather than ours.
 *
 * A pool with no URL is listed by name and nothing else. That is deliberate:
 * an address nobody here has checked is worse than no address at all on a page
 * that is telling somebody where to send bitcoin.
 */

export const SBTC_POOL_IDS = ['esbee', 'stacking-dao', 'xverse'] as const;

export type SbtcPoolId = (typeof SBTC_POOL_IDS)[number];

export interface SbtcPool {
  id: SbtcPoolId;
  /** A proper noun. Never translated. */
  name: string;
  /** Where to go and read their terms, when we have a URL we trust. */
  url: string | null;
}

export const SBTC_POOLS: readonly SbtcPool[] = [
  { id: 'esbee', name: 'Esbee DAO', url: 'https://esbee-dao.org' },
  { id: 'stacking-dao', name: 'Stacking DAO', url: 'https://www.stackingdao.com' },
  { id: 'xverse', name: 'Xverse', url: 'https://www.xverse.app' },
];
