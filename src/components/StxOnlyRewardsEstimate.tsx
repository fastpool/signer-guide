import { useMemo, useRef, useState } from 'react';
import { exactStxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import {
  apyPercent,
  FALLBACK_DISTRIBUTION_BLOCKS,
  hoursUntilPayout,
  payoutDueAt,
  payoutHappenedAt,
} from '../lib/rate-view';
import { stxOnlyHistoryHref } from '../lib/route';
import type { StxOnlyCalculations } from '../lib/types';

const SATS_PER_SBTC = 100_000_000n;

type Estimate = {
  accruedRewardsSats: bigint;
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
  /** Null before the first payout, or when the file predates it. */
  lastPayoutRateSatsPer1000Stx: bigint | null;
  lastPayoutCycle: number | null;
  /** Burn height of that payout, which is how its date is worked out. */
  lastRewardBurnHeight: number | null;
  projectedRateSatsPer1000Stx: bigint | null;
};

function asBigint(value: string | null): bigint | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
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
  const hours = hoursUntilPayout(blocksLeft);
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

/** One label-over-figure cell of the qualifier grid. */
/*
 * The questions the breakdown above raises but cannot answer in a label.
 *
 * Three rates on one page is the reason this exists: a reader can see 407,
 * 432 and 417 and have no way to tell that the third is made of the first
 * two. Written as questions somebody would actually ask, and closed by
 * default — the answer is for the reader who wants it, not a wall in front of
 * the one who does not.
 */
const FAQ = [
  'threeRates',
  'blend',
  'sats',
  'distributionCycle',
  'fifty',
  'promise',
] as const;

type FaqId = (typeof FAQ)[number];

function Qualifier({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-[0.6rem] font-bold tracking-wide text-faint uppercase'>
        {label}
      </dt>
      <dd className='mt-0.5 text-sm font-bold text-ink'>{value}</dd>
    </div>
  );
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

  /*
   * One question open at a time, and openable from somewhere other than its
   * own summary: the rate is where the question occurs to somebody, and the
   * answer is at the bottom of the page. A button rather than a fragment link
   * because the app routes on the hash — `#faq-blend` would navigate away.
   */
  const [openQuestion, setOpenQuestion] = useState<FaqId | null>(null);
  const blendRef = useRef<HTMLDetailsElement>(null);
  const openBlend = () => {
    setOpenQuestion('blend');
    blendRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const estimate = useMemo<Estimate | null>(() => {
    const accruedRewardsSats = asBigint(calculations.accruedRewardsSats);
    const stxPriceSats = asBigint(calculations.stxPriceSats);
    const bondShareSats = asBigint(calculations.bondShareSats);
    const foundationShareSats = asBigint(calculations.foundationShareSats);
    const stxOnlySoFarSats = asBigint(calculations.stxOnlySoFarSats);
    const projectedCycleSats = asBigint(calculations.projectedCycleSats);
    const stxOnlyStakedUstx = asBigint(calculations.stxOnlyStakedUstx);
    const totalStakedUstx = asBigint(calculations.totalStakedUstx);
    const bondStakedUstx = asBigint(calculations.bondStakedUstx);
    const rateSatsPer1000Stx = asBigint(calculations.rateSatsPer1000Stx);
    const lastPayoutRateSatsPer1000Stx = asBigint(
      calculations.lastPayoutRateSatsPer1000Stx ?? null,
    );
    const projectedRateSatsPer1000Stx = asBigint(
      calculations.projectedRateSatsPer1000Stx ?? null,
    );

    if (
      accruedRewardsSats === null ||
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
      accruedRewardsSats,
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
      lastPayoutRateSatsPer1000Stx,
      lastPayoutCycle: calculations.lastPayoutCycle ?? null,
      lastRewardBurnHeight: calculations.lastRewardBurnHeight ?? null,
      projectedRateSatsPer1000Stx,
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

  /*
   * When the last payout happened, rather than which reward cycle it paid for.
   * The cycle number named a fortnight with two payouts in it, so "cycle 141"
   * beside one figure did not say which of the two it was — and a reader
   * comparing it with a rate that moves hourly needs to know how old it is.
   */
  const lastPayoutAt = useMemo(() => {
    const base = new Date(calculations.generatedAt).getTime();
    if (Number.isNaN(base) || !estimate) return null;
    if (estimate.lastRewardBurnHeight === null) return null;
    const blocksSince =
      estimate.currentBurnHeight - estimate.lastRewardBurnHeight;
    if (blocksSince < 0) return null;
    return formatUtc(
      payoutHappenedAt({ now: base, blocksSince }).toISOString(),
      locale,
    );
  }, [calculations.generatedAt, estimate, locale]);

  const nextRewardsAt = useMemo(() => {
    const base = new Date(calculations.generatedAt).getTime();
    if (Number.isNaN(base) || !estimate) return null;
    return formatUtc(
      payoutDueAt({ now: base, blocksLeft: estimate.blocksLeftInCycle }).toISOString(),
      locale,
    );
  }, [calculations.generatedAt, estimate, locale]);

  return (
    <section
      className={
        showFull
          ? 'mt-10 rounded-3xl bg-card p-6 shadow-lift'
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

              <div className='mt-3 rounded-3xl bg-card p-5 shadow-lift'>
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

                {/*
                 * Two qualifiers, as a grid rather than a wrapping row. A row
                 * is what drops "LAST PAYOUT, AS PAID" onto a line of its own
                 * on a narrow screen; fixed columns cannot. The labels are
                 * shortened to fit them — the long forms are on the full page,
                 * which is where somebody reading a label carefully already
                 * is.
                 *
                 * This cycle's own extrapolation used to be a third column. It
                 * is the noisiest figure the guide holds and it sat beside a
                 * headline it disagrees with, unexplained, on the first screen
                 * anybody sees. It is on the full page, next to the settled
                 * figure it is blended with.
                 */}
                <dl className='mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-3'>
                  <Qualifier
                    label={t('app.stxOnlyEstimate.gridApy')}
                    value={
                      apy === null
                        ? t('app.stxOnlyEstimate.gridUnknown')
                        : `${apy.toFixed(2)}%`
                    }
                  />
                  <Qualifier
                    label={t('app.stxOnlyEstimate.gridLast')}
                    value={
                      estimate.lastPayoutRateSatsPer1000Stx === null
                        ? t('app.stxOnlyEstimate.gridUnknown')
                        : t('app.stxOnlyEstimate.satsShort', {
                            sats:
                              estimate.lastPayoutRateSatsPer1000Stx.toLocaleString(
                                t.bundle.intlLocale,
                              ),
                          })
                    }
                  />
                </dl>

                {/*
                 * The one figure on this card nobody has projected is on
                 * another page, so the card says where. This replaces
                 * repeating the arithmetic here, which cost three lines on the
                 * first screen somebody sees.
                 */}
                <p className='mt-3 border-t border-hairline pt-3 text-sm'>
                  <a
                    className='font-semibold text-grape no-underline'
                    href={stxOnlyHistoryHref()}
                  >
                    {t('app.stxOnlyEstimate.openHistory')} →
                  </a>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {estimate && showFull && (
        <dl className='mt-4 space-y-2 text-sm'>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.accrued')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.accruedRewardsSats, locale)}
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
          {estimate.projectedRateSatsPer1000Stx !== null && (
            <div className='flex flex-wrap items-baseline justify-between gap-3'>
              <dt className='text-muted'>
                {t('app.stxOnlyEstimate.projectedRate')}
              </dt>
              <dd className='font-semibold text-ink'>
                {t('app.stxOnlyEstimate.rateValue', {
                  sats: estimate.projectedRateSatsPer1000Stx.toLocaleString(
                    t.bundle.intlLocale,
                  ),
                })}
              </dd>
            </div>
          )}
           {estimate.lastPayoutRateSatsPer1000Stx !== null && (
            <div className='flex flex-wrap items-baseline justify-between gap-3'>
              <dt className='text-muted'>
                {lastPayoutAt === null
                  ? t('app.stxOnlyEstimate.lastPayout')
                  : t('app.stxOnlyEstimate.lastPayoutAt', { at: lastPayoutAt })}
              </dt>
              <dd className='font-semibold text-ink'>
                {t('app.stxOnlyEstimate.rateValue', {
                  sats: estimate.lastPayoutRateSatsPer1000Stx.toLocaleString(
                    t.bundle.intlLocale,
                  ),
                })}
              </dd>
            </div>
          )}
          <div aria-hidden='true' className='border-t border-grape-soft' />          
          
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>
              {t('app.stxOnlyEstimate.rate')}{' '}
              {/*
                The number above the line is made of the two above it, and this
                is where somebody wonders how. The arithmetic itself is in the
                FAQ rather than under the row: a figure that needs a sentence
                every time it is shown should not be carrying the sentence.
              */}
              <button
                type='button'
                onClick={openBlend}
                className='text-xs font-semibold text-grape underline underline-offset-2'
              >
                {t('app.stxOnlyEstimate.rateBlendLink')}
              </button>
            </dt>
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
          {/* The realised figures, which the estimate above is trying to
              predict. Worth a link from here rather than from the list: a
              reader on this page has already asked how the rate is arrived
              at. */}
          <p className='mt-4 text-sm'>
            <a
              className='font-semibold text-grape underline underline-offset-2'
              href={stxOnlyHistoryHref()}
            >
              {t('app.stxOnlyEstimate.openHistory')}
            </a>
          </p>
          <section className='mt-6 border-t border-hairline pt-4'>
            <h3 className='text-lg font-bold'>{t('app.stxOnlyFaq.title')}</h3>
            <div className='mt-2 space-y-1'>
              {FAQ.map((id) => (
                <details
                  key={id}
                  ref={id === 'blend' ? blendRef : undefined}
                  open={openQuestion === id}
                  onToggle={(event) =>
                    setOpenQuestion(event.currentTarget.open ? id : null)
                  }
                  className='rounded-2xl bg-grape-soft/40 px-4 py-3'
                >
                  <summary className='cursor-pointer text-sm font-semibold text-ink'>
                    {t(`app.stxOnlyFaq.q.${id}`)}
                  </summary>
                  <p className='mt-2 text-sm text-muted'>
                    {t(`app.stxOnlyFaq.a.${id}`)}
                  </p>
                  {id === 'blend' && estimate && (
                    <p className='mt-2 text-sm font-semibold text-ink'>
                      {t('app.stxOnlyEstimate.rateBlend', {
                        now: estimate.blocksIntoCycle.toLocaleString(
                          t.bundle.intlLocale,
                        ),
                        total: cycleBlocks.toLocaleString(t.bundle.intlLocale),
                        rest: Math.max(
                          0,
                          cycleBlocks - estimate.blocksIntoCycle,
                        ).toLocaleString(t.bundle.intlLocale),
                      })}
                    </p>
                  )}
                </details>
              ))}
            </div>
          </section>

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
