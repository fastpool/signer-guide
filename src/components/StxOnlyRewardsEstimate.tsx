import { useEffect, useMemo, useState } from 'react';
import { exactStxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import type { StxOnlyCalculations } from '../lib/types';

const FALLBACK_DISTRIBUTION_BLOCKS = 1050;
const SATS_PER_SBTC = 100_000_000n;
const BITCOIN_BLOCK_MINUTES = 10;
const PAYOUT_PERIODS_PER_YEAR = 52;
const SATS_PER_BTC = 100_000_000;

type Estimate = {
  sbtcBalanceSats: bigint;
  bondShareSats: bigint;
  foundationShareSats: bigint;
  stxOnlySoFarSats: bigint;
  projectedCycleSats: bigint;
  stxOnlyStakedUstx: bigint;
  totalStakedUstx: bigint;
  bondStakedUstx: bigint;
  blocksIntoCycle: number;
  blocksLeftInCycle: number;
  rateSatsPer1000Stx: bigint;
};

function asBigint(value: string | null): bigint | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function apyPercent(opts: {
  rateSatsPer1000Stx: bigint;
  stxPriceSats: number;
}): number | null {
  if (!Number.isFinite(opts.stxPriceSats) || opts.stxPriceSats <= 0) return null;

  const periodReturn =
    Number(opts.rateSatsPer1000Stx) / (1000 * opts.stxPriceSats);
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
  const hours = Math.max(
    1,
    Math.round((blocksLeft * BITCOIN_BLOCK_MINUTES) / 60),
  );
  if (hours < 48) return t.plural('app.stxOnlyEstimate.durationHours', hours);
  const days = Math.max(1, Math.round(hours / 24));
  return t.plural('app.stxOnlyEstimate.durationDays', days);
}

export default function StxOnlyRewardsEstimate({
  calculations,
  locale,
  mode = 'full',
  detailsHref,
  asOf,
}: {
  calculations: StxOnlyCalculations;
  locale: Locale;
  mode?: 'compact' | 'full';
  detailsHref?: string;
  asOf?: string;
}) {
  const t = translator(locale);
  const showFull = mode === 'full';
  const [stxPriceSats, setStxPriceSats] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    const loadPrice = async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=btc',
          { signal: controller.signal, cache: 'no-cache' },
        );
        if (!res.ok) throw new Error('price failed');
        const body = (await res.json()) as {
          blockstack?: { btc?: number };
        };
        const btc = body.blockstack?.btc;
        if (typeof btc !== 'number' || !Number.isFinite(btc) || btc <= 0) {
          throw new Error('price shape');
        }
        if (!live) return;
        setStxPriceSats(btc * SATS_PER_BTC);
      } catch {
        if (!live) return;
        setStxPriceSats(null);
      }
    };

    void loadPrice();
    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  const estimate = useMemo<Estimate | null>(() => {
    const sbtcBalanceSats = asBigint(calculations.sbtcBalanceSats);
    const bondShareSats = asBigint(calculations.bondShareSats);
    const foundationShareSats = asBigint(calculations.foundationShareSats);
    const stxOnlySoFarSats = asBigint(calculations.stxOnlySoFarSats);
    const projectedCycleSats = asBigint(calculations.projectedCycleSats);
    const stxOnlyStakedUstx = asBigint(calculations.stxOnlyStakedUstx);
    const totalStakedUstx = asBigint(calculations.totalStakedUstx);
    const bondStakedUstx = asBigint(calculations.bondStakedUstx);
    const rateSatsPer1000Stx = asBigint(calculations.rateSatsPer1000Stx);
    const blocksIntoCycle = calculations.blocksIntoCycle;
    const blocksLeftInCycle = calculations.blocksLeftInCycle;

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
      blocksIntoCycle === null ||
      blocksLeftInCycle === null
    ) {
      return null;
    }

    return {
      sbtcBalanceSats,
      bondShareSats,
      foundationShareSats,
      stxOnlySoFarSats,
      projectedCycleSats,
      stxOnlyStakedUstx,
      totalStakedUstx,
      bondStakedUstx,
      blocksIntoCycle,
      blocksLeftInCycle,
      rateSatsPer1000Stx,
    };
  }, [calculations]);

  const apy = useMemo(() => {
    if (!estimate || stxPriceSats === null) return null;
    return apyPercent({
      rateSatsPer1000Stx: estimate.rateSatsPer1000Stx,
      stxPriceSats,
    });
  }, [estimate, stxPriceSats]);

  return (
    <section className='mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      {showFull ? (
        <h2 className='text-2xl font-bold'>{t('app.stxOnlyEstimate.title')}</h2>
      ) : (
        <p className='text-sm font-semibold text-muted'>
          {t('app.stxOnlyEstimate.title')}
        </p>
      )}
      {showFull && (
        <p className='mt-1 text-sm text-muted'>{t('app.stxOnlyEstimate.intro')}</p>
      )}

      {!estimate && (
        <p className='mt-3 text-sm text-amber-warm'>
          {t('app.stxOnlyEstimate.unavailable')}
        </p>
      )}

      {estimate && !showFull && (
        <div className='mt-3'>
          <p className='mt-1 text-3xl font-extrabold tracking-tight text-ink md:text-4xl'>
            {t('app.stxOnlyEstimate.rateValue', {
              sats: estimate.rateSatsPer1000Stx.toLocaleString(
                t.bundle.intlLocale,
              ),
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
                )
            }
          </p>
          <p className='mt-1 text-xs text-muted'>
            {t('app.stxOnlyEstimate.untilPayoutAsOf', {
              duration: durationUntilPayout(estimate.blocksLeftInCycle, locale),
              blocks: estimate.blocksLeftInCycle.toLocaleString(
                t.bundle.intlLocale,
              ),
              at: asOf ?? t('app.stxOnlyEstimate.asOfUnknown'),
            })}
          </p>
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
            <dt className='text-muted'>
              {t('app.stxOnlyEstimate.foundationShare')}
            </dt>
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
              {t('app.stxOnlyEstimate.progress', {
                now: estimate.blocksIntoCycle,
                total:
                  calculations.distributionBlocks ||
                  FALLBACK_DISTRIBUTION_BLOCKS,
              })}
            </dt>
            <dd className='font-semibold text-ink'>
              {t('app.stxOnlyEstimate.projected', {
                amount: formatSbtc(estimate.projectedCycleSats, locale),
              })}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.stxOnlyStaked')}</dt>
            <dd className='font-semibold text-ink'>
              {exactStxLabel(estimate.stxOnlyStakedUstx, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3 border-t border-black/5 pt-2'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.rate')}</dt>
            <dd className='text-base font-bold text-ink'>
              {t('app.stxOnlyEstimate.rateValue', {
                sats: estimate.rateSatsPer1000Stx.toLocaleString(
                  t.bundle.intlLocale,
                ),
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
              {stxPriceSats === null
                ? t('app.stxOnlyEstimate.priceUnavailable')
                : t('app.stxOnlyEstimate.priceValue', {
                    sats: Math.round(stxPriceSats).toLocaleString(
                      t.bundle.intlLocale,
                    ),
                  })}
            </dd>
          </div>
        </dl>
      )}

      {detailsHref && (
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
        <p className='mt-3 text-xs text-muted'>{t('app.stxOnlyEstimate.note')}</p>
      )}
    </section>
  );
}
