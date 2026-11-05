import { useState } from 'react';
import { Page } from './ui';
import { btcLabel, stxCompact, stxLabel } from '../lib/amounts';
import {
  filledPercent,
  lastCycle,
  lockedSplit,
  openSats,
  useBonds,
} from '../lib/bonds';
import { explorerUrl } from '../lib/explorer';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import { shortPrincipal } from '../lib/strings';
import {
  bondStakeFor,
  poolsWithBondStake,
  totalBondUstx,
} from '../lib/bond-stake';
import type {
  BondPeriod,
  BondStaker,
  LockedTotals,
  Signer,
} from '../lib/types';
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

  return (
    <Page>
      <h1 className='text-3xl font-extrabold md:text-4xl'>
        {t('app.bonds.title')}
      </h1>
      {bonds.state === 'ready' && (
        <p className='mt-3 text-lg text-muted'>
          {t('app.bonds.intro', {
            length: bonds.value.lengthCycles,
            gap: bonds.value.gapCycles,
          })}
        </p>
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

          {totals && (
            <BondStxCard totals={totals} signers={signers} locale={locale} />
          )}

          <p className='mt-8 text-sm text-muted'>{t('app.bonds.note')}</p>
          <p className='mt-2 text-sm text-muted'>
            {t('app.bonds.generatedAt', {
              at: formatLastUpdate(bonds.value.generatedAt, locale),
            })}
          </p>
        </>
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
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <h2 className='text-lg font-bold'>{heading}</h2>
        <span className='text-sm text-muted'>
          {t('app.bonds.period', {
            index: period.bondIndex,
            first: period.firstRewardCycle,
            last: lastCycle(period),
          })}
        </span>
      </div>

      {/*
       * Three states, not two. A bond that has not opened may still be closed:
       * pox-5 refuses `register-for-bond` throughout a prepare phase, and a
       * bond opens on a cycle boundary, so registration shuts a prepare phase
       * before the bond does. In that window "opens at height X" invites
       * somebody to do a thing the chain will refuse.
       */}
      {period.startBurnHeight !== null && (
        <p className='mt-1 text-sm text-muted'>
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
        </p>
      )}

      {!period.setUp ? (
        <p className='mt-3 text-muted'>{t('app.bonds.notSetUp')}</p>
      ) : (
        <>
          {/*
           * The same three numbers, and for a closed bond two of them are a
           * different claim. "Locked so far" and "still open" say the figure
           * is moving and there is room to take; once nobody can register,
           * the first is final and the second is not room but the part of the
           * allowlist nobody took up.
           */}
          <dl className='mt-4 grid gap-3 sm:grid-cols-3'>
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
              label={t(
                period.registrationClosed
                  ? 'app.bonds.wentUnused'
                  : 'app.bonds.stillOpen',
              )}
              value={btcLabel(openSats(period), locale)}
            />
            <Figure
              label={t('app.bonds.ceiling')}
              value={btcLabel(period.allowlistedSats, locale)}
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
              className='mt-4 flex h-2 overflow-hidden rounded-full bg-trough'
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

          <p className='mt-3 text-sm text-muted'>
            {t.plural('app.bonds.invited', period.stakers.length)}
          </p>

          {!period.allowlistComplete && (
            <p className='mt-3 rounded-2xl bg-trough p-4 text-sm text-muted'>
              {t('app.bonds.incomplete')}
            </p>
          )}

          {period.stakers.length > 0 && (
            <>
              <h3 className='mt-5 text-base font-bold'>{t('app.bonds.who')}</h3>
              <p className='mt-1 text-sm text-muted'>
                {t('app.bonds.whoIntro')}
              </p>
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
    <div>
      <dt className='text-sm text-muted'>{label}</dt>
      <dd
        className={
          strong ? 'text-xl font-extrabold text-ink' : 'text-lg font-semibold'
        }
      >
        {value}
      </dd>
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
          href={explorerUrl(staker.staker)}
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

/**
 * The STX side of the bonds: every bond running this cycle, pool by pool.
 *
 * The cards above are about bitcoin and cover two periods; this covers all of
 * them, up to six, because it is what makes the pool list add up. A pool's
 * total counts the STX registered for bonds through it, and that STX is not
 * paid at the STX-only rate — so this is where the difference is accounted
 * for, bond by bond, and the list itself carries a single figure per pool.
 */
function BondStxCard({
  totals,
  signers,
  locale,
}: {
  totals: LockedTotals;
  signers: Signer[];
  locale: Locale;
}) {
  const t = translator(locale);
  const stake = bondStakeFor(totals, totals.cycle);
  if (!stake) return null;
  const bonded = totalBondUstx(stake) ?? 0n;
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
  const bonds = [...byBond.values()].sort((a, b) =>
    a.index === null ? 1 : b.index === null ? -1 : a.index - b.index,
  );

  return (
    <section className='mt-6 rounded-3xl bg-card p-5 shadow-lift md:p-6'>
      <h2 className='text-xl font-bold'>
        {t('app.bonds.stxTitle', { cycle: totals.cycle })}
      </h2>
      <p className='mt-2 text-sm text-muted'>{t('app.bonds.stxIntro')}</p>
      {bonds.length === 0 ? (
        <p className='mt-4 text-sm text-muted'>{t('app.bonds.stxNone')}</p>
      ) : (
        <div className='mt-4 space-y-4'>
          {bonds.map((bond) => {
            const pools = [...bond.pools.entries()].sort((a, b) =>
              b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0,
            );
            const sum = pools.reduce((acc, [, ustx]) => acc + ustx, 0n);
            return (
              <div key={bond.index ?? '?'}>
                <h3 className='flex items-baseline justify-between gap-3 text-base font-bold'>
                  <span>
                    {bond.index === null
                      ? t('app.bonds.stxBondUnnamed')
                      : t('app.bonds.stxBond', { index: bond.index })}
                  </span>
                  <span className='tabular-nums'>
                    {stxCompact(sum, locale) ?? '—'}
                  </span>
                </h3>
                <ul className='mt-1 space-y-0.5 text-sm'>
                  {pools.map(([contractId, ustx]) => {
                    const pool = signers.find(
                      (s) => s.contractId === contractId,
                    );
                    return (
                      <li
                        key={contractId}
                        className='flex items-baseline justify-between gap-3'
                      >
                        <span className='min-w-0 truncate'>
                          {pool ? (
                            <PoolName signer={pool} locale={locale} />
                          ) : (
                            shortPrincipal(contractId)
                          )}
                        </span>
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
      <p className='mt-4 text-sm text-muted'>
        {t('app.bonds.stxTotal', {
          bond: stxCompact(bonded, locale) ?? '—',
          total: stxCompact(total, locale) ?? '—',
          stxOnly: stxCompact(total - bonded, locale) ?? '—',
        })}
      </p>
      {stake.unknown.length > 0 && (
        <p className='mt-2 text-sm text-amber-warm'>
          {t.plural('app.bonds.stxUnknown', stake.unknown.length)}
        </p>
      )}
    </section>
  );
}
