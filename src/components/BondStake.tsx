import { stxCompact } from '../lib/amounts';
import type { BondPart } from '../lib/bond-stake';
import { sumParts } from '../lib/bond-stake';
import { translator, type Locale } from '../lib/i18n';

/**
 * How a pool's bond stake is shown.
 *
 * Up to six bonds run at once, so naming each one beside an amount would make
 * a label that grows with the chain: "21.5M STX · 465k backing bond 1, 1.3k
 * backing bond 2, 13.8M backing bond 3". Lists and tiles say one thing — how
 * much of the amount is bond stake, as a single figure with a mark — and keep
 * the bond-by-bond figures for the hover title and the pool's own page, where
 * there is room for one chip per bond.
 */

/** The mark for bond stake, the same everywhere it appears. */
export const BOND_MARK = '◆';

/** "Bond 1: 465K STX · Bond 2: 1.3K STX" — for a title, never for a cell. */
export function bondBreakdown(
  parts: readonly BondPart[],
  locale: Locale,
): string {
  const t = translator(locale);
  return parts
    .map((part) =>
      t(part.bondIndex === null ? 'bondStake.partUnnamed' : 'bondStake.part', {
        index: part.bondIndex ?? '',
        amount: stxCompact(part.ustx, locale) ?? '',
      }),
    )
    .join(' · ');
}

/** "465K" — an amount with the unit left to the words around it. */
function bare(ustx: bigint, locale: Locale): string {
  return (stxCompact(ustx, locale) ?? '').replace(/ STX$/, '');
}

/**
 * One short line under an amount: "◆ 294K in bonds", or "◆ all in bonds".
 * The same length whether one bond is behind it or six.
 */
export function BondLine({
  parts,
  total,
  locale,
  className = 'block text-xs text-muted',
}: {
  parts: readonly BondPart[];
  /** The whole amount the line sits under, to say "all" when it is. */
  total: bigint | null;
  locale: Locale;
  className?: string;
}) {
  const t = translator(locale);
  const bond = sumParts(parts);
  if (bond <= 0n) return null;
  const all = total !== null && bond >= total;
  return (
    <span className={className} title={bondBreakdown(parts, locale)}>
      <span aria-hidden='true' className='text-amber-warm'>
        {BOND_MARK}{' '}
      </span>
      {all
        ? t('bondStake.all')
        : t('bondStake.some', { amount: bare(bond, locale) })}
    </span>
  );
}

/** The mark alone, for a row with no room for the line. */
export function BondMark({
  parts,
  locale,
}: {
  parts: readonly BondPart[];
  locale: Locale;
}) {
  const t = translator(locale);
  if (sumParts(parts) <= 0n) return null;
  const label = t('bondStake.markLabel', {
    breakdown: bondBreakdown(parts, locale),
  });
  return (
    <span className='ml-1 text-xs text-amber-warm' title={label}>
      <span aria-hidden='true'>{BOND_MARK}</span>
      <span className='sr-only'>{label}</span>
    </span>
  );
}

/**
 * One chip per bond, for the pool's own page: "Bond 1 · 465K". Wraps, so six
 * chips take two short lines on a phone rather than one long one.
 */
export function BondChips({
  parts,
  locale,
}: {
  parts: readonly BondPart[];
  locale: Locale;
}) {
  const t = translator(locale);
  if (parts.length === 0) return null;
  return (
    <span className='mt-1 flex flex-wrap gap-1'>
      {parts.map((part) => (
        <span
          key={part.bondIndex ?? '?'}
          className='rounded-full bg-trough px-2 py-0.5 text-xs whitespace-nowrap tabular-nums'
        >
          <span aria-hidden='true' className='text-amber-warm'>
            {BOND_MARK}{' '}
          </span>
          {part.bondIndex === null
            ? t('bondStake.chipUnnamed', { amount: bare(part.ustx, locale) })
            : t('bondStake.chip', {
                index: part.bondIndex,
                amount: bare(part.ustx, locale),
              })}
        </span>
      ))}
    </span>
  );
}
