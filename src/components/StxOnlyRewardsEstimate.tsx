import { useMemo } from 'react';
import { exactStxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import type { StxOnlyCalculations } from '../lib/types';

const FALLBACK_DISTRIBUTION_BLOCKS = 1050;
const SATS_PER_SBTC = 100_000_000n;
const BITCOIN_BLOCK_MINUTES = 10;
const PAYOUT_PERIODS_PER_YEAR = 52;

type Estimate = {
  sbtcBalanceSats: bigint;
  stxPriceSats: bigint | null;
  bondShareSats: bigint;
  foundationShareSats: bigint;
  stxOnlySoFarSats: bigint;
  projectedCycleSats: bigint;
  stxOnlyStakedUstx: bigint;
  totalStakedUstx: bigint;
  bondStakedUstx: bigint;
  blocksIntoCycle: number;
  blocksLeftInCycle: number;
  currentBurnHeight: number;
  nextRewardBurnHeight: number;
  rateSatsPer1000Stx: bigint;
};

function asBigint(value: string | null): bigint | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function apyPercent(opts: {
  rateSatsPer1000Stx: bigint;
  stxPriceSats: bigint;
}): number | null {
  if (opts.stxPriceSats <= 0n) return null;

  const periodReturn = Number(opts.rateSatsPer1000Stx) / Number(1000n * opts.stxPriceSats);
  if (!Number.isFinite(periodReturn) || periodReturn < 0) return null;

  return (Math.pow(1 + periodReturn, PAYOUT_PERIODS_PER_YEAR) - 1) * 100;
}

function formatSbtc(sats: bigint, locale: Locale): string {
  const t = translator(locale);
  const whole = (sats / SATS_PER_SBTC).toLocaleString(t.bundle.intlLocale);
  const frac = (sats % SATS_PER_SBTC)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac} sBTC` : `${whole} sBTC`;
}

function durationUntilPayout(blocksLeft: number, locale: Locale): string {
  const t = translator(locale);
  const hours = Math.max(1, Math.round((blocksLeft * BITCOIN_BLOCK_MINUTES) / 60));
  if (hours < 48) return t.plural('app.stxOnlyEstimate.durationHours', hours);
  const days = Math.max(1, Math.round(hours / 24));
  return t.plural('app.stxOnlyEstimate.durationDays', days);
}

function formatUtc(iso: string, locale: Locale): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const t = translator(locale);
  const day = at.toLocaleDateString(t.bundle.intlLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}

export default function StxOnlyRewardsEstimate({
  calculations,
  locale,
  mode = 'full',
  compactVariant = 'weekly',
  detailsHref,
  asOf,
}: {
  calculations: StxOnlyCalculations;
  locale: Locale;
  mode?: 'compact' | 'full';
  compactVariant?: 'original' | 'weekly';
  detailsHref?: string;
  asOf?: string;
}) {
  const t = translator(locale);
  const showFull = mode === 'full';

  const estimate = useMemo<Estimate | null>(() => {
    const sbtcBalanceSats = asBigint(calculations.sbtcBalanceSats);
    const stxPriceSats = asBigint(calculations.stxPriceSats);
    const bondShareSats = asBigint(calculations.bondShareSats);
    const foundationShareSats = asBigint(calculations.foundationShareSats);
    const stxOnlySoFarSats = asBigint(calculations.stxOnlySoFarSats);
    const projectedCycleSats = asBigint(calculations.projectedCycleSats);
    const stxOnlyStakedUstx = asBigint(calculations.stxOnlyStakedUstx);
    const totalStakedUstx = asBigint(calculations.totalStakedUstx);
    const bondStakedUstx = asBigint(calculations.bondStakedUstx);
    const rateSatsPer1000Stx = asBigint(calculations.rateSatsPer1000Stx);

    if (
      sbtcBalanceSats === null ||
      bondShareSats === null ||
      foundationShareSats === null ||
      stxOnlySoFarSats === null ||
      projectedCycleSats === null ||
      stxOnlyStakedUstx === null ||
      totalStakedUstx === null ||
      bondStakedUstx === null ||
      rateSatsPer1000Stx === null ||
      calculations.blocksIntoCycle === null ||
      calculations.blocksLeftInCycle === null ||
      calculations.currentBurnHeight === null ||
      calculations.nextRewardBurnHeight === null
    ) {
      return null;
    }

    return {
      sbtcBalanceSats,
      stxPriceSats,
      bondShareSats,
      foundationShareSats,
      stxOnlySoFarSats,
      projectedCycleSats,
      stxOnlyStakedUstx,
      totalStakedUstx,
      bondStakedUstx,
      blocksIntoCycle: calculations.blocksIntoCycle,
      blocksLeftInCycle: calculations.blocksLeftInCycle,
      currentBurnHeight: calculations.currentBurnHeight,
      nextRewardBurnHeight: calculations.nextRewardBurnHeight,
      rateSatsPer1000Stx,
    };
  }, [calculations]);

  const apy = useMemo(() => {
    if (!estimate || estimate.stxPriceSats === null) return null;
    return apyPercent({
      rateSatsPer1000Stx: estimate.rateSatsPer1000Stx,
      stxPriceSats: estimate.stxPriceSats,
    });
  }, [estimate]);

  const cycleBlocks = calculations.distributionBlocks || FALLBACK_DISTRIBUTION_BLOCKS;
  const progressPercent =
    estimate === null
      ? 0
      : Math.max(0, Math.min(100, (estimate.blocksIntoCycle / cycleBlocks) * 100));

  const asOfText = useMemo(() => {
    if (asOf) return asOf;
    return (
      formatUtc(calculations.generatedAt, locale) ??
      t('app.stxOnlyEstimate.asOfUnknown')
    );
  }, [asOf, calculations.generatedAt, locale, t]);

  const nextRewardsAt = useMemo(() => {
    const base = new Date(calculations.generatedAt).getTime();
    if (Number.isNaN(base) || !estimate) return null;
    return formatUtc(
      new Date(base + estimate.blocksLeftInCycle * BITCOIN_BLOCK_MINUTES * 60 * 1000).toISOString(),
      locale,
    );
  }, [calculations.generatedAt, estimate, locale]);

  return (
    <section
      className={
        showFull
          ? 'mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'
          : ''
      }
    >
      {showFull && (
        <>
          <h2 className='text-2xl font-bold'>{t('app.stxOnlyEstimate.title')}</h2>
          <p className='mt-1 text-sm text-muted'>{t('app.stxOnlyEstimate.intro')}</p>
        </>
      )}

      {!estimate && (
        <p className='mt-3 text-sm text-amber-warm'>
          {t('app.stxOnlyEstimate.unavailable')}
        </p>
      )}

      {estimate && !showFull && (
        <div className='mt-3'>
          {compactVariant === 'original' ? (
            <>
              <p className='mt-1 text-3xl font-extrabold tracking-tight text-ink md:text-4xl'>
                {t('app.stxOnlyEstimate.rateValue', {
                  sats: estimate.rateSatsPer1000Stx.toLocaleString(t.bundle.intlLocale),
                })}
              </p>
              <p className='mt-1 text-xs text-muted'>
                {apy === null
                  ? t('app.stxOnlyEstimate.apyUnavailable')
                  : (
                      <>
                        {t('app.stxOnlyEstimate.apy')}:&nbsp;
                        {t('app.stxOnlyEstimate.apyValue', {
                          apy: `${apy.toFixed(2)}%`,
                        })}
                      </>
                    )}
              </p>
              <p className='mt-1 text-xs text-muted'>
                {t('app.stxOnlyEstimate.untilPayoutAsOf', {
                  duration: durationUntilPayout(estimate.blocksLeftInCycle, locale),
                  blocks: estimate.blocksLeftInCycle.toLocaleString(t.bundle.intlLocale),
                  at: asOfText,
                })}
              </p>
            </>
          ) : (
            <>
              <p className='text-lg text-muted'>
                {t.rich('app.stxOnlyEstimate.homeSentence', {
                  rate: (
                    <>
                      <br />
                      <strong className='text-ink'>
                        {t('app.stxOnlyEstimate.rateValue', {
                          sats: estimate.rateSatsPer1000Stx.toLocaleString(t.bundle.intlLocale),
                        })}
                      </strong>
                    </>
                  ),
                  apy:
                    apy === null
                      ? t('app.stxOnlyEstimate.apyUnavailable')
                      : `${apy.toFixed(2)}%`,
                  link: (
                    <a
                      className='ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-grape-soft text-grape no-underline align-middle'
                      href={detailsHref ?? '#'}
                      aria-label={t('app.stxOnlyEstimate.openFull')}
                      title={t('app.stxOnlyEstimate.openFull')}
                    >
                      <span aria-hidden='true'>↗</span>
                    </a>
                  ),
                })}
              </p>

              <div className='mt-3 rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
                <div className='flex items-baseline justify-between gap-3'>
                  <p className='text-sm font-semibold text-ink'>
                    {t('app.stxOnlyEstimate.untilNextRewards')}
                  </p>
                  <p className='text-xs font-semibold text-muted'>
                    {estimate.blocksIntoCycle.toLocaleString(t.bundle.intlLocale)}/
                    {cycleBlocks.toLocaleString(t.bundle.intlLocale)}
                  </p>
                </div>
                <div className='mt-2 h-2 w-full overflow-hidden rounded-full bg-grape-soft'>
                  <div
                    role='progressbar'
                    aria-valuemin={0}
                    aria-valuemax={cycleBlocks}
                    aria-valuenow={estimate.blocksIntoCycle}
                    className='h-full rounded-full bg-grape'
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className='mt-2 text-xs text-muted'>
                  {t('app.stxOnlyEstimate.untilNextDate', {
                    duration: durationUntilPayout(estimate.blocksLeftInCycle, locale),
                    at: nextRewardsAt ?? t('app.stxOnlyEstimate.asOfUnknown'),
                  })}
                </p>
                <p className='mt-1 text-xs text-muted'>
                  {t('app.stxOnlyEstimate.untilNextHeights', {
                    blocks: estimate.blocksLeftInCycle.toLocaleString(t.bundle.intlLocale),
                    current: estimate.currentBurnHeight.toLocaleString(t.bundle.intlLocale),
                    next: estimate.nextRewardBurnHeight.toLocaleString(t.bundle.intlLocale),
                    asOf: asOfText,
                  })}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {estimate && showFull && (
        <dl className='mt-4 space-y-2 text-sm'>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.currentPool')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.sbtcBalanceSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.bondShare')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.bondShareSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.foundationShare')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.foundationShareSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.stxOnlySoFar')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.stxOnlySoFarSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>
              {t('app.stxOnlyEstimate.progressLabel')}
            </dt>
            <dd className='font-semibold text-ink'>
              {estimate.blocksIntoCycle.toLocaleString(t.bundle.intlLocale)}/
              {cycleBlocks.toLocaleString(t.bundle.intlLocale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>
              {t('app.stxOnlyEstimate.projectedLabel')}
            </dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.projectedCycleSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.stxOnlyStaked')}</dt>
            <dd className='font-semibold text-ink'>
              {exactStxLabel(estimate.stxOnlyStakedUstx, locale)}
            </dd>
          </div>
          <div aria-hidden='true' className='border-t border-grape-soft' />
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.rate')}</dt>
            <dd className='font-semibold text-ink'>
              {t('app.stxOnlyEstimate.rateValue', {
                sats: estimate.rateSatsPer1000Stx.toLocaleString(t.bundle.intlLocale),
              })}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.apy')}</dt>
            <dd className='font-semibold text-ink'>
              {apy === null
                ? t('app.stxOnlyEstimate.apyUnavailable')
                : t('app.stxOnlyEstimate.apyValue', {
                    apy: `${apy.toFixed(2)}%`,
                  })}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.stxPrice')}</dt>
            <dd className='font-semibold text-ink'>
              {estimate.stxPriceSats === null
                ? t('app.stxOnlyEstimate.priceUnavailable')
                : t('app.stxOnlyEstimate.priceValue', {
                    sats: estimate.stxPriceSats.toLocaleString(t.bundle.intlLocale),
                  })}
            </dd>
          </div>
        </dl>
      )}

      {detailsHref && compactVariant === 'original' && !showFull && (
        <p className='mt-3 text-sm'>
          <a
            className='font-semibold text-grape underline underline-offset-2'
            href={detailsHref}
          >
            {t('app.stxOnlyEstimate.openFull')}
          </a>
        </p>
      )}

      {showFull && (
        <>
          <p className='mt-3 text-xs text-muted'>{t('app.stxOnlyEstimate.note')}</p>
          <p className='mt-1 text-xs text-muted'>
            {t('app.stxOnlyEstimate.generatedAt', {
              at:
                formatUtc(calculations.generatedAt, locale) ??
                t('app.stxOnlyEstimate.asOfUnknown'),
            })}
          </p>
        </>
      )}
    </section>
  );
}
