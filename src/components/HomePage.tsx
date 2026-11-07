import { stxCompact, sumUstx, usdCompact } from '../lib/amounts';
import { pricesFrom, ustxInUsd } from '../lib/prices';
import { translator, type Locale } from '../lib/i18n';
import { stxOnlyHistoryHref, stxOnlyRewardsHref } from '../lib/route';
import { stxOnlySummary } from '../lib/stx-only-summary';
import type {
  LockedTotals,
  Signer,
  SignerData,
  StxOnlyCalculations,
} from '../lib/types';
import CycleTimeline from './CycleTimeline';
import Freshness from './Freshness';
import PoolList from './PoolList';
import YourStake from './YourStake';
import { Meter, Page, StatTile } from './ui';

/**
 * The pool list, which is the page most people come for.
 *
 * It used to open with four paragraphs, a rewards box and nine contract-type
 * tiles, so on a phone the first pool was nearly four screens down. Then four
 * tiles and a timeline, each its own card, which left the list looking like
 * one more box among them. Now what the network is doing sits in one quiet
 * panel, and the list has a heading of its own that says how many pools there
 * are and how old the figures are.
 */
export default function HomePage({
  signerData,
  live,
  totals,
  stxOnlyCalculations,
  savedCopy,
  locale,
}: {
  signerData: SignerData;
  /** Pools not on an archived contract type. */
  live: Signer[];
  totals: LockedTotals;
  stxOnlyCalculations: StxOnlyCalculations;
  savedCopy: boolean;
  locale: Locale;
}) {
  const t = translator(locale);

  const contractIds = live.map((signer) => signer.contractId);
  const staked = sumUstx(contractIds, totals.ustx);
  const stakedNext = totals.next
    ? sumUstx(contractIds, totals.next.ustx)
    : null;
  const rewards = stxOnlySummary(stxOnlyCalculations);
  const stakedUsd = ustxInUsd(staked, pricesFrom(stxOnlyCalculations));

  return (
    <Page wide>
      <header className='mb-2'>
        <h1 className='text-3xl font-extrabold tracking-tight md:text-4xl'>
          {t('app.heading')}
        </h1>
        <p className='mt-2 max-w-2xl text-muted md:text-lg'>
          {t('home.intro')}
        </p>
      </header>

      <YourStake signers={signerData.signers} locale={locale} />

      {/* What the network is doing now, as one quiet panel rather than five
          cards: context for the list below, not a rival to it. */}
      <section
        aria-labelledby='cycle-heading'
        className='mt-5 mb-8 rounded-2xl bg-card-raised p-4 sm:p-5'
      >
        <h2
          id='cycle-heading'
          className='text-xs font-bold tracking-wide text-muted uppercase'
        >
          {t('home.cycleHeading', { cycle: totals.cycle })}
        </h2>
        <div className='mt-2 grid grid-cols-3 gap-x-3 sm:gap-x-4'>
          <StatTile
            bare
            label={t('home.stat.staked')}
            value={staked === null ? '—' : (stxCompact(staked, locale) ?? '—')}
          >
            {stakedUsd !== null && (
              <>
                {t('amount.usdAbout', { usd: usdCompact(stakedUsd, locale) })}
                {' · '}
              </>
            )}
            {stakedNext !== null &&
              totals.next &&
              t(
                totals.next.lockedIn
                  ? 'home.stat.nextLocked'
                  : 'home.stat.nextFilling',
                {
                  cycle: totals.next.cycle,
                  amount: stxCompact(stakedNext, locale) ?? '—',
                },
              )}
          </StatTile>

          <StatTile
            bare
            label={t('home.stat.rewards')}
            value={
              rewards
                ? rewards.rateSatsPer1000Stx.toLocaleString(t.bundle.intlLocale)
                : '—'
            }
            unit={rewards ? t('home.stat.rewardsUnit') : undefined}
          >
            {rewards?.apy != null &&
              t('home.stat.apy', { apy: rewards.apy.toFixed(2) })}{' '}
            <a
              href={stxOnlyRewardsHref()}
              className='font-bold whitespace-nowrap text-grape'
            >
              {t('home.stat.howWorkedOut')}
            </a>
          </StatTile>

          <StatTile
            bare
            label={t('home.stat.payout')}
            value={
              !rewards || !rewards.dueAt
                ? '—'
                : rewards.overdue
                  ? t('home.stat.payoutDue')
                  : t.plural(
                      'home.stat.payoutDays',
                      Math.max(
                        1,
                        Math.round(
                          (rewards.dueAt.getTime() - Date.now()) / 86_400_000,
                        ),
                      ),
                    )
            }
          >
            {rewards && (
              <>
                <Meter
                  percent={rewards.progressPercent}
                  label={t('app.stxOnlyEstimate.progressLabel')}
                />
                <span className='mt-1 block'>
                  {rewards.overdue
                    ? t('home.stat.payoutOverdue')
                    : t('home.stat.payoutBlocks', {
                        done: rewards.blocksIntoCycle.toLocaleString(
                          t.bundle.intlLocale,
                        ),
                        total: rewards.cycleBlocks.toLocaleString(
                          t.bundle.intlLocale,
                        ),
                      })}{' '}
                  <a
                    href={stxOnlyHistoryHref()}
                    className='font-bold whitespace-nowrap text-grape'
                  >
                    {t('home.stat.history')}
                  </a>
                </span>
              </>
            )}
          </StatTile>
        </div>

        <CycleTimeline
          calculations={stxOnlyCalculations}
          locale={locale}
          bare
        />
      </section>

      <PoolList
        signers={live}
        totals={totals}
        calculations={stxOnlyCalculations}
        locale={locale}
        aside={
          <Freshness
            generatedAt={signerData.generatedAt}
            savedCopy={savedCopy}
            locale={locale}
            variant='inline'
          />
        }
      />

      <p className='mt-8 text-sm text-muted'>{t('home.footer.fees')}</p>
    </Page>
  );
}
