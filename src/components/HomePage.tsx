import { useMemo } from 'react';
import { inUse } from '../lib/activity';
import { stxCompact, sumUstx } from '../lib/amounts';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import {
  contractsHref,
  stxOnlyHistoryHref,
  stxOnlyRewardsHref,
} from '../lib/route';
import { stxOnlySummary } from '../lib/stx-only-summary';
import type {
  LockedTotals,
  Signer,
  SignerData,
  StxOnlyCalculations,
} from '../lib/types';
import type { Template } from '../lib/templates';
import Freshness from './Freshness';
import PoolList from './PoolList';
import { Meter, Page, StatTile } from './ui';

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';

/**
 * The pool list, which is the page most people come for.
 *
 * It used to open with four paragraphs, a rewards box and nine contract-type
 * tiles, so on a phone the first pool was nearly four screens down. Now four
 * tiles say what the paragraphs said — what is staked, how many pools on how
 * many kinds of contract, what STX-only staking pays and when — and the list
 * follows straight after. The contract types have a page of their own, and
 * the tile that counts them links there.
 */
export default function HomePage({
  signerData,
  live,
  liveTemplates,
  totals,
  stxOnlyCalculations,
  savedCopy,
  locale,
}: {
  signerData: SignerData;
  /** Pools not on an archived contract type. */
  live: Signer[];
  liveTemplates: Template[];
  totals: LockedTotals;
  stxOnlyCalculations: StxOnlyCalculations;
  savedCopy: boolean;
  locale: Locale;
}) {
  const t = translator(locale);

  /*
   * "N pools to choose from" counts what somebody could choose: pools in use,
   * on contract types nobody has replaced. The contract types are counted off
   * those same pools, because the tile says these pools run that many kinds of
   * contract — which is only true of the kinds they actually run.
   */
  const choosable = useMemo(
    () => live.filter((signer) => inUse(signer, totals)),
    [live, totals],
  );
  const typeCount = useMemo(() => {
    const running = new Set(choosable.map((signer) => signer.profileId));
    return liveTemplates.filter((template) => running.has(template.profile.id))
      .length;
  }, [choosable, liveTemplates]);

  const contractIds = live.map((signer) => signer.contractId);
  const staked = sumUstx(contractIds, totals.ustx);
  const stakedNext = totals.next
    ? sumUstx(contractIds, totals.next.ustx)
    : null;
  const rewards = stxOnlySummary(stxOnlyCalculations);
  const lastUpdate = formatLastUpdate(signerData.generatedAt, locale);

  return (
    <Page wide>
      <header className='mb-5'>
        <h1 className='text-3xl font-extrabold tracking-tight md:text-4xl'>
          {t('app.heading')}
        </h1>
        <p className='mt-2 max-w-2xl text-muted md:text-lg'>
          {t('home.intro')}
        </p>
      </header>

      <div className='grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4'>
        <StatTile
          label={t('home.stat.staked', { cycle: totals.cycle })}
          value={staked === null ? '—' : (stxCompact(staked, locale) ?? '—')}
        >
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

        <StatTile label={t('home.stat.pools')} value={choosable.length}>
          {t.plural('home.stat.types', typeCount)}{' '}
          <a
            href={contractsHref()}
            className='font-bold whitespace-nowrap text-grape'
          >
            {t('home.stat.compare')}
          </a>
        </StatTile>

        <StatTile
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

      <div className='mt-3 mb-5'>
        <Freshness
          generatedAt={signerData.generatedAt}
          savedCopy={savedCopy}
          locale={locale}
          variant='inline'
        />
      </div>

      <PoolList signers={live} totals={totals} locale={locale} />

      <footer className='mt-12 space-y-3 border-t border-hairline pt-6 text-sm text-muted'>
        <p>
          <strong className='text-ink'>{t('app.footer.feesTitle')}</strong>{' '}
          {t('home.footer.fees')}
        </p>
        <p>
          {t('app.footer.identity', { at: lastUpdate, cycle: totals.cycle })}
        </p>
        <p>
          {t.rich('app.footer.trust', {
            link: (
              <a
                className='font-semibold text-grape underline underline-offset-2'
                href={REPO_URL}
                target='_blank'
                rel='noreferrer'
              >
                {t('app.footer.trustLink')}
              </a>
            ),
          })}
        </p>
        <p>
          {t.rich('app.footer.madeBy', {
            link: (
              <a
                className='font-semibold text-grape underline underline-offset-2'
                href={FASTPOOL_URL}
              >
                Fast Pool
              </a>
            ),
          })}
        </p>
      </footer>
    </Page>
  );
}
