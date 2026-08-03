/**
 * STX amounts in words a reader can hold in their head.
 *
 * The chain counts in microSTX, which is a millionth of a STX and of no use
 * to anybody choosing a pool. Big numbers round: "8.2 million STX" says what
 * "8,215,865.483722 STX" says, and says it faster.
 *
 * How big is "big" is a question about the language, not about the number:
 * English groups by millions, Korean by 만 and 억. That lives in each language
 * file as `amountScale`, so nothing here knows which language it is speaking.
 */
import { translator, type Locale } from './i18n';

const MICRO_STX = 1_000_000n;

/** STX, rounded down, as a plain number — safe up to 9 quadrillion STX. */
export function toStx(ustx: string | bigint): number {
  return Number(BigInt(ustx) / MICRO_STX);
}

/**
 * "8.2 million STX", "12,340 STX", "nothing staked yet".
 *
 * A pool we could not read is not zero — it is unknown, and says so.
 */
export function stxLabel(
  ustx: string | null | undefined,
  locale: Locale = 'en',
): string {
  const t = translator(locale);
  if (ustx === null || ustx === undefined) return t('amount.unknown');

  const stx = toStx(ustx);
  if (stx === 0) return t('amount.none');

  for (const step of t.bundle.amountScale) {
    if (stx < step.min) continue;
    const scaled = stx / step.divisor;
    // One decimal while the number is small enough to need it, none after:
    // nobody reads "12.4 million" to three figures, and "1 million" on its
    // own hides too much.
    const rounded =
      scaled < step.decimalBelow
        ? scaled.toFixed(1).replace(/\.0$/, '')
        : String(Math.round(scaled));
    return step.unit.replace('{value}', rounded);
  }

  return t('amount.plain', { value: stx.toLocaleString(t.bundle.intlLocale) });
}

/** Sum of the amounts we could read; pools we could not are left out. */
export function sumUstx(
  contractIds: string[],
  ustx: Record<string, string | null> | undefined,
): bigint | null {
  if (!ustx) return null;
  let total = 0n;
  let known = false;
  for (const id of contractIds) {
    const amount = ustx[id];
    if (amount === null || amount === undefined) continue;
    total += BigInt(amount);
    known = true;
  }
  return known ? total : null;
}
