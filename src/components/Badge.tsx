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
 * "about a day" — how long a fee change has to sit before it can bite.
 *
 * Contracts count in Bitcoin blocks, which arrive about every ten minutes.
 * Nobody budgets in blocks, so this is deliberately rounded and hedged rather
 * than precise: the point is whether you get meaningful warning, not the exact
 * minute.
 */
export function noticeLabel(blocks: number): string {
  const hours = Math.round((blocks * 10) / 60);
  if (hours < 2) return 'about an hour';
  if (hours < 36) return hours < 24 ? `about ${hours} hours` : 'about a day';
  return `about ${Math.round(hours / 24)} days`;
}

/** "0%", "2.5%" — basis points are a unit nobody should have to meet. */
export function feeLabel(feeBips: number | null): string {
  if (feeBips === null) return 'Not set in this contract';
  if (feeBips === 0) return 'No fee right now';
  return `${(feeBips / 100).toFixed(feeBips % 100 === 0 ? 0 : 2)}% right now`;
}
