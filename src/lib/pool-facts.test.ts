import { describe, expect, it } from 'vitest';
import signers from '../data/signers.json';
import { feePercent } from '../components/Badge';
import { stxCompact } from './amounts';
import { ageParts, freshness, STALE_AFTER_MS } from './freshness';
import {
  joinMode,
  poolWarnings,
  rewardCurrencies,
  stakesHere,
} from './pool-facts';
import type { Signer, SignerData } from './types';

const ALL = (signers as SignerData).signers;
const byId = (suffix: string): Signer => {
  const found = ALL.find((signer) => signer.contractId.endsWith(suffix));
  if (!found) throw new Error(`no signer ending ${suffix}`);
  return found;
};

describe('pool facts', () => {
  it('says Native Pool is joined through Native Pool, both versions alike', () => {
    // The list called the first one open and the second one invite-only,
    // though both accept exactly the same thing: staking through Native Pool.
    for (const suffix of [
      '.native-pool-signer-manager',
      '.native-pool-signer-manager-v2',
    ]) {
      const signer = byId(suffix);
      expect(joinMode(signer)).toBe('nativePool');
      // And the stake button here cannot do it, so it is not offered.
      expect(stakesHere(signer)).toBe(false);
    }
  });

  it('reads Native Pool V2 as charging a fee it can raise without notice', () => {
    // `get-fee-bps`, not `get-fee-bips`: spelt without the i, it went unread
    // and the pool was shown as having no fee in its contract.
    const v2 = byId('.native-pool-signer-manager-v2');
    expect(v2.feeBips).not.toBeNull();
    expect(v2.maxFeeBips).toBeNull();
    expect(poolWarnings(v2)).toContain('feeUnbounded');
  });

  it('warns about no ceiling only for a fee the contract holds', () => {
    // A fee kept somewhere else may have its own ceiling there.
    for (const signer of ALL.filter((s) => s.feeBips === null)) {
      expect(poolWarnings(signer)).not.toContain('feeUnbounded');
    }
  });

  it('says nothing is wrong with a fee that has a ceiling', () => {
    for (const signer of ALL.filter((s) => s.maxFeeBips !== null)) {
      expect(poolWarnings(signer)).not.toContain('feeUnbounded');
    }
  });

  it('pays in sBTC, and in BTC only where the code does', () => {
    for (const signer of ALL.filter((s) => !s.rewardsIn)) {
      const currencies = rewardCurrencies(signer);
      expect(currencies).toContain('sbtc');
      expect(currencies.includes('btc')).toBe(signer.bitcoinRewards);
    }
  });

  it('says what a pool pays in where that was decided by hand', () => {
    // juice-pool-sbtc-signer swaps its sBTC rewards into STX before paying
    // anybody, whatever its name says.
    const juice = byId('.juice-pool-sbtc-signer');
    expect(rewardCurrencies(juice)).toEqual(['stx']);
  });
});

describe('short figures', () => {
  it('writes a fee as a bare percentage', () => {
    expect(feePercent(0)).toBe('0%');
    expect(feePercent(450)).toBe('4.5%');
    expect(feePercent(495)).toBe('4.95%');
    expect(feePercent(9999)).toBe('99.99%');
    expect(feePercent(null)).toBeNull();
  });

  it('writes an amount in a few characters, and says when there is none', () => {
    expect(stxCompact('89000000000000', 'en')).toBe('89M STX');
    expect(stxCompact('8215865483722', 'en')).toBe('8.2M STX');
    expect(stxCompact('253000000', 'en')).toBe('253 STX');
    expect(stxCompact(null, 'en')).toBeNull();
    expect(stxCompact('8215865483722', 'ko')).toBe('821.6만 STX');
  });
});

describe('freshness', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');

  it('is fresh within a day of the refresh, and stale after', () => {
    expect(freshness('2026-11-03T11:00:00Z', now).state).toBe('fresh');
    // The page says "refreshed daily", so hours old is not worth a warning.
    expect(freshness('2026-11-03T03:00:00Z', now).state).toBe('fresh');
    expect(
      freshness(new Date(now - STALE_AFTER_MS - 1).toISOString(), now).state,
    ).toBe('stale');
    // The page this was written for: data from 26 October on 3 November.
    expect(freshness('2026-10-26T14:26:00Z', now).state).toBe('stale');
  });

  it('does not call a date it cannot read fresh', () => {
    expect(freshness('not a date', now).state).toBe('unknown');
    expect(freshness(null, now).state).toBe('unknown');
  });

  it('rounds the age to what a reader needs', () => {
    expect(ageParts(12 * 60_000)).toEqual({ unit: 'minute', count: 12 });
    expect(ageParts(3 * 3_600_000)).toEqual({ unit: 'hour', count: 3 });
    expect(ageParts(8 * 86_400_000)).toEqual({ unit: 'day', count: 8 });
  });
});
