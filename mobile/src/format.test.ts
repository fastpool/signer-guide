import { satsLabel } from '@guide/lib/amounts';
import {
  durationLabel,
  groupDigits,
  lockLabel,
  percent,
  shortAddress,
  shortContract,
  stxExact,
  stxShort,
} from './format';

/*
 * `BigInt.prototype.toLocaleString` groups under Node and does not under
 * Hermes: on the phone, six million sats printed as `6135000` while every test
 * asserting `6,135,000` passed. So the grouping is the guide's own, shared
 * with the web app, and tested on bigints rather than on numbers — the type
 * that broke.
 */
describe('groupDigits', () => {
  it('groups a bigint, which is the case Hermes gets wrong', () => {
    expect(groupDigits(6_135_000n)).toBe('6,135,000');
    expect(groupDigits(15_000_000n)).toBe('15,000,000');
  });

  it('leaves short numbers alone', () => {
    expect(groupDigits(0n)).toBe('0');
    expect(groupDigits(409n)).toBe('409');
    expect(groupDigits(1000n)).toBe('1,000');
  });

  it('groups a plain number the same way', () => {
    expect(groupDigits(964_351)).toBe('964,351');
  });

  it('keeps a sign in front of the digits', () => {
    expect(groupDigits(-1_234_567n)).toBe('-1,234,567');
  });
});

describe('stxShort', () => {
  it('says a large amount the way the reader’s language says it', () => {
    // English groups by millions; Korean by 만 and 억. Both come from the
    // guide's own catalogue, which is the point of not reimplementing it here.
    expect(stxShort(82_681_580_000_000n, 'en')).toBe('83 million STX');
    expect(stxShort(82_681_580_000_000n, 'ko')).toContain('만 STX');
  });

  it('says nothing rather than zero when the amount is unknown', () => {
    // The guide's own wording, not this app's: `amount.unknown`.
    expect(stxShort(null, 'en')).toBe('amount not known');
    expect(stxShort(undefined, 'en')).toBe('amount not known');
    expect(stxShort(null, 'ko')).not.toBe(stxShort(null, 'en'));
  });
});

describe('stxExact', () => {
  it('keeps every microSTX, because this is checked against a wallet', () => {
    expect(stxExact(8_215_865_483_722n, 'en')).toBe('8,215,865.483722 STX');
    expect(stxExact(1_000_000n, 'en')).toBe('1 STX');
    expect(stxExact(1n, 'en')).toBe('0.000001 STX');
  });

  it('is unknown, not zero, for an amount that could not be read', () => {
    expect(stxExact(null, 'en')).toBe('amount not known');
  });
});

describe('satsLabel, from the guide', () => {
  it('counts in sats until a whole sBTC is in play', () => {
    expect(satsLabel(408n, 'en')).toBe('408 sats');
    // The one from the phone: a real position's weekly reward.
    expect(satsLabel(6_135_000n, 'en')).toBe('6,135,000 sats');
    expect(satsLabel(123_400_000n, 'en')).toBe('1.234 sBTC');
  });

  it('distinguishes nothing from not having asked', () => {
    expect(satsLabel(0n, 'en')).toBe('nothing');
    expect(satsLabel(null, 'en')).toBe('amount not known');
  });
});

describe('shortening', () => {
  it('keeps enough of an address to recognise it', () => {
    expect(shortAddress('SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR')).toBe(
      'SP1N8F…4YDR',
    );
  });

  it('shortens the address of a contract but never its name', () => {
    expect(
      shortContract('SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager'),
    ).toBe('SP1N8…4YDR.signer-manager');
  });

  it('leaves something already short alone', () => {
    expect(shortAddress('SP1N8F')).toBe('SP1N8F');
  });
});

describe('durations', () => {
  it('has a dash for a percentage nobody could work out', () => {
    expect(percent(null)).toBe('—');
    expect(percent(6.8912)).toBe('6.89%');
  });

  it('switches from hours to days when hours stop helping', () => {
    expect(durationLabel(1, 'en')).toBe('1 hour');
    expect(durationLabel(47, 'en')).toBe('47 hours');
    expect(durationLabel(158, 'en')).toBe('7 days');
  });

  it('needs no plural in Korean, which is why this is code and not a message', () => {
    expect(durationLabel(1, 'ko')).toBe('1시간');
    expect(durationLabel(158, 'ko')).toBe('7일');
  });

  it('says a lock period in both languages', () => {
    expect(lockLabel({ unit: 'weeks', count: 2 }, 'en')).toBe('2 weeks');
    expect(lockLabel({ unit: 'weeks', count: 1 }, 'en')).toBe('1 week');
    expect(lockLabel({ unit: 'months', count: 6 }, 'en')).toBe('6 months');
    expect(lockLabel({ unit: 'weeks', count: 2 }, 'ko')).toBe('2주');
    expect(lockLabel({ unit: 'months', count: 6 }, 'ko')).toBe('6개월');
  });
});
