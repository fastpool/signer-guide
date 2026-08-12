import { describe, expect, it } from 'vitest';
import { ellipsedAddr, shortPrincipal } from './strings';

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
describe('shortPrincipal', () => {
  it('shortens a plain address like ellipsedAddr does', () => {
    expect(shortPrincipal('SMWFRYN9N7WB287SSZRYJ95ZHT4K3SH0TBQMFH5G')).toBe(
      'SMWFRYN…BQMFH5G',
    );
  });

  it('keeps a staking contract’s name whole', () => {
    // Several of the largest members of any signer are contracts, and the name
    // is the only part of one a reader can recognise. Cutting from the middle
    // of the whole principal is exactly what eats it.
    expect(
      shortPrincipal(
        'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stx-staker-blockdaemon-v2',
      ),
    ).toBe('SP4SZE4…DVMDPBG.stx-staker-blockdaemon-v2');
  });
});
