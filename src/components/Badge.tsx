import type { FeeChangeNotice } from '../lib/features';

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
export function noticeLabel(notice: FeeChangeNotice): string {
  const days =
    notice.unit === 'cycles'
      ? notice.amount * 14
      : Math.round((notice.amount * 10) / 60 / 24);

  if (days < 1) {
    const hours = Math.max(1, Math.round((notice.amount * 10) / 60));
    return hours === 1 ? 'about an hour' : `about ${hours} hours`;
  }
  if (days === 1) return 'about a day';
  if (days < 10) return `about ${days} days`;
  if (days < 21) return 'about two weeks';
  if (days < 45) return 'about a month';
  return `about ${Math.round(days / 30)} months`;
}

/** "0%", "2.5%" — basis points are a unit nobody should have to meet. */
export function feeLabel(feeBips: number | null): string {
  if (feeBips === null) return 'Not set in this contract';
  if (feeBips === 0) return 'No fee right now';
  return `${(feeBips / 100).toFixed(feeBips % 100 === 0 ? 0 : 2)}% right now`;
}
