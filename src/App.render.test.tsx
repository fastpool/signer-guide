import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { CACHE_KEY } from './lib/locked';

/*
 * Renders the real page to HTML and reads it the way a visitor would. Enough
 * of a browser is stubbed to get through the first render — no DOM library,
 * because the point is what the markup says, not how it behaves.
 */

/** Seeded cache, so the first render already has the amounts. */
const CACHED = {
  cycle: 141,
  readAt: Date.now(),
  ustx: {
    'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager':
      '8215865483722',
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer':
      '253000000',
    // Read, and the node would not answer for it.
    'SP1Q1CZV7X4N1MCW5G96FR3B1MT8XGFB0YTZWAX85.signer-manager-hiro': null,
  },
};

beforeEach(() => {
  const store = new Map<string, string>([[CACHE_KEY, JSON.stringify(CACHED)]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: store.size,
  });
  vi.stubGlobal('window', {
    location: { hash: '#/' },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, json: async () => ({}) })),
  );
});

describe('the page as a reader sees it', () => {
  it('shows the amounts it already has, without waiting for the node', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('8.2 million STX');
    expect(html).toContain('253 STX');
    expect(html).toContain('looking after');
    expect(html).toContain('for cycle 141');
  });

  it('says a pool is unknown rather than empty when it would not read', () => {
    // "We could not find out" and "there is nothing in it" are different
    // things to tell someone about a pool.
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('amount not known');
    expect(html).not.toContain('nothing staked yet');
  });

  it('shows no amount at all for a pool the cache predates', () => {
    // A pool that registered after the last read is absent from the cache
    // rather than null. Claiming it is unknown would be a guess; the next
    // read, within the hour, has it.
    const html = renderToStaticMarkup(<App />);
    const cards = html.split('rounded-3xl bg-white').length - 1;
    const amounts =
      html.split('staked here').length -
      1 +
      html.split('amount not known').length -
      1;
    expect(amounts).toBeLessThan(cards);
  });

  it('puts the biggest pool first', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html.indexOf('8.2 million STX')).toBeLessThan(
      html.indexOf('253 STX'),
    );
  });
});
