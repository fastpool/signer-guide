import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PoolName from './PoolName';

/*
 * Two states, and a reader has to be able to tell them apart at a glance:
 * a name somebody confirmed, and a name we made out of a contract id. The
 * second is most of them, which is exactly why it may not look like the first.
 */

const confirmed = { displayName: 'Senseinode', displayNameSource: 'manual' as const };
const guessed = { displayName: 'Pox5', displayNameSource: 'contract' as const };

describe('PoolName', () => {
  it('ticks a name a person confirmed', () => {
    const html = renderToStaticMarkup(
      <PoolName signer={confirmed} locale='en' />,
    );
    expect(html).toContain('Senseinode');
    expect(html).toContain('✓');
    expect(html).not.toContain('italic');
  });

  it('sets a name read off the contract in italic, with no tick', () => {
    const html = renderToStaticMarkup(<PoolName signer={guessed} locale='en' />);
    expect(html).toContain('Pox5');
    expect(html).toContain('italic');
    expect(html).not.toContain('✓');
  });

  it('says which it is in words, not only in type', () => {
    // The italic is invisible to a screen reader and to anyone who does not
    // know the convention, so neither state relies on it alone.
    expect(
      renderToStaticMarkup(<PoolName signer={confirmed} locale='en' />),
    ).toContain('Name confirmed');
    expect(
      renderToStaticMarkup(<PoolName signer={guessed} locale='en' />),
    ).toContain('not confirmed by the pool');
  });

  it('keeps the tick out of the accessible name and says it in words instead', () => {
    const html = renderToStaticMarkup(
      <PoolName signer={confirmed} locale='en' />,
    );
    // A screen reader reading "Senseinode check mark" would be worse than
    // useless; the sentence is what carries the meaning.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('sr-only');
  });

  it('says both things in Korean too', () => {
    expect(
      renderToStaticMarkup(<PoolName signer={confirmed} locale='ko' />),
    ).toContain('확인된 이름');
    expect(
      renderToStaticMarkup(<PoolName signer={guessed} locale='ko' />),
    ).toContain('컨트랙트 이름에서 읽은 이름');
  });
});
