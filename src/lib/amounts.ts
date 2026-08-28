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
import { groupDigits } from './digits';
import { translator, type Locale } from './i18n';

const MICRO_STX = 1_000_000n;
const SATS_PER_SBTC = 100_000_000n;

/** STX, rounded down, as a plain number — safe up to 9 quadrillion STX. */
export function toStx(ustx: string | bigint): number {
  return Number(BigInt(ustx) / MICRO_STX);
}

/**
 * "1,234.5 STX" — grouped, but not rounded.
 *
 * Rounding is right for what a pool holds and wrong for what *you* hold: the
 * balance a reader is about to stake should be the number they can check
 * against their wallet, to the last microSTX.
 */
export function exactStxLabel(
  ustx: string | bigint,
  locale: Locale = 'en',
): string {
  const t = translator(locale);
  const total = BigInt(ustx);
  const whole = groupDigits(total / MICRO_STX);
  const frac = (total % MICRO_STX)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return t('amount.plain', { value: frac ? `${whole}.${frac}` : whole });
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

  return t('amount.plain', { value: groupDigits(stx) });
}

/**
 * "19,011 sats", "1.234 sBTC", "nothing", "not known".
 *
 * Rewards are counted in sats and mostly *are* sats — a pool's undistributed
 * remainder is often two figures — so sats is the unit until a whole sBTC is
 * in play, at which point eight leading zeroes stop helping anybody.
 *
 * A reading we could not take is not zero, for the same reason `stxLabel`
 * says so about STX: an amount reported as nothing is a claim about somebody's
 * money, and "we did not manage to ask" is a different claim.
 */
export function satsLabel(
  sats: string | bigint | null | undefined,
  locale: Locale = 'en',
): string {
  const t = translator(locale);
  if (sats === null || sats === undefined) return t('amount.unknown');

  const total = BigInt(sats);
  if (total === 0n) return t('amount.nothing');
  if (total < SATS_PER_SBTC) {
    return t('amount.sats', { value: groupDigits(total) });
  }

  const whole = groupDigits(total / SATS_PER_SBTC);
  const frac = (total % SATS_PER_SBTC)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return t('amount.sbtc', { value: frac ? `${whole}.${frac}` : whole });
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
