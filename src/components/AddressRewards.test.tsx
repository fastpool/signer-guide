/**
 * The half of the address page that costs something.
 *
 * A call to pox-5 for every cycle since it opened, then a probe or two of the
 * pool — so when it reads without being asked, and when it waits to be asked,
 * is the whole of what is worth pinning down here.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressRewards from './AddressRewards';
import { translator } from '../lib/i18n';

const ADDRESS = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const SIGNER =
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager';

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const render = (auto: boolean) =>
  renderToStaticMarkup(
    <AddressRewards
      address={ADDRESS}
      signer={SIGNER}
      firstCycle={100}
      currentCycle={142}
      auto={auto}
      locale='en'
    />,
  );

describe('what an address has earned', () => {
  const t = translator('en');

  it('waits to be asked when it is one row in a list', () => {
    // Sixty calls to pox-5 per address, for a reader scanning twenty of them,
    // is not what they asked for by pasting a list.
    const html = render(false);
    expect(html).toContain(t('myRewards.show'));
    expect(html).not.toContain(t('myRewards.atPox5'));
  });

  it('reads straight away for a reader looking at one address', () => {
    // They asked this question. A button saying "ask it" is the page
    // pretending not to know what they came for.
    const html = render(true);
    expect(html).toContain(t('myRewards.title'));
    expect(html).not.toContain(t('myRewards.show'));
  });
});
