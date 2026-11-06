import { useState } from 'react';
import Badge from './Badge';
import { Page } from './ui';
import { btcLabel, stxCompact, stxLabel } from '../lib/amounts';
import {
  filledPercent,
  lastCycle,
  lockedSplit,
  openSats,
  useBonds,
} from '../lib/bonds';
import { addressUrl } from '../lib/explorer';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import { shortPrincipal } from '../lib/strings';
import {
  bondStakeFor,
  poolsWithBondStake,
  totalBondUstx,
} from '../lib/bond-stake';
import type {
  BondPeriod,
  BondsData,
  BondStaker,
  LockedTotals,
  Signer,
} from '../lib/types';
import { signerHref } from '../lib/route';
import PoolName from './PoolName';

/**
 * The bitcoin side of pox-5: what the current and next bond period hold.
 *
 * Every other page here is about STX. This one is about the collateral beside
 * it — bitcoin an invited staker locks against a bond for its whole term,
 * either as sBTC on Stacks or on Bitcoin itself.
 *
 * The page exists to keep two numbers apart, because they are the two a
 * reader will otherwise conflate:
 *
 *   the ceiling     what the bond's allowlist permits. Set by the bond admin
 *                   when the bond was made, and binding on nobody: an invited
 *                   staker may lock all of it, some of it or none.
 *   what is locked  pox-5's own total for the bond. Settled.
 *
 * So the headline figure is what is locked, the ceiling sits beside it as
 * context, and the gap is named as what is still open rather than left for
 * the reader to subtract. The bar is drawn against the ceiling for the same
 * reason: it is the only thing the locked figure has to be measured against.
 *
 * Two periods and not six. Bonds overlap — a term of twelve cycles opening
 * every two means six run at once — but the pair worth a page is the period
 * the chain is in and the one somebody could still join.
 */
export default function BondsPage({
  signers,
  totals,
  locale,
}: {
  signers: Signer[];
  /** For the STX behind the bonds: every bond running, not just two. */
  totals?: LockedTotals;
  locale: Locale;
}) {
  const t = translator(locale);
  const bonds = useBonds();

  const split = totals ? bondStx(totals) : null;

  return (
    <Page>
      <h1 className='text-3xl font-extrabold md:text-4xl'>
        {t('app.bonds.title')}
      </h1>
      {bonds.state === 'ready' && (
        <p className='mt-3 max-w-2xl text-muted md:text-lg'>
          {t('app.bonds.intro', {
            length: bonds.value.lengthCycles,
            gap: bonds.value.gapCycles,
          })}
        </p>
      )}

      {/* The split first: it is the one figure here that explains the pool
          list, and it was a sentence at the foot of the last card. */}
      {split && totals && (
        <SplitSummary split={split} cycle={totals.cycle} locale={locale} />
      )}

      {bonds.state === 'loading' && (
        <p className='mt-6 text-muted'>{t('app.bonds.loading')}</p>
      )}
      {bonds.state === 'missing' && (
        <p className='mt-6 rounded-3xl bg-card p-6 text-muted shadow-lift'>
          {t('app.bonds.none')}
        </p>
      )}
      {bonds.state === 'failed' && (
        <p className='mt-6 rounded-3xl bg-card p-6 text-muted shadow-lift'>
          {t('app.bonds.failed')}
        </p>
      )}

      {bonds.state === 'ready' && (
        <>
          <div className='mt-6 space-y-3'>
            {/*
             * The current period is missing only before the very first one
             * opens, which is a state the chain spends a fortnight in and the
             * page should not pretend otherwise by showing the next bond
             * under the current bond's heading.
             */}
            {bonds.value.current && (
              <PeriodCard
                period={bonds.value.current}
                heading={t('app.bonds.current')}
                signers={signers}
                locale={locale}
              />
            )}
            <PeriodCard
              period={bonds.value.next}
              heading={t('app.bonds.next')}
              signers={signers}
              locale={locale}
            />
          </div>
        </>
      )}

      {split && totals && (
        <BondStxCard
          split={split}
          cycle={totals.cycle}
          bonds={bonds.state === 'ready' ? bonds.value : null}
          signers={signers}
          locale={locale}
        />
      )}

      {bonds.state === 'ready' && (
        <p className='mt-8 text-sm text-muted'>
          {t('app.bonds.note', {
            at: formatLastUpdate(bonds.value.generatedAt, locale),
          })}
        </p>
      )}
    </Page>
  );
}

