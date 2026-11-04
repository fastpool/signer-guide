/**
 * The two prices the page converts with, read once from the calculations.
 *
 * Both come from the hourly refresh (CoinGecko, see
 * scripts/generate-stx-only-calculations.ts), never from the reader's
 * browser: a page that called a price API on load would tell that API who is
 * reading about staking, and would show a different figure from the one the
 * rates on the same page were worked out with.
 */

import { usdFromSats, usdFromUstx } from './amounts';
import type { StxOnlyCalculations } from './types';

export interface Prices {
  /** One STX in sats, or null. */
  stxPriceSats: bigint | null;
  /** One BTC in dollars, or null. */
  btcPriceUsd: number | null;
  /** One STX in dollars, when both of the above are known. */
  stxPriceUsd: number | null;
}

export function pricesFrom(calculations: StxOnlyCalculations): Prices {
  let stxPriceSats: bigint | null = null;
  try {
    stxPriceSats =
      calculations.stxPriceSats == null
        ? null
        : BigInt(calculations.stxPriceSats);
  } catch {
    stxPriceSats = null;
  }
  if (stxPriceSats !== null && stxPriceSats <= 0n) stxPriceSats = null;
  const btc = calculations.btcPriceUsd;
  const btcPriceUsd =
    typeof btc === 'number' && Number.isFinite(btc) && btc > 0 ? btc : null;
  return {
    stxPriceSats,
    btcPriceUsd,
    stxPriceUsd:
      stxPriceSats !== null && btcPriceUsd !== null
        ? usdFromUstx(1_000_000n, stxPriceSats, btcPriceUsd)
        : null,
  };
}

/** Dollars for an STX amount, or null without both prices. */
export function ustxInUsd(
  ustx: bigint | null | undefined,
  prices: Prices,
): number | null {
  if (ustx == null || prices.stxPriceSats === null || !prices.btcPriceUsd) {
    return null;
  }
  return usdFromUstx(ustx, prices.stxPriceSats, prices.btcPriceUsd);
}

/** Dollars for sats, or null without the BTC price. */
export function satsInUsd(
  sats: bigint | null | undefined,
  prices: Prices,
): number | null {
  if (sats == null || prices.btcPriceUsd === null) return null;
  return usdFromSats(sats, prices.btcPriceUsd);
}
