import { describe, expect, it } from 'vitest';
import { ellipsedAddr } from './strings';

describe('ellipsedAddr', () => {
  it('returns the same string if it is shorter than maxLength', () => {
    expect(ellipsedAddr('abc', 5)).toBe('abc');
  });

  it('returns the same string if it is equal to maxLength', () => {
    expect(ellipsedAddr('abcde', 5)).toBe('abcde');
  });

  it('returns an ellipsed string with two chars each side for 6 letters', () => {
    expect(ellipsedAddr('abcdef', 5)).toBe('ab…ef');
  });

  it('returns an ellipsed string if it is longer than maxLength', () => {
    expect(ellipsedAddr('abcdefghij', 8)).toBe('abcd…ghij');
  });

  it('handles odd maxLength values correctly', () => {
    expect(ellipsedAddr('abcdefghij', 7)).toBe('abc…hij');
  });
});