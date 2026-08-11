import { describe, expect, it } from 'vitest';
import {
  formatStx,
  formatUnits,
  parseUnits,
  shortPrincipal,
} from './format.js';

/*
 * Both reports print somebody's balance through these, so a dropped digit or
 * a decimal point in the wrong place is a wrong number about real money. The
 * pairs below are the cases that move it: a token with no decimals, one with
 * eight, and an amount whose fraction has leading zeros.
 */

describe('printing an amount', () => {
  it('keeps every decimal the token has', () => {
    expect(formatUnits(504_652_442n, 8)).toBe('5.04652442');
    expect(formatUnits(1n, 8)).toBe('0.00000001');
    expect(formatStx(41_530_653_232_810n)).toBe('41,530,653.232810');
  });

  it('does not lose the zeros in front of a fraction', () => {
    // 90 uSTX is 0.000090 STX, not 0.9 — the padding is the whole point.
    expect(formatStx(90n)).toBe('0.000090');
  });

  it('gives an NFT count no decimal point at all', () => {
    expect(formatUnits(7n, 0)).toBe('7');
    expect(formatUnits(1_234n, 0)).toBe('1,234');
  });

  it('groups only the whole part', () => {
    expect(formatUnits(1_234_567_891n, 4)).toBe('123,456.7891');
  });

  it('carries a sign rather than dropping it', () => {
    expect(formatStx(-1_500_000n)).toBe('-1.500000');
  });
});

describe('reading an amount somebody typed', () => {
  it('takes it in the units the token has', () => {
    expect(parseUnits('1', 8)).toBe(100_000_000n);
    expect(parseUnits('0.5', 8)).toBe(50_000_000n);
    expect(parseUnits('100', 6)).toBe(100_000_000n);
    expect(parseUnits('1,000', 6)).toBe(1_000_000_000n);
  });

  it('refuses a precision the token does not have', () => {
    // Rounding it to zero would turn "flag anything under this" into a filter
    // that flags nothing, silently.
    expect(() => parseUnits('0.0000001', 6)).toThrow(/decimal/);
    expect(() => parseUnits('lots', 6)).toThrow(/Not an amount/);
  });

  it('round-trips what it prints', () => {
    expect(formatUnits(parseUnits('12.345678', 8), 8)).toBe('12.34567800');
  });
});

describe('shortening a principal', () => {
  it('keeps both ends, so two addresses cannot be confused', () => {
    expect(shortPrincipal('SP3VR0QZKCZ8XRCYMQMF2Z487AEDH0SQRZGXAP8T0')).toBe(
      'SP3VR0QZ…AP8T0',
    );
  });

  it('keeps a contract name whole — it is the readable part', () => {
    expect(
      shortPrincipal('SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP.fastpool-1'),
    ).toBe('SP21YTSM…XEFFP.fastpool-1');
  });
});
