import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/*
 * Renders the real page to HTML and reads it the way a visitor would. Enough
 * of a browser is stubbed to get through the first render — no DOM library,
 * because the point is what the markup says, not how it behaves.
 */

/**
 * Stands in for src/data/totals.json, so these can assert on exact numbers
 * without breaking every time somebody stakes. What the real file is worth
 * saying about is that it parses and covers the pools, which App.test.ts
 * checks against the committed data.
 */
vi.mock('./data/totals.json', () => ({
  default: {
    cycle: 141,
    ustx: {
      'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager':
        '8215865483722',
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer':
        '253000000',
      // Read, and the node would not answer for it.
      'SP1Q1CZV7X4N1MCW5G96FR3B1MT8XGFB0YTZWAX85.signer-manager-hiro': null,
    },
  },
}));

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hash: '#/' },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
  });
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

describe('the page as a reader sees it', () => {
  it('shows the amounts from the last refresh, asking the node for nothing', () => {
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

  it('still lists signer-manager-hiro when its amount is null', () => {
    // A null total means "could not read" for this refresh, not "hide pool".
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('signer-manager-hiro');
    expect(html).toContain('amount not known');
  });

  it('shows no amount at all for a pool the last refresh predates', () => {
    // A pool that registered after the last read is absent from the file
    // rather than null. Claiming it is unknown would be a guess; the next
    // refresh, within the hour, has it.
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

  it('points a reader at the code behind every claim', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('https://github.com/fastpool/signer-guide');
  });

  it('says when the data was last read, above the pool list', () => {
    // The fees and amounts have a shelf life, so how old they are belongs
    // where someone is still deciding — not only in the footer.
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Last update:');
    expect(html).toMatch(/Last update: \d+ \w+ \d{4}, \d{2}:\d{2} UTC/);
    expect(html.indexOf('Last update:')).toBeLessThan(
      html.indexOf('All pools'),
    );
  });

  it('leaves no English behind for a Korean reader', () => {
    // The amounts used to say "amount not known" and "nothing staked yet" in
    // English whatever the page language was, because that copy lived in the
    // formatter rather than in a language file.
    vi.stubGlobal('navigator', { language: 'ko-KR' });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('내 STX를 어디에 스테이킹할 수 있을까?');
    expect(html).toContain('821.6만 STX');
    expect(html).toContain('금액 확인 불가');
    expect(html).not.toContain('amount not known');
    expect(html).not.toContain('staked here');
  });

  it('says who made it and that they run some of the pools listed', () => {
    // The guide ranks pools by size and Fast Pool operates several. Saying so
    // is the difference between a guide and an advertisement.
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('https://fastpool.org');
    expect(html).toContain('runs some of the pools listed above');
  });
});
