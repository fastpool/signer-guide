import { describe, expect, it } from 'vitest';
import {
  IDENTICON_LIGHTNESS,
  IDENTICON_SATURATION,
  identiconSvg,
  isIdenticonHash,
} from './identicon';

/*
 * An identicon is a claim that two pools run the same code, made in a form a
 * reader takes in without reading anything. What matters is that the claim is
 * true both ways: the same code always draws the same icon, and a different
 * hash does not quietly draw the same one.
 */

const HASH_A =
  'd89fc8775ea2b1b5db173427cef51e3b7e164d33b7b4b11ff925e0ea78b2c20c';
const HASH_B =
  'bfb482e8f51e9f84bde8ebbc1a2ef9955fcedf70ca226eae9b5a044d8ff666ec';

describe('identiconSvg', () => {
  it('draws the same icon for the same hash', () => {
    expect(identiconSvg(HASH_A)).toBe(identiconSvg(HASH_A));
  });

  it('draws a different icon for a different hash', () => {
    expect(identiconSvg(HASH_A)).not.toBe(identiconSvg(HASH_B));
  });

  it('is a bare SVG, so it takes the size of whatever holds it', () => {
    const svg = identiconSvg(HASH_A);
    expect(svg.startsWith('<svg viewBox=')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // The squares inside are sized; the element itself is not, so the class
    // on the span that holds it is what decides how big the icon is.
    const openingTag = svg.slice(0, svg.indexOf('>'));
    expect(openingTag).not.toContain('width=');
    expect(openingTag).not.toContain('height=');
  });

  it('uses the saturation and lightness the SIP states, not the library’s', () => {
    // minidenticons defaults to 95 and 45. Passing the SIP's numbers
    // explicitly is what keeps a library release from restyling the page.
    expect([IDENTICON_SATURATION, IDENTICON_LIGHTNESS]).toEqual([50, 50]);
    expect(identiconSvg(HASH_A)).toContain(
      `${IDENTICON_SATURATION}% ${IDENTICON_LIGHTNESS}%`,
    );
  });

  it('refuses a seed that is not the hash rather than drawing something', () => {
    // Anything else on screen would be an icon for code nobody hashed.
    expect(() => identiconSvg('')).toThrow();
    expect(() => identiconSvg('0x' + HASH_A.slice(2))).toThrow();
    expect(() => identiconSvg(HASH_A.toUpperCase())).toThrow();
    expect(() => identiconSvg(HASH_A.slice(0, 63))).toThrow();
  });
});

describe('isIdenticonHash', () => {
  it('accepts a 64-character lowercase hex hash and nothing else', () => {
    expect(isIdenticonHash(HASH_A)).toBe(true);
    expect(isIdenticonHash(null)).toBe(false);
    expect(isIdenticonHash('')).toBe(false);
    expect(isIdenticonHash(HASH_A.toUpperCase())).toBe(false);
  });
});
