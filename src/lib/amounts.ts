/**
 * STX amounts in words a reader can hold in their head.
 *
 * The chain counts in microSTX, which is a millionth of a STX and of no use
 * to anybody choosing a pool. Big numbers round: "8.2 million STX" says what
 * "8,215,865.483722 STX" says, and says it faster.
 */

const MICRO_STX = 1_000_000n;

type AmountLocale = 'en' | 'ko';

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
  locale: AmountLocale = 'en',
): string {
  if (ustx === null || ustx === undefined) return 'amount not known';

  const stx = toStx(ustx);
  if (stx === 0) return 'nothing staked yet';
  if (locale === 'ko' && stx >= 1_000_000) {
    if (stx >= 100_000_000) {
      const eok = stx / 100_000_000;
      const rounded = eok < 10 ? eok.toFixed(1).replace(/\.0$/, '') : Math.round(eok);
      return `${rounded}억 STX`;
    }

    const man = stx / 10_000;
    const rounded = man < 1000 ? man.toFixed(1).replace(/\.0$/, '') : Math.round(man);
    return `${rounded}만 STX`;
  }

  if (stx >= 1_000_000) {
    const millions = stx / 1_000_000;
    // One decimal below 10 million, none above: nobody needs "12.4 million"
    // to three figures, and "1 million" hides too much.
    const rounded =
      millions < 10
        ? millions.toFixed(1).replace(/\.0$/, '')
        : Math.round(millions);
    return `${rounded} million STX`;
  }
  return `${stx.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-GB')} STX`;
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
