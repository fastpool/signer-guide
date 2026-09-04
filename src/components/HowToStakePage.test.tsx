/**
 * The page for somebody who has not staked before.
 *
 * What is worth holding still here is the shortness — three steps, and the
 * numbers 1, 2, 3 actually on the screen — and the one place the page could do
 * harm: it is telling a reader where to send bitcoin, so a pool must never be
 * rendered with a link nobody put in the data.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HowToStakePage from './HowToStakePage';
import { translator } from '../lib/i18n';
import { SBTC_POOLS } from '../lib/sbtc-pools';

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const html = () =>
  renderToStaticMarkup(<HowToStakePage locale='en' onLocaleChange={() => {}} />);

describe('staking in three steps', () => {
  const t = translator('en');

  it('is three steps for STX, numbered', () => {
    const page = html();
    for (const key of ['one', 'two', 'three'] as const) {
      expect(page).toContain(t(`howTo.stx.${key}.title`));
    }
    expect(page).toContain('>1<');
    expect(page).toContain('>2<');
    expect(page).toContain('>3<');
  });

  it('sends the reader to the list to choose, and to their own address after', () => {
    const page = html();
    expect(page).toContain('href="#/"');
    expect(page).toContain('href="#/status"');
  });

  it('is three steps for sBTC too, so the shape is the same', () => {
    const page = html();
    for (const key of ['one', 'two', 'three'] as const) {
      expect(page).toContain(t(`howTo.sbtc.${key}.title`));
    }
  });
});

describe('the sBTC pools', () => {
  it('names every one of them', () => {
    const page = html();
    for (const pool of SBTC_POOLS) expect(page).toContain(pool.name);
  });

  it('links only the ones with a URL on file', () => {
    /*
     * The page tells somebody where to send bitcoin. A pool we have no address
     * for is named and left unlinked; inventing one, or reusing a neighbour's,
     * is the one mistake on this page that would cost a reader money.
     */
    const page = html();
    const withUrl = SBTC_POOLS.filter((pool) => pool.url !== null);
    const without = SBTC_POOLS.filter((pool) => pool.url === null);
    expect(withUrl.length).toBeGreaterThan(0);

    for (const pool of withUrl) expect(page).toContain(`href="${pool.url}"`);
    if (without.length > 0) {
      expect(page).toContain(translator('en')('howTo.sbtc.noLink'));
    }
    // One anchor per pool that has one, and no more.
    expect(page.match(/href="https:\/\//g)?.length ?? 0).toBe(withUrl.length);
  });

  it('says the terms are the pool’s own, not read off the chain', () => {
    // Every other pool in this guide is described from its own contract. These
    // are not, and a reader who does not know that would over-trust the page.
    expect(html()).toContain('Read the pool’s own terms');
  });
});
