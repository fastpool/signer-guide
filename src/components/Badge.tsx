import type { FeeChangeNotice } from '../lib/features';
import { translator, type Locale } from '../lib/i18n';

/**
 * What a badge's colour means, one meaning per colour.
 *
 *   good     good for the staker: anyone can join, a fee ceiling, notice
 *   warm     caution: an invite list, code nobody has reviewed
 *   bad      a warning: a fee that keeps the reward, no ceiling at all
 *   fact     plain fact, neither good nor bad: a status, a contract type
 *   neutral  STX, and things that are about STX — grape is Stacks
 *   btc      bitcoin and sBTC — amber is bitcoin everywhere on the page,
 *            drawn as an outline so it is never mistaken for `warm`, which
 *            shares the hue but is a caution, not a currency
 *
 * Before these were written down, the same purple marked a fee, a reward
 * currency and a cycle's status, and green marked both "anyone can join" and
 * "Rewards in Bitcoin", which are not the same kind of thing at all.
 */
export type Tone = 'good' | 'neutral' | 'warm' | 'bad' | 'fact' | 'btc';

const TONES: Record<Tone, string> = {
  good: 'bg-mint-soft text-mint',
  neutral: 'bg-grape-soft text-grape',
  warm: 'bg-amber-soft text-amber-warm',
  bad: 'bg-rose-soft text-rose',
  fact: 'bg-card-raised text-muted',
  btc: 'text-amber-warm ring-1 ring-amber-warm/45 ring-inset',
};

export default function Badge({
  tone,
  size = 'md',
  title,
  children,
}: {
  tone: Tone;
  /** `sm` is the tag that sits in a table cell or a compact row. */
  size?: 'sm' | 'md';
  title?: string;
  children: React.ReactNode;
}) {
  const shape =
    size === 'sm'
      ? 'rounded-md px-1.5 py-0.5 text-xs'
      : 'rounded-full px-3 py-1 text-sm';
  return (
    <span
      title={title}
      className={`${TONES[tone]} ${shape} inline-block font-semibold whitespace-nowrap`}
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

/**
 * "0%", "4.5%", "4.95%" — the bare number, for a table cell or a facts grid
 * whose heading already says it is the fee now. Null when the contract does
 * not hold one.
 */
export function feePercent(feeBips: number | null): string | null {
  if (feeBips === null) return null;
  const percent = feeBips / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}
