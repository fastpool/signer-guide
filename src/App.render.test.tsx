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
    cycle: 142,
    ustx: {
      'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager':
        '8215865483722',
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer':
        '253000000',
      // Read, and the node would not answer for it.
      'SP1Q1CZV7X4N1MCW5G96FR3B1MT8XGFB0YTZWAX85.signer-manager-hiro': null,
      // Read, and empty in every cycle — the one the default filter hides.
      'SP3KF99SM1T2V25NF2JZYAD1ZADC8326PH6HD7HF6.not-used': '0',
    },
    next: {
      cycle: 143,
      ustx: {
        'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager':
          '7100000000000',
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer':
          '253000000',
        'SP1Q1CZV7X4N1MCW5G96FR3B1MT8XGFB0YTZWAX85.signer-manager-hiro': null,
        'SP3KF99SM1T2V25NF2JZYAD1ZADC8326PH6HD7HF6.not-used': '0',
      },
    },
    previous: {
      cycle: 141,
      ustx: {
        'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager':
          '8000000000000',
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer':
          '253000000',
        'SP1Q1CZV7X4N1MCW5G96FR3B1MT8XGFB0YTZWAX85.signer-manager-hiro': null,
        'SP3KF99SM1T2V25NF2JZYAD1ZADC8326PH6HD7HF6.not-used': '0',
      },
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
    expect(html).toContain('for cycle 142');
  });

  it('shows what the cycle now filling holds as well', () => {
    // Two cycles, two numbers: somebody who has left is already out of the
    // second one, which is the whole reason it is worth printing.
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Cycle 143 is still filling');
    expect(html).toContain('7.1 million STX');
  });

  it('leaves out a pool that every cycle on file says is empty', () => {
    // Fifteen of the registered signers hold nothing and never have. They are
    // real contracts and the guide says so on their own pages; the list a
    // reader chooses from is not the place for them.
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain('Not Used');
    // And the count says the list is not everything.
    expect(html).toContain('of 45 pools match');
  });

  it('keeps a pool the guide has only just seen, and says it is new', () => {
    // It holds nothing because the cycles on file were locked in before it
    // existed, which is not the same as nobody wanting it.
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Stakin 1');
    expect(html).toContain('>New<');
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
    const cards = html.split('rounded-3xl bg-card').length - 1;
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

  it('draws an icon of the code beside each contract and each pool', () => {
    // The icon is the only claim on this page a reader takes in without
    // reading anything, so it renders inline rather than as an <img> that a
    // slow network can leave blank, and it carries a label saying what it is
    // an icon of — the code, not the address.
    const html = renderToStaticMarkup(<App />);
    const icons = html.split('<svg viewBox="-1.5 -1.5 8 8"').length - 1;
    // Six contracts and every pool that could be standardised.
    expect(icons).toBeGreaterThan(6);
    expect(html).toContain('aria-label="Icon of the code this pool runs"');
    // Every committed pool has a hash, so nothing on this page is new code.
    // The placeholder here would mean a contract lost its icon to a
    // disagreement among its pools, which is not what it says.
    expect(html).not.toContain('New code — no icon for it yet');
  });

  it('keeps a contract icon that one of its pools does not share', () => {
    // The Standard contract has a pool deploying its code without the header
    // comment: same code by the fingerprint above it, different SIP-043 hash.
    // The page shows what the rest of them show, and says how many it is
    // speaking for rather than letting the icon speak for all of them.
    vi.stubGlobal('window', {
      location: { hash: '#/contract/standard' },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('<svg viewBox="-1.5 -1.5 8 8"');
    expect(html).toContain('pools above show');
    expect(html).not.toContain('The icon every pool above shows');
  });

  it('gives one pool a page of its own, with its signer key on it', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#/signer/SP21D6BW36TSGWAZS8K4JAJVTNXWKQN9G3TH5MG6A.signer-manager-bd-contract',
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Signer key');
    expect(html).toContain(
      '0x03a541c1ec2cfb32da48cfadf439c9b2f27d166bbffa18a178c7a6a0d54cfa7813',
    );
  });

  it('names the other contract registered against the same key', () => {
    // The point of the page. A reader looking at this contract is looking at
    // half a signer, and nothing else in the guide would tell them so — the
    // sibling is deployed by a different address, so even the contract id
    // gives no hint that the two are one.
    vi.stubGlobal('window', {
      location: {
        hash: '#/signer/SP21D6BW36TSGWAZS8K4JAJVTNXWKQN9G3TH5MG6A.signer-manager-bd-contract',
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('2 contracts are registered against this key');
    expect(html).toContain('signer-manager-blockdaemon-v1');
    expect(html).toContain(
      '#/signer/SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.signer-manager-blockdaemon-v1',
    );
    expect(html).toContain('— this page');
  });

  it('shows the list rather than a blank page for a pool it does not have', () => {
    vi.stubGlobal('window', {
      location: { hash: '#/signer/SP000000000000000000002Q6VF78.made-up' },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('All pools');
    expect(html).not.toContain('Signer key');
  });

  it('asks for nothing before a reader opens a pool', () => {
    // The history is fetched per signer and per cycle, so a reader on the
    // list page downloads none of it. A fetch here would mean forty-odd
    // requests for data nobody has asked to see.
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderToStaticMarkup(<App />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers a way to check your own addresses from the list page', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Check an address');
    expect(html).toContain('href="#/status"');
  });

  it('opens the status page with a box, asking the chain nothing', () => {
    // The one page that reads an address a person typed. With none given there
    // is nothing to read, and it must not go looking anyway.
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('window', {
      location: { hash: '#/status' },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Where is my STX staked?');
    expect(html).toContain('Stacks addresses');
    expect(html).toContain('Up to 20');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers both address questions from the header, and no newsletter', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('href="#/status"');
    expect(html).toContain('href="#/rewards/mine"');
    // The signup was the first thing under the amounts and is gone.
    expect(html).not.toContain('newsletter');
  });

  it('opens the rewards page with a box, asking the chain nothing', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('window', {
      location: { hash: '#/rewards/mine' },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });

    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('What are my rewards?');
    expect(html).toContain('A Stacks address or a BNS name');
    // Nothing to look up until somebody types something.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the payout history, and asks for it only when opened', () => {
    // The file is fetched by the page rather than shipped to every reader, so
    // what the first render owes them is the page and a word about waiting —
    // never a blank, and never a number it does not have yet.
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('window', {
      location: { hash: '#/rewards/stx-only/history' },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });

    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('What every distribution has paid');
    expect(html).toContain('Reading the payout history');
    expect(html).toContain('href="#/rewards/stx-only"');
    // renderToStaticMarkup runs no effects, so the request belongs to the
    // browser, not to this: what matters here is that nothing else fetched.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('takes addresses straight from a link, so one can be shared', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#/status/SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR,SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X.ccd014-pox5-staking-mia',
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('2 addresses');
    // Both listed, and neither yet claimed to be staking nothing.
    expect(html).toContain('SP2C2YF');
    expect(html).toContain('ccd014-pox5-staking-mia');
    expect(html).not.toContain('Not staking.');
  });

  it('takes a BNS name from the link and shows the name itself', () => {
    // A name is what its owner recognises, so it leads the card — the address
    // it resolves to is secondary, and arrives once the registry answers.
    vi.stubGlobal('window', {
      location: {
        hash: '#/status/friedger.btc,SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR',
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {},
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('2 addresses');
    expect(html).toContain('friedger.btc');
    // Not yet resolved, and nothing claimed about it either way.
    expect(html).not.toContain('Not staking.');
    expect(html).not.toContain('Nobody owns this name');
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
