/**
 * What the rewards page says about the three rates it prints.
 *
 * It printed 407, 432 and 417 and left the reader to work out that the third
 * is made of the first two. It also dated the settled one by reward cycle —
 * "(cycle 141)" — which names a fortnight holding two payouts, so it did not
 * say which. Both are asserted here because both are about whether a number
 * on the page can be understood, which no typecheck catches.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StxOnlyRewardsEstimate from './StxOnlyRewardsEstimate';
import type { StxOnlyCalculations } from '../lib/types';

/** A cycle a fifth of the way through, with all three rates readable. */
const CALCULATIONS: StxOnlyCalculations = {
  cycle: 142,
  distributionBlocks: 1050,
  blocksIntoCycle: 231,
  blocksLeftInCycle: 819,
  currentBurnHeight: 964_480,
  lastRewardBurnHeight: 964_249,
  nextRewardBurnHeight: 965_299,
  totalStakedUstx: '421543815427560',
  bondStakedUstx: '0',
  stxOnlyStakedUstx: '421543815427560',
  stxPriceSats: '318',
  sbtcBalanceSats: '145388158',
  accruedRewardsSats: '47394545',
  bondShareSats: '0',
  foundationShareSats: '7109181',
  stxOnlySoFarSats: '40285364',
  projectedCycleSats: '183115290',
  projectedRateSatsPer1000Stx: '432',
  lastPayoutCycle: 141,
  lastPayoutRateSatsPer1000Stx: '407',
  cumulativeRewardsPerUstx: '758607677183',
  rateSatsPer1000Stx: '417',
  generatedAt: '2026-08-28T21:00:00.000Z',
};

const full = (calculations = CALCULATIONS) =>
  renderToStaticMarkup(
    <StxOnlyRewardsEstimate calculations={calculations} locale='en' mode='full' />,
  );

describe('the three rates', () => {
  it('shows all three, and offers the arithmetic from the one that needs it', () => {
    const html = full();
    expect(html).toContain('417 sats per 1000 STX');
    expect(html).toContain('432 sats per 1000 STX');
    expect(html).toContain('407 sats per 1000 STX');
    // The way in, beside the blended figure rather than under it.
    expect(html).toContain('how this is worked out');
  });

  it('keeps the weights in the answer, with this cycle’s own numbers in them', () => {
    // 231 blocks of this cycle's own figure, 819 of what was actually paid —
    // the arithmetic itself, so it is printed rather than described.
    const html = full();
    expect(html).toContain('counts for 231 of 1,050 blocks');
    expect(html).toContain('the other 819');
    // In the FAQ, not in the list of figures: the sentence appears after the
    // question it answers.
    const question = html.indexOf('So why does the published rate match neither?');
    expect(question).toBeGreaterThan(-1);
    expect(html.indexOf('counts for 231 of 1,050 blocks')).toBeGreaterThan(question);
  });

  it('dates the settled one instead of naming the cycle it paid for', () => {
    // 231 blocks before the file was written, at ten minutes a block: 38.5
    // hours back from 21:00 on the 28th.
    const html = full();
    expect(html).toContain('Last payout, as paid (27 August 2026, 06:30 UTC)');
    expect(html).not.toContain('cycle 141');
  });

  it('says only "last payout" when the height it happened at is missing', () => {
    // Older files carry no burn height, and a made-up date is worse than none.
    const html = full({ ...CALCULATIONS, lastRewardBurnHeight: null });
    expect(html).toContain('Last payout, as paid<');
  });
});

describe('the rate FAQ', () => {
  it('answers why there are three of them, on the page that shows three', () => {
    const html = full();
    expect(html).toContain('How the rate is worked out');
    expect(html).toContain('Why are there three rates on this page?');
    expect(html).toContain('So why does the published rate match neither?');
    // Closed by default: an answer for whoever wants it, not a wall.
    expect(html).not.toContain('<details open');
  });

  it('is not on the card the front page shows', () => {
    const compact = renderToStaticMarkup(
      <StxOnlyRewardsEstimate
        calculations={CALCULATIONS}
        locale='en'
        mode='compact'
      />,
    );
    expect(compact).not.toContain('How the rate is worked out');
  });
});

describe('the card on the front page', () => {
  const compact = () =>
    renderToStaticMarkup(
      <StxOnlyRewardsEstimate
        calculations={CALCULATIONS}
        locale='en'
        mode='compact'
      />,
    );

  it('leads with the published rate and what was last paid', () => {
    const html = compact();
    expect(html).toContain('417 sats per 1000 STX');
    expect(html).toContain('Last paid');
    expect(html).toContain('407 sats');
  });

  it('leaves this cycle’s own extrapolation to the full page', () => {
    // The noisiest figure the guide holds, and it disagrees with the headline
    // beside it. Unexplained on the first screen it is just a contradiction.
    const html = compact();
    expect(html).not.toContain('432');
    expect(html).not.toContain('This payout so far');
  });
});
