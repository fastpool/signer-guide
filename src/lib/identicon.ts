/**
 * Drawing a contract's identicon, per SIP-043 (draft).
 * https://github.com/stacksgov/sips/pull/266
 *
 * The seed is the identicon hash carried in signers.json — SHA-512/256 of the
 * standardised source, computed by the generator (scripts/identicon.ts). The
 * page never computes it: SHA-512/256 is not one of the digests Web Crypto
 * offers, and the source it would have to hash is not on the page anyway.
 *
 * Everything here is the SIP's §3: the `minidenticons` library, seeded with
 * the lowercase hex hash, no other input. Two notes on doing that literally:
 *
 *  - The SIP names the function `minidenticonSvg`. In minidenticons 4.x that
 *    export is the `<minidenticon-svg>` custom element, registered as a side
 *    effect and needing a DOM; the function that returns an SVG string is
 *    `minidenticon`. Same drawing, and this uses it directly so nothing
 *    depends on custom elements being available.
 *  - The SIP calls saturation 50 and lightness 50 "default". The library's own
 *    defaults are 95 and 45. Passing them explicitly is what the SIP asks for
 *    either way, so the numbers below are its numbers, not the library's, and
 *    the difference cannot silently change what is drawn.
 *
 * Colour is the one thing an implementation may choose; the grid is not. Two
 * pools running the same code show the same silhouette here, in a wallet, and
 * in an explorer, whatever any of them does about the palette.
 */

import { minidenticon } from 'minidenticons';

/** Where a reader can check what the icon is and how it is drawn. */
export const SIP_IDENTICON_URL = 'https://github.com/stacksgov/sips/pull/266';

/** SIP-043 §3, stated defaults. */
export const IDENTICON_SATURATION = 50;
export const IDENTICON_LIGHTNESS = 50;

/** A 64-character lowercase hex hash — the only seed the SIP allows. */
const SEED = /^[0-9a-f]{64}$/;

export function isIdenticonHash(value: string | null): value is string {
  return value !== null && SEED.test(value);
}

/**
 * The identicon as an SVG string: a 5×5 symmetric grid on a transparent
 * ground, sized by whatever contains it.
 *
 * Throws on a seed that is not the hash, rather than drawing something. An
 * icon is a claim about which code this is, and one drawn from the wrong seed
 * is a wrong claim — quieter than a blank space and worse.
 */
export function identiconSvg(hash: string): string {
  if (!SEED.test(hash)) {
    throw new Error(`Not an identicon hash: ${hash.slice(0, 16)}…`);
  }
  return minidenticon(hash, IDENTICON_SATURATION, IDENTICON_LIGHTNESS);
}
