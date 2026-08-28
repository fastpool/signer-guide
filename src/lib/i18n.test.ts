import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUNDLES, LOCALES } from '../locales';
import { detectLocale, formatLastUpdate, translator } from './i18n';

describe('translator', () => {
  it('fills placeholders in the reader’s language', () => {
    expect(translator('en')('badge.feeCapped', { percent: 5 })).toBe(
      'Fee capped at 5%',
    );
    expect(translator('ko')('badge.feeCapped', { percent: 5 })).toBe(
      '수수료 상한 5%',
    );
  });

  it('leaves a placeholder alone rather than printing "undefined"', () => {
    expect(translator('en')('badge.feeCapped')).toBe(
      'Fee capped at {percent}%',
    );
  });

  it('picks one or other by count, in a language that has both', () => {
    const t = translator('en');
    expect(t.plural('contract.poolsRunning', 1)).toBe(
      'One pool runs this contract',
    );
    expect(t.plural('contract.poolsRunning', 4)).toBe(
      '4 pools run this contract',
    );
  });

  it('is the same object for the same language, so props stay stable', () => {
    expect(translator('ko')).toBe(translator('ko'));
    expect(translator('ko')).not.toBe(translator('en'));
  });

  it('puts an element where the translator put the placeholder', () => {
    // The point of rich messages: Korean wants the link at the end of the
    // sentence, English in the middle, and neither has to be cut up in JSX.
    const link = renderToStaticMarkup(
      translator('en').rich('signer.runsContract', {
        link: 'THE-LINK',
      }) as React.ReactElement,
    );
    expect(link).toBe('Runs the THE-LINK');

    const ko = renderToStaticMarkup(
      translator('ko').rich('signer.runsContract', {
        link: 'THE-LINK',
      }) as React.ReactElement,
    );
    expect(ko).toBe('다음 서명자 컨트랙트를 사용합니다: THE-LINK');
  });
});

describe('the language files', () => {
  it('all answer for the same keys', () => {
    // Typing enforces this at build time; this catches a bundle that only
    // typechecks because somebody reached for a cast.
    const keys = Object.keys(BUNDLES.en.messages).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(BUNDLES[locale].messages).sort()).toEqual(keys);
    }
  });

  it('leaves nothing in English that a reader would notice', () => {
    // Every message differing between the two is the point of translating.
    // The ones that legitimately match are named here so a new untranslated
    // string cannot slip in unnoticed.
    // A unit symbol is the same word in both languages; translating 'sats' or
    // 'sBTC' into anything else would be inventing a name for it.
    const shared = new Set([
      'amount.plain',
      'amount.sats',
      'amount.sbtc',
      // A figure and its unit, with no sentence around it to translate.
      'app.stxOnlyEstimate.satsShort',
    ]);
    const untranslated = Object.keys(BUNDLES.en.messages).filter((key) => {
      const messages = BUNDLES.ko.messages as Record<string, string>;
      const english = BUNDLES.en.messages as Record<string, string>;
      return !shared.has(key) && messages[key] === english[key];
    });
    expect(untranslated).toEqual([]);
  });
});

describe('detectLocale', () => {
  it('falls back to English rather than throwing on a runtime without one', () => {
    expect(['en', 'ko']).toContain(detectLocale());
  });
});

describe('formatLastUpdate', () => {
  it('reads the date in the reader’s calendar, always in UTC', () => {
    const at = '2026-03-09T07:05:00.000Z';
    expect(formatLastUpdate(at, 'en')).toBe('9 March 2026, 07:05 UTC');
    expect(formatLastUpdate(at, 'ko')).toBe('2026년 3월 9일, 07:05 UTC');
  });
});
