import { btcLabel, stxLabel } from '../lib/amounts';
import {
  filledPercent,
  lastCycle,
  openSats,
  useBonds,
} from '../lib/bonds';
import { explorerUrl } from '../lib/explorer';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import { shortPrincipal } from '../lib/strings';
import type { BondPeriod, BondStaker, Signer } from '../lib/types';
import LocaleSwitch from './LocaleSwitch';
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
  locale,
  onLocaleChange,
}: {
  signers: Signer[];
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const bonds = useBonds();

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('app.bonds.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-3xl font-extrabold md:text-4xl'>
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

          <p className='mt-8 text-sm text-muted'>{t('app.bonds.note')}</p>
          <p className='mt-2 text-sm text-muted'>
            {t('app.bonds.generatedAt', {
              at: formatLastUpdate(bonds.value.generatedAt, locale),
            })}
          </p>
        </>
      )}
    </main>
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

      {period.startBurnHeight !== null && (
        <p className='mt-1 text-sm text-muted'>
          {t(period.started ? 'app.bonds.running' : 'app.bonds.opensAt', {
            height: period.startBurnHeight.toLocaleString(
              t.bundle.intlLocale,
            ),
          })}
        </p>
      )}

      {!period.setUp ? (
        <p className='mt-3 text-muted'>{t('app.bonds.notSetUp')}</p>
      ) : (
        <>
          <dl className='mt-4 grid gap-3 sm:grid-cols-3'>
            <Figure
              label={t('app.bonds.locked')}
              value={btcLabel(period.registeredSats, locale)}
              strong
            />
            <Figure
              label={t('app.bonds.stillOpen')}
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
              className='mt-4 block h-2 overflow-hidden rounded-full bg-trough'
              aria-hidden='true'
            >
              <span
                className='block h-full rounded-full bg-amber-warm'
                style={{ width: `${filled}%` }}
              />
            </span>
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
              <ul className='mt-3 space-y-3'>
                {period.stakers.map((staker) => (
                  <StakerRow
                    key={staker.staker}
                    staker={staker}
                    signers={signers}
                    locale={locale}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
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
    <li className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
      <span className='min-w-0'>
        <a
          className='font-medium underline underline-offset-2 hover:text-grape'
          href={explorerUrl(staker.staker)}
          target='_blank'
          rel='noreferrer'
        >
          {shortPrincipal(staker.staker)}
        </a>
        {/*
         * How the bitcoin is held, and through which pool. Only for a staker
         * who has actually registered: both facts come from the membership,
         * and an invited staker has none.
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
          </span>
        )}
        {locked && staker.amountUstx !== null && (
          <span className='ml-2 text-sm text-muted'>
            {stxLabel(staker.amountUstx, locale)}
          </span>
        )}
      </span>
      <span className='shrink-0 text-right text-sm'>
        {locked ? (
          <strong>{btcLabel(staker.registeredSats, locale)}</strong>
        ) : (
          <span className='text-muted'>{t('app.bonds.notLockedYet')}</span>
        )}
        <span className='ml-2 text-muted'>
          {t('app.bonds.ofCeiling', {
            ceiling: btcLabel(staker.maxSats, locale),
          })}
        </span>
      </span>
    </li>
  );
}
