import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { StxOnlyHistory } from '../lib/types';

/*
 * The file the page reads is fetched, not bundled, so the fetch is replaced
 * here and the page is read the way a visitor would read it — with mainnet's
 * first two distributions in it.
 */
const HISTORY: StxOnlyHistory = {
  generatedAt: '2026-08-27T08:46:49.682Z',
  distributions: [
    {
      cycle: 141,
      distributionIndex: 282,
      firstOfCycle: true,
      burnHeight: 963_199,
      cumulativeRewardsPerUstx: '350915540939',
      rateSatsPer1000Stx: '350',
    },
    {
      cycle: 141,
      distributionIndex: 283,
      firstOfCycle: false,
      burnHeight: 964_249,
      cumulativeRewardsPerUstx: '758607677183',
      rateSatsPer1000Stx: '407',
    },
    {
      cycle: 142,
      distributionIndex: 284,
      firstOfCycle: true,
      burnHeight: 965_299,
      cumulativeRewardsPerUstx: '400000000000',
      rateSatsPer1000Stx: '400',
    },
  ],
};

vi.mock('../lib/stx-only-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/stx-only-history')>()),
  useStxOnlyHistory: () => ({ state: 'ready', value: HISTORY }),
}));

const { default: StxOnlyHistoryPage } = await import('./StxOnlyHistoryPage');

describe('the payout history as a reader sees it', () => {
  const html = () =>
    renderToStaticMarkup(
      <StxOnlyHistoryPage locale='en' onLocaleChange={() => {}} />,
    );

  it('gives each cycle its two payouts, as paid', () => {
    const page = html();
    expect(page).toContain('Cycle 141');
    expect(page).toContain('First half');
    expect(page).toContain('350 sats per 1000 STX');
    expect(page).toContain('Second half');
    expect(page).toContain('407 sats per 1000 STX');
  });

  it('totals a finished cycle from the chain rather than by adding halves', () => {
    // 350 + 407 is 757. Cycle 141 paid 758.
    expect(html()).toContain('758 sats per 1000 STX');
    expect(html()).not.toContain('757 sats per 1000 STX');
  });

  it('says a half-paid cycle is still paying instead of totalling it', () => {
    const page = html();
    expect(page).toContain('Cycle 142');
    expect(page).toContain('still paying');
  });

  it('puts the newest cycle at the top', () => {
    const page = html();
    expect(page.indexOf('Cycle 142')).toBeLessThan(page.indexOf('Cycle 141'));
  });

  it('links each payout to the Bitcoin block it was computed in', () => {
    expect(html()).toContain('btcblock/964249');
  });
});
