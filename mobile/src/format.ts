import { exactStxLabel, stxLabel } from '@guide/lib/amounts';
import { groupDigits } from '@guide/lib/digits';
import type { Locale } from '@guide/lib/i18n';

/**
 * The formatting this app does that the guide's own helpers do not.
 *
 * Amounts are not here. `@guide/lib/amounts` already says an amount of STX or
 * of sats in whichever language is in force — English groups by millions,
 * Korean by 만 and 억 — and a second implementation would be a second answer
 * to the same question. What is left is the handful of things only a phone
 * needs: an address short enough for one line, and a duration.
 */

export { groupDigits };

/**
 * "82.7 million STX", "8,268만 STX", "not known".
 *
 * A thin wrapper on the guide's own `stxLabel`, which knows that English
 * groups by millions and Korean by 만 and 억. All it adds is taking a bigint
 * and taking null — an amount this app could not read is unknown, not zero,
 * and the guide says so in whichever language is in force.
 */
export function stxShort(
  ustx: bigint | null | undefined,
  locale: Locale,
): string {
  return stxLabel(
    ustx === null || ustx === undefined ? null : String(ustx),
    locale,
  );
}

/**
 * The same amount to the last microSTX.
 *
 * Rounding is right for what a pool holds and wrong for what *you* hold: a
 * balance somebody is about to stake should be the number they can check
 * against their wallet.
 */
export function stxExact(
  ustx: bigint | null | undefined,
  locale: Locale,
): string {
  if (ustx === null || ustx === undefined) return stxLabel(null, locale);
  return exactStxLabel(ustx, locale);
}

export function percent(value: number | null, places = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(places)}%`;
}

/** "SP1N8F…4YDR" — enough to recognise, short enough to sit on one line. */
export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** "SP2C2…7Z9F.signer-manager" — the contract name kept whole. */
export function shortContract(contractId: string): string {
  const [address, name] = contractId.split('.');
  if (!name) return shortAddress(contractId);
  return `${shortAddress(address, 5, 4)}.${name}`;
}

/**
 * "7 days", "3 hours", "7일", "3시간".
 *
 * Hours until they stop helping, then days. Korean needs no plural and English
 * does, which is the whole reason this is a function rather than a message
 * with a number in it.
 */
export function durationLabel(hours: number | null, locale: Locale): string {
  if (hours === null) return locale === 'ko' ? '알 수 없음' : 'not known';
  if (hours < 48) {
    return locale === 'ko'
      ? `${hours}시간`
      : `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.max(1, Math.round(hours / 24));
  return locale === 'ko' ? `${days}일` : `${days} day${days === 1 ? '' : 's'}`;
}

/** "2 weeks", "5 months", "2주", "5개월" — what `lockDuration` returns, said. */
export function lockLabel(
  duration: { unit: 'weeks' | 'months'; count: number },
  locale: Locale,
): string {
  if (locale === 'ko') {
    return duration.unit === 'weeks'
      ? `${duration.count}주`
      : `${duration.count}개월`;
  }
  const unit = duration.unit === 'weeks' ? 'week' : 'month';
  return `${duration.count} ${unit}${duration.count === 1 ? '' : 's'}`;
}

export function utcLabel(iso: string, locale: Locale): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return locale === 'ko' ? '알 수 없음' : 'unknown';
  const day = at.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}
