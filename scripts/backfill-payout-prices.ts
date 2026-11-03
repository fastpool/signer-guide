/**
 * Fills in the STX and BTC price for payouts recorded before the refresh
 * started writing them down.
 *
 * From now on each payout is recorded with the price at the run that first
 * saw it, within an hour of the payout. The ones before that get CoinGecko's
 * daily price for the day of the payout's burn block, which is close enough
 * for an APY and is said to be daily in the type's note. A payout that
 * already has a price is left alone, and one whose day CoinGecko cannot
 * answer for stays without.
 *
 * Run once, by hand:
 *   npx tsx scripts/backfill-payout-prices.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StxOnlyHistory } from '../src/lib/types.js';

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'stx-only-history.json',
);
const SATS_PER_BTC = 100_000_000;
const MEMPOOL = 'https://mempool.space/api';
const GECKO = 'https://api.coingecko.com/api/v3';

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function json<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return (await response.json()) as T;
    if (response.status === 429 && attempt < 4) {
      await sleep(20_000);
      continue;
    }
    throw new Error(`${url} answered ${response.status}`);
  }
}

/** The burn block's time, as CoinGecko's dd-mm-yyyy day. */
async function dayOf(burnHeight: number): Promise<string> {
  // mempool.space knows every Bitcoin block; Hiro's burn-block index only
  // the ones a Stacks block was mined in, and answers 404 for the rest.
  const hash = await (
    await fetch(`${MEMPOOL}/block-height/${burnHeight}`)
  ).text();
  const block = await json<{ timestamp: number }>(`${MEMPOOL}/block/${hash}`);
  const date = new Date(block.timestamp * 1000);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getUTCFullYear()}`;
}

async function priceOn(
  coin: string,
  day: string,
): Promise<{ btc?: number; usd?: number } | null> {
  const body = await json<{
    market_data?: { current_price?: { btc?: number; usd?: number } };
  }>(`${GECKO}/coins/${coin}/history?date=${day}&localization=false`);
  return body.market_data?.current_price ?? null;
}

async function main(): Promise<void> {
  const history = JSON.parse(fs.readFileSync(FILE, 'utf8')) as StxOnlyHistory;
  let filled = 0;
  for (const payout of history.distributions) {
    if (payout.stxPriceSats != null && payout.btcPriceUsd != null) continue;
    const day = await dayOf(payout.burnHeight);
    const stx = await priceOn('blockstack', day);
    await sleep(2_500);
    const btc = await priceOn('bitcoin', day);
    await sleep(2_500);
    if (payout.stxPriceSats == null && stx?.btc) {
      payout.stxPriceSats = String(Math.round(stx.btc * SATS_PER_BTC));
    }
    if (payout.btcPriceUsd == null && btc?.usd) {
      payout.btcPriceUsd = Math.round(btc.usd);
    }
    filled++;
    console.log(
      `cycle ${payout.cycle} at ${payout.burnHeight} (${day}): ` +
        `STX ${payout.stxPriceSats ?? '?'} sats, BTC $${payout.btcPriceUsd ?? '?'}`,
    );
  }
  if (filled === 0) {
    console.log('Every payout already has a price.');
    return;
  }
  fs.writeFileSync(FILE, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`Filled ${filled} payout(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
