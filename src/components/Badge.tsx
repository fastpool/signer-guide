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

/** "0%", "2.5%" — basis points are a unit nobody should have to meet. */
export function feeLabel(feeBips: number | null): string {
  if (feeBips === null) return 'Not set in this contract';
  if (feeBips === 0) return 'No fee right now';
  return `${(feeBips / 100).toFixed(feeBips % 100 === 0 ? 0 : 2)}% right now`;
}
