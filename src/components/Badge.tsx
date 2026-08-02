import type { FeeChangeNotice } from '../lib/features';
import type { Locale } from '../lib/i18n';

export type Tone = 'good' | 'neutral' | 'warm';

const TONES: Record<Tone, string> = {
  good: 'bg-mint-soft text-mint',
  neutral: 'bg-grape-soft text-grape',
  warm: 'bg-amber-soft text-amber-warm',
};

export default function Badge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`${TONES[tone]} rounded-full px-3 py-1 text-sm font-semibold`}
    >
      {children}
    </span>
  );
}

/**
 * "about a day", "about a month" — how long a fee change has to sit before it
 * can bite.
 *
 * Contracts count in Bitcoin blocks (about ten minutes each) or in reward
 * cycles (about two weeks each). Nobody budgets in either, so this is
 * deliberately rounded and hedged: the point is whether you get meaningful
 * warning, not the exact minute.
 */
export function noticeLabel(
  notice: FeeChangeNotice,
  locale: Locale = 'en',
): string {
  const days =
    notice.unit === 'cycles'
      ? notice.amount * 14
      : Math.round((notice.amount * 10) / 60 / 24);

  if (days < 1) {
    const hours = Math.max(1, Math.round((notice.amount * 10) / 60));
    if (locale === 'ko') {
      return hours === 1 ? '약 1시간' : `약 ${hours}시간`;
    }
    return hours === 1 ? 'about an hour' : `about ${hours} hours`;
  }
  if (locale === 'ko') {
    if (days === 1) return '약 1일';
    if (days < 10) return `약 ${days}일`;
    if (days < 21) return '약 2주';
    if (days < 45) return '약 1개월';
    return `약 ${Math.round(days / 30)}개월`;
  }
  if (days === 1) return 'about a day';
  if (days < 10) return `about ${days} days`;
  if (days < 21) return 'about two weeks';
  if (days < 45) return 'about a month';
  return `about ${Math.round(days / 30)} months`;
}

/** "0%", "2.5%" — basis points are a unit nobody should have to meet. */
export function feeLabel(feeBips: number | null, locale: Locale = 'en'): string {
  if (feeBips === null) {
    return locale === 'ko'
      ? '이 컨트랙트에는 수수료가 설정되어 있지 않습니다'
      : 'Not set in this contract';
  }
  if (feeBips === 0) return locale === 'ko' ? '현재 수수료 없음' : 'No fee right now';
  const value = (feeBips / 100).toFixed(feeBips % 100 === 0 ? 0 : 2);
  return locale === 'ko' ? `현재 ${value}%` : `${value}% right now`;
}
