import { describe, expect, it } from 'vitest';
import { stxLabel, sumUstx, toStx } from './amounts';

describe('stxLabel', () => {
  it('rounds millions, because nobody reads eight digits', () => {
    expect(stxLabel('8215865483722')).toBe('8.2 million STX');
    expect(stxLabel('1171575000000')).toBe('1.2 million STX');
  });

  it('uses Korean large-number units', () => {
    expect(stxLabel('8215865483722', 'ko')).toBe('821.6만 STX');
    expect(stxLabel('100000000000000', 'ko')).toBe('1억 STX');
  });

  it('drops a pointless decimal', () => {
    expect(stxLabel('2000000000000')).toBe('2 million STX');
  });

  it('stops using decimals once the number is big enough not to need them', () => {
    expect(stxLabel('12400000000000')).toBe('12 million STX');
  });

  it('groups smaller amounts rather than rounding them away', () => {
    expect(stxLabel('12340000000')).toBe('12,340 STX');
    expect(stxLabel('253000000')).toBe('253 STX');
  });

  it('says nothing staked rather than showing a bare zero', () => {
    expect(stxLabel('0')).toBe('nothing staked yet');
  });

  it('does not present a pool it could not read as empty', () => {
    // The difference between "we know it is nothing" and "we do not know"
    // matters when it is somebody's money.
    expect(stxLabel(null)).toBe('amount not known');
    expect(stxLabel(undefined)).toBe('amount not known');
  });
});

describe('toStx', () => {
  it('converts from microSTX without losing the integer part', () => {
    expect(toStx('8215865483722')).toBe(8_215_865);
  });
});

describe('sumUstx', () => {
  it('adds up what it could read', () => {
    expect(sumUstx(['a', 'b'], { a: '100', b: '250' })).toBe(350n);
  });

  it('skips a pool it could not read instead of counting it as zero', () => {
    expect(sumUstx(['a', 'b'], { a: '100', b: null })).toBe(100n);
  });

  it('is unknown when nothing at all could be read', () => {
    expect(sumUstx(['a'], { a: null })).toBeNull();
    expect(sumUstx(['a'], undefined)).toBeNull();
  });
});
