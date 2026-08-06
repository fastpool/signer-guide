import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Identicon from './Identicon';

/*
 * Two states, and the difference between them is the whole point: an icon is
 * a claim about which code a pool runs, and there are pools we cannot make
 * that claim about yet. Neither may be mistaken for the other.
 */

const HASH =
  'd89fc8775ea2b1b5db173427cef51e3b7e164d33b7b4b11ff925e0ea78b2c20c';

describe('Identicon', () => {
  it('draws the code when there is a hash for it', () => {
    const html = renderToStaticMarkup(<Identicon hash={HASH} locale='en' />);
    expect(html).toContain('<svg viewBox="-1.5 -1.5 8 8"');
    expect(html).toContain('aria-label="Icon of the code this pool runs"');
  });

  it('marks new code as new rather than leaving a gap', () => {
    const html = renderToStaticMarkup(<Identicon hash={null} locale='en' />);
    expect(html).toContain('aria-label="New code — no icon for it yet"');
    // Says so in the reader's language, not only to a screen reader.
    expect(html).toContain('border-dashed');
  });

  it('never draws a grid it does not have', () => {
    // A placeholder that looked like an identicon would be an icon for code
    // nobody has hashed — a wrong claim, and a quieter one than a gap.
    const html = renderToStaticMarkup(<Identicon hash={null} locale='en' />);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<rect');
  });

  it('says both things in Korean too', () => {
    expect(
      renderToStaticMarkup(<Identicon hash={HASH} locale='ko' />),
    ).toContain('aria-label="이 풀이 실행하는 코드의 아이콘"');
    expect(
      renderToStaticMarkup(<Identicon hash={null} locale='ko' />),
    ).toContain('aria-label="새로운 코드 — 아직 아이콘이 없습니다"');
  });

  it('takes the size it is given, at either state', () => {
    for (const hash of [HASH, null]) {
      const html = renderToStaticMarkup(
        <Identicon hash={hash} locale='en' className='h-12 w-12' />,
      );
      expect(html).toContain('h-12 w-12');
    }
  });
});
