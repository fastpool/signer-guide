import { describe, expect, it } from 'vitest';
import {
  formatUstxAsStx,
  parseStxToUstx,
  spendableFromBalance,
  unlockedFromBalances,
} from './StakeModal';

describe('StakeModal staking helpers', () => {
  describe('parseStxToUstx', () => {
    it('parses integer and decimal STX amounts', () => {
      expect(parseStxToUstx('1')).toBe(1_000_000n);
      expect(parseStxToUstx('1.5')).toBe(1_500_000n);
      expect(parseStxToUstx('0.000001')).toBe(1n);
      expect(parseStxToUstx(' 2.25 ')).toBe(2_250_000n);
    });

    it('rejects invalid staking input', () => {
      expect(parseStxToUstx('')).toBeNull();
      expect(parseStxToUstx('abc')).toBeNull();
      expect(parseStxToUstx('1.1234567')).toBeNull();
      expect(parseStxToUstx('-1')).toBeNull();
    });
  });

  describe('formatUstxAsStx', () => {
    it('formats whole and fractional STX without trailing zeros', () => {
      expect(formatUstxAsStx(2_000_000n)).toBe('2');
      expect(formatUstxAsStx(2_250_000n)).toBe('2.25');
      expect(formatUstxAsStx(1n)).toBe('0.000001');
    });
  });

  describe('spendableFromBalance', () => {
    it('keeps a 1 STX safety buffer', () => {
      expect(spendableFromBalance(5_000_000n)).toBe(4_000_000n);
      expect(spendableFromBalance(1_000_000n)).toBe(0n);
      expect(spendableFromBalance(500_000n)).toBe(0n);
    });

    it('returns null for unknown balance', () => {
      expect(spendableFromBalance(null)).toBeNull();
    });
  });

  describe('unlockedFromBalances', () => {
    /*
     * `balance` counts locked STX, and locked STX cannot be locked again. A
     * staker whose position is ending would otherwise be offered the whole of
     * it and told by the chain they do not have it.
     */
    it('leaves out what is locked already', () => {
      expect(unlockedFromBalances(10_000_000n, 9_000_000n)).toBe(1_000_000n);
      expect(unlockedFromBalances(10_000_000n, 0n)).toBe(10_000_000n);
    });

    it('never goes below nothing', () => {
      expect(unlockedFromBalances(9_000_000n, 9_000_000n)).toBe(0n);
      expect(unlockedFromBalances(9_000_000n, 10_000_000n)).toBe(0n);
    });
  });
});
