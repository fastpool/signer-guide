import type { FeeChangeNotice } from '../lib/features';
import { translator, type Locale } from '../lib/i18n';

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
  const t = translator(locale);
  const days =
    notice.unit === 'cycles'
      ? notice.amount * 14
      : Math.round((notice.amount * 10) / 60 / 24);

  if (days < 1) {
    const hours = Math.max(1, Math.round((notice.amount * 10) / 60));
    return t.plural('notice.hour', hours);
  }
  if (days < 10) return t.plural('notice.day', days);
  if (days < 21) return t('notice.twoWeeks');
  if (days < 45) return t.plural('notice.month', 1);
  return t.plural('notice.month', Math.round(days / 30));
}

/** "0%", "2.5%" — basis points are a unit nobody should have to meet. */
export function feeLabel(
  feeBips: number | null,
  locale: Locale = 'en',
): string {
  const t = translator(locale);
  if (feeBips === null) return t('fee.notSet');
  if (feeBips === 0) return t('fee.none');
  const percent = (feeBips / 100).toFixed(feeBips % 100 === 0 ? 0 : 2);
  return t('fee.current', { percent });
}
