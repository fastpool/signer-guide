/**
 * The page an address check and the rewards page were merged into.
 *
 * Both asked a reader for one address and then answered half of what they
 * came for. What is tested is that the merged page still opens on a box that
 * asks the chain nothing, that a row exists for every address before any
 * answer lands, and that the rewards read is not attached to a row that has
 * no position to key it by.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusPage from './StatusPage';
import signers from '../data/signers.json';
import { translator } from '../lib/i18n';
import type { SignerData } from '../lib/types';

const ALL = (signers as SignerData).signers;
const ONE = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const TWO = 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4';

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const render = (principals: string[]) =>
  renderToStaticMarkup(
    <StatusPage
      principals={principals}
      signers={ALL}
      locale='en'
      onLocaleChange={() => {}}
    />,
  );

describe('the merged address page', () => {
  const t = translator('en');

  it('asks both halves of the question in its heading', () => {
    // It was "Where is my STX staked?" on one page and "What are my rewards?"
    // on another, for the same address.
    expect(t('status.heading')).toContain('earned');
    expect(render([])).toContain(t('status.heading'));
  });

  it('opens on the box, with nothing to show and nothing asked', () => {
    const html = render([]);
    expect(html).toContain(t('status.inputLabel'));
    expect(html).not.toContain(t('status.resultsHeading.one'));
  });

  it('has a row for every address before any answer lands', () => {
    /*
     * Derived from the hash rather than from the answers, so the list is its
     * full height on the first render and nothing jumps under a finger as the
     * rows fill in. Said as "reading" — an empty row that looks settled is a
     * reader being told they are not staking.
     */
    const html = render([ONE, TWO]);
    expect(html).toContain(ONE.slice(0, 8));
    expect(html).toContain(TWO.slice(0, 8));
    expect(html).toContain(t('stake.checking'));
  });

  it('offers no rewards read for a row with no position yet', () => {
    // Every reward read is keyed by the signer in the position. Until one
    // lands there is nothing to ask pox-5 about.
    expect(render([ONE])).not.toContain(t('myRewards.show'));
    expect(render([ONE])).not.toContain(t('myRewards.atPox5'));
  });
});