function PeriodCard({
  period,
  heading,
  signers,
  locale,
}: {
  period: BondPeriod;
  heading: string;
  signers: Signer[];
  locale: Locale;
}) {
  const t = translator(locale);
  const filled = filledPercent(period);
  const split = lockedSplit(period);

  /*
   * The filled part of the bar, cut where the sBTC ends.
   *
   * The second width is the remainder rather than its own division, so the
   * two segments always add up to exactly the bar this page drew before the
   * split existed. Flooring both independently leaves a seam of up to a
   * percent — seven pixels at this width, and visible as a gap that means
   * nothing.
   */
  const ceiling = BigInt(period.allowlistedSats);
  const sbtcPercent =
    split && filled !== null && ceiling > 0n
      ? Math.min(filled, Number((split.sbtcSats * 100n) / ceiling))
      : null;

  return (
    <section className='rounded-3xl bg-card p-5 shadow-lift'>
      {/*
       * "Bond 3" and whether it is the one now or the next, then on the right
       * its cycles and the burn height it opened or opens at.
       *
       * Three states for that height, not two. A bond that has not opened may
       * still be closed: pox-5 refuses `register-for-bond` throughout a prepare
       * phase, and a bond opens on a cycle boundary, so registration shuts a
       * prepare phase before the bond does. In that window "opens at X"
       * invites somebody to do a thing the chain will refuse.
       */}
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1'>
        <h2 className='flex items-center gap-2 text-lg font-bold'>
          {t('app.bonds.heading', { index: period.bondIndex })}
          <Badge tone={period.started ? 'good' : 'neutral'} size='sm'>
            {heading}
          </Badge>
        </h2>
        <span className='text-sm text-muted'>
          {t('app.bonds.period', {
            first: period.firstRewardCycle,
            last: lastCycle(period),
          })}
          {period.startBurnHeight !== null && (
            <>
              {' · '}
              {t(
                period.started
                  ? 'app.bonds.running'
                  : period.registrationClosed
                    ? 'app.bonds.closed'
                    : 'app.bonds.opensAt',
                {
                  height: period.startBurnHeight.toLocaleString(
                    t.bundle.intlLocale,
                  ),
                },
              )}
            </>
          )}
        </span>
      </div>

      {!period.setUp ? (
        <p className='mt-2 text-sm text-muted'>{t('app.bonds.notSetUp')}</p>
      ) : (
        <>
          {/*
           * The same three numbers, and for a closed bond two of them are a
           * different claim. "Locked so far" and "still open" say the figure
           * is moving and there is room to take; once nobody can register,
           * the first is final and the second is not room but the part of the
           * allowlist nobody took up.
           */}
          <dl className='mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1'>
            <Figure
              label={t(
                period.registrationClosed
                  ? 'app.bonds.lockedFinal'
                  : 'app.bonds.locked',
              )}
              value={btcLabel(period.registeredSats, locale)}
              strong
            />
            <Figure
              label={t('app.bonds.ceiling')}
              value={btcLabel(period.allowlistedSats, locale)}
            />
            <Figure
              label={t(
                period.registrationClosed
                  ? 'app.bonds.wentUnused'
                  : 'app.bonds.stillOpen',
              )}
              value={btcLabel(openSats(period), locale)}
            />
          </dl>

          {/*
           * Against the ceiling, which is the only figure the locked amount
           * can be compared with. A bond with no readable ceiling gets no
           * bar rather than an empty one — an empty track beside a locked
           * amount reads as "none of it", which is the opposite of unknown.
           */}
          {filled !== null && (
            <span
              className='mt-3 flex h-2 overflow-hidden rounded-full bg-trough'
              aria-hidden='true'
            >
              {/*
               * Two tones when the split is known, one when it is not: grape
               * for sBTC on Stacks, amber for bitcoin on Bitcoin. The bar is
               * hidden from screen readers and the line under it carries the
               * same two numbers in the same order, which is both the
               * accessible version and the only legend it needs.
               */}
              {sbtcPercent === null ? (
                <span
                  className='h-full bg-amber-warm'
                  style={{ width: `${filled}%` }}
                />
              ) : (
                <>
                  <span
                    className='h-full bg-grape'
                    style={{ width: `${sbtcPercent}%` }}
                  />
                  <span
                    className='h-full bg-amber-warm'
                    style={{ width: `${filled - sbtcPercent}%` }}
                  />
                </>
              )}
            </span>
          )}

          {split && (
            <p className='mt-2 text-xs text-muted'>
              {t('app.bonds.split', {
                sbtc: btcLabel(split.sbtcSats, locale),
                l1: btcLabel(split.l1Sats, locale),
              })}
            </p>
          )}

          {!period.allowlistComplete && (
            <p className='mt-3 rounded-2xl bg-trough p-4 text-sm text-muted'>
              {t('app.bonds.incomplete')}
            </p>
          )}

          {period.stakers.length > 0 && (
            <>
              <h3 className='mt-5 flex items-baseline gap-2 text-base font-bold'>
                {t('app.bonds.who')}
                <span className='text-sm font-normal text-muted'>
                  {t.plural('app.bonds.invited', period.stakers.length)}
                </span>
              </h3>
              <InvitedList
                stakers={period.stakers}
                signers={signers}
                locale={locale}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The invited stakers, those who have locked something first.
 *
 * Most invitations to the next bond have nothing locked against them yet,
 * and listing all of them between the stakers who have locked bitcoin made
 * the ones that matter hard to find. They are folded into one line, opened
 * on request — they are still a fact worth having, just not the first one.
 */
function InvitedList({
  stakers,
  signers,
  locale,
}: {
  stakers: BondStaker[];
  signers: Signer[];
  locale: Locale;
}) {
  const t = translator(locale);
  const [showAll, setShowAll] = useState(false);
  const locked = stakers.filter((s) => BigInt(s.registeredSats) > 0n);
  const waiting = stakers.filter((s) => BigInt(s.registeredSats) === 0n);
  const shown = showAll || locked.length === 0 ? stakers : locked;
  return (
    <>
      <ul className='mt-3 space-y-3'>
        {shown.map((staker) => (
          <StakerRow
            key={staker.staker}
            staker={staker}
            signers={signers}
            locale={locale}
          />
        ))}
      </ul>
      {!showAll && locked.length > 0 && waiting.length > 0 && (
        <p className='mt-3 text-sm text-muted'>
          {t.plural('bonds.unlocked', waiting.length)}{' '}
          <button
            type='button'
            onClick={() => setShowAll(true)}
            className='font-semibold text-grape underline underline-offset-2'
          >
            {t('bonds.showUnlocked')}
          </button>
        </p>
      )}
    </>
  );
}

function Figure({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className='flex items-baseline gap-1.5'>
      <dd
        className={`tabular-nums ${
          strong ? 'text-xl font-extrabold text-ink' : 'font-semibold'
        }`}
      >
        {value}
      </dd>
      <dt className='order-last text-sm text-muted'>{label}</dt>
    </div>
  );
}

function StakerRow({
  staker,
  signers,
  locale,
}: {
  staker: BondStaker;
  signers: Signer[];
  locale: Locale;
}) {
  const t = translator(locale);
  const locked = BigInt(staker.registeredSats) > 0n;
  const pool = signers.find((s) => s.contractId === staker.signer);

  return (
    /*
     * Two columns from `sm` up, the amount column pinned to a width of its
     * own so it is the one a reader can run their eye down; stacked below
     * that, the amount under the name.
     *
     * A grid rather than a wrapping flex row. The name column used to be
     * `flex-1`, whose basis of zero let it shrink to nothing rather than let
     * the row wrap — on a phone a long staker id came out one or two
     * characters a line beside amounts that kept their full width. A grid
     * gives each column its width outright and has nothing to negotiate.
     *
     * A staker id can be a contract with a long name — `shortPrincipal` keeps
     * those whole on purpose, since the name is the only part a reader
     * recognises — so it may still break, inside its own column.
     */
    <li className='grid items-baseline gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:gap-x-4'>
      <span className='min-w-0 break-words'>
        <a
          className='font-medium underline underline-offset-2 hover:text-grape'
          href={addressUrl(staker.staker)}
          target='_blank'
          rel='noreferrer'
        >
          {shortPrincipal(staker.staker)}
        </a>
        {/*
         * How the bitcoin is held, through which pool, and the STX locked
         * beside it. Only for a staker who has actually registered: all three
         * come from the membership, and an invited staker has none.
         */}
        {locked && (
          <span className='ml-2 text-sm text-muted'>
            {staker.isL1Lock ? t('app.bonds.onL1') : t('app.bonds.asSbtc')}
            {pool && (
              <>
                {', '}
                {t.rich('app.bonds.throughPool', {
                  pool: <PoolName signer={pool} locale={locale} />,
                })}
              </>
            )}
            {staker.amountUstx !== null && (
              <> · {stxLabel(staker.amountUstx, locale)}</>
            )}
          </span>
        )}
      </span>
      {/*
       * Each half kept whole, so a column too narrow for both breaks between
       * the amount and the ceiling rather than inside either of them.
       */}
      <span className='text-sm sm:text-right'>
        {locked ? (
          <strong className='whitespace-nowrap'>
            {btcLabel(staker.registeredSats, locale)}
          </strong>
        ) : (
          <span className='whitespace-nowrap text-muted'>
            {t('app.bonds.notLockedYet')}
          </span>
        )}{' '}
        <span className='whitespace-nowrap text-muted'>
          {t('app.bonds.ofCeiling', {
            ceiling: btcLabel(staker.maxSats, locale),
          })}
        </span>
      </span>
    </li>
  );
}

/** The STX behind the bonds this cycle, worked out once for the whole page. */
interface BondSplit {
  bonded: bigint;
  total: bigint;
  /** Newest bond first; a bond the print did not name goes last. */
  bonds: { index: number | null; sum: bigint; pools: [string, bigint][] }[];
  unknown: number;
}

function bondStx(totals: LockedTotals): BondSplit | null {
  const stake = bondStakeFor(totals, totals.cycle);
  if (!stake) return null;
  const total = Object.values(totals.ustx).reduce<bigint>(
    (sum, raw) => (typeof raw === 'string' ? sum + BigInt(raw) : sum),
    0n,
  );

  // Bond by bond, then pool by pool inside each.
  const byBond = new Map<
    string,
    { index: number | null; pools: Map<string, bigint> }
  >();
  for (const row of poolsWithBondStake(stake)) {
    for (const part of row.parts) {
      const key = part.bondIndex === null ? '?' : String(part.bondIndex);
      const entry = byBond.get(key) ?? {
        index: part.bondIndex,
        pools: new Map(),
      };
      entry.pools.set(row.contractId, part.ustx);
      byBond.set(key, entry);
    }
  }
  const byAmount = (a: [string, bigint], b: [string, bigint]) =>
    b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0;
  const bonds = [...byBond.values()]
    // Newest first, matching the period cards above it.
    .sort((a, b) =>
      a.index === null ? 1 : b.index === null ? -1 : b.index - a.index,
    )
    .map((bond) => {
      const pools = [...bond.pools.entries()].sort(byAmount);
      return {
        index: bond.index,
        pools,
        sum: pools.reduce((acc, [, ustx]) => acc + ustx, 0n),
      };
    });

  return {
    bonded: totalBondUstx(stake) ?? 0n,
    total,
    bonds,
    unknown: stake.unknown.length,
  };
}

/** A share of a whole, to one decimal, or null without a whole. */
function percentOf(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 1000n) / whole) / 10;
}

/**
 * The three numbers the page is for: what is staked, how much of it backs a
 * bond, and how much is STX-only — with a bar, because "24M of 514M" is a
 * proportion and reads faster as one.
 */
function SplitSummary({
  split,
  cycle,
  locale,
}: {
  split: BondSplit;
  cycle: number;
  locale: Locale;
}) {
  const t = translator(locale);
  const stxOnly = split.total - split.bonded;
  const bondShare = percentOf(split.bonded, split.total);
  const onlyShare = percentOf(stxOnly, split.total);
  const fmt = (share: number | null) =>
    share === null ? null : `${share.toLocaleString(t.bundle.intlLocale)}%`;

  const half = (
    dot: string,
    label: string,
    amount: bigint,
    share: number | null,
  ) => (
    <div className='flex items-baseline gap-2'>
      <span
        aria-hidden='true'
        className={`h-2.5 w-2.5 shrink-0 self-center rounded-full ${dot}`}
      />
      <span className='text-xl font-extrabold whitespace-nowrap tabular-nums'>
        {stxCompact(amount, locale) ?? '—'}
      </span>
      <span className='text-sm text-muted'>
        {label}
        {fmt(share) && <> · {fmt(share)}</>}
      </span>
    </div>
  );

  return (
    <section
      aria-labelledby='bond-split'
      className='mt-6 rounded-3xl bg-card p-5 shadow-lift'
    >
      <h2 id='bond-split' className='text-sm font-semibold text-muted'>
        {t('app.bonds.sum.total', { cycle })}
      </h2>
      <div className='mt-2 flex flex-wrap gap-x-6 gap-y-1'>
        {half(
          'bg-amber-warm',
          t('app.bonds.sum.bond'),
          split.bonded,
          bondShare,
        )}
        {half('bg-grape', t('app.bonds.sum.stxOnly'), stxOnly, onlyShare)}
      </div>
      {bondShare !== null && (
        <span
          aria-hidden='true'
          className='mt-3 flex h-2.5 overflow-hidden rounded-full bg-trough'
        >
          <span
            className='h-full bg-amber-warm'
            // At least a sliver, so a small share is still visible as one.
            style={{
              width: `${Math.max(bondShare, split.bonded > 0n ? 1 : 0)}%`,
            }}
          />
          <span className='h-full flex-1 bg-grape' />
        </span>
      )}
      {/* The whole the two halves add up to, under the bar it is the
          length of. */}
      <p className='mt-1.5 text-right text-sm text-muted'>
        {t('app.bonds.sum.whole', {
          amount: stxCompact(split.total, locale) ?? '—',
        })}
      </p>
      {split.unknown > 0 && (
        <p className='mt-2 text-sm text-amber-warm'>
          {t.plural('app.bonds.stxUnknown', split.unknown)}
        </p>
      )}
    </section>
  );
}

/**
 * Every bond running this cycle, pool by pool.
 *
 * The period cards cover two periods; this covers all of them, up to six,
 * because it is what makes the pool list add up. A pool's total counts the
 * STX registered for bonds through it, and that STX is not paid at the
 * STX-only rate — so this is where the difference is accounted for, bond by
 * bond, and the list itself carries a single figure per pool.
 */
function BondStxCard({
  split,
  cycle,
  bonds,
  signers,
  locale,
}: {
  split: BondSplit;
  cycle: number;
  /** For each bond's cycles, counted from the period on file. */
  bonds: BondsData | null;
  signers: Signer[];
  locale: Locale;
}) {
  const t = translator(locale);
  const ref = bonds?.current ?? bonds?.next ?? null;
  const cyclesOf = (index: number | null) => {
    if (index === null || !ref || !bonds) return null;
    const first =
      ref.firstRewardCycle + (index - ref.bondIndex) * bonds.gapCycles;
    return { first, last: first + bonds.lengthCycles - 1 };
  };

  return (
    <section className='mt-6 rounded-3xl bg-card p-5 shadow-lift md:p-6'>
      <h2 className='text-lg font-bold'>
        {t('app.bonds.stxTitle', { cycle })}
      </h2>
      <p className='mt-1 text-sm text-muted'>{t('app.bonds.stxIntro')}</p>
      {split.bonds.length === 0 ? (
        <p className='mt-4 text-sm text-muted'>{t('app.bonds.stxNone')}</p>
      ) : (
        <div className='mt-4 space-y-5'>
          {split.bonds.map((bond) => {
            const cycles = cyclesOf(bond.index);
            const share = percentOf(bond.sum, split.bonded);
            return (
              <div key={bond.index ?? '?'}>
                <h3 className='flex flex-wrap items-baseline justify-between gap-x-3'>
                  <span className='text-base font-bold'>
                    {bond.index === null
                      ? t('app.bonds.stxBondUnnamed')
                      : t('app.bonds.stxBond', { index: bond.index })}
                    {cycles && (
                      <span className='ml-2 text-sm font-normal text-muted'>
                        {t('app.bonds.stxBondCycles', cycles)}
                      </span>
                    )}
                  </span>
                  <span className='text-base font-bold tabular-nums'>
                    {stxCompact(bond.sum, locale) ?? '—'}
                  </span>
                </h3>
                {share !== null && (
                  <span
                    aria-hidden='true'
                    className='mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-trough'
                  >
                    <span
                      className='h-full bg-amber-warm'
                      style={{ width: `${share}%` }}
                    />
                  </span>
                )}
                <ul className='mt-2 space-y-0.5 text-sm'>
                  {bond.pools.map(([contractId, ustx]) => {
                    const pool = signers.find(
                      (s) => s.contractId === contractId,
                    );
                    return (
                      <li
                        key={contractId}
                        className='flex items-baseline justify-between gap-3'
                      >
                        <a
                          href={signerHref(contractId)}
                          className='min-w-0 truncate hover:text-grape'
                        >
                          {pool ? (
                            <PoolName signer={pool} locale={locale} />
                          ) : (
                            shortPrincipal(contractId)
                          )}
                        </a>
                        <span className='text-muted tabular-nums'>
                          {stxCompact(ustx, locale) ?? '—'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
