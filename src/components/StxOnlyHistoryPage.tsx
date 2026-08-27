import { translator, type Locale } from '../lib/i18n';
import { burnBlockUrl } from '../lib/explorer';
import { stxOnlyRewardsHref } from '../lib/route';
import {
  byCycle,
  useStxOnlyHistory,
  type CycleDistributions,
} from '../lib/stx-only-history';
import LocaleSwitch from './LocaleSwitch';

/**
 * What every distribution has actually paid, newest first.
 *
 * The estimate page answers "what will this cycle pay"; this one answers
 * "what did the last ones pay", which is the only figure on either page that
 * nobody has projected. pox-5 pays twice a cycle, so each cycle has two lines
 * and a total — and the total comes from the chain's cumulative figure rather
 * than from adding the two lines, which would lose the sat each of them
 * rounded away.
 */
export default function StxOnlyHistoryPage({
  locale,
  onLocaleChange,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const history = useStxOnlyHistory();
  const cycles =
    history.state === 'ready' ? byCycle(history.value.distributions) : [];

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href={stxOnlyRewardsHref()}
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('app.stxOnlyHistory.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-3xl font-extrabold md:text-4xl'>
        {t('app.stxOnlyHistory.title')}
      </h1>
      <p className='mt-3 text-lg text-muted'>{t('app.stxOnlyHistory.intro')}</p>

      {history.state === 'loading' && (
        <p className='mt-6 text-muted'>{t('app.stxOnlyHistory.loading')}</p>
      )}
      {history.state === 'missing' && (
        <p className='mt-6 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {t('app.stxOnlyHistory.none')}
        </p>
      )}
      {history.state === 'failed' && (
        <p className='mt-6 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {t('app.stxOnlyHistory.failed')}
        </p>
      )}

      {history.state === 'ready' && cycles.length === 0 && (
        <p className='mt-6 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {t('app.stxOnlyHistory.none')}
        </p>
      )}

      {cycles.length > 0 && (
        <ul className='mt-6 space-y-3'>
          {cycles.map((cycle) => (
            <CycleCard key={cycle.cycle} cycle={cycle} locale={locale} />
          ))}
        </ul>
      )}

      <p className='mt-8 text-sm text-muted'>{t('app.stxOnlyHistory.note')}</p>
    </main>
  );
}

function CycleCard({
  cycle,
  locale,
}: {
  cycle: CycleDistributions;
  locale: Locale;
}) {
  const t = translator(locale);
  const number = (value: bigint | number) =>
    value.toLocaleString(t.bundle.intlLocale);

  return (
    <li className='rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2'>
        <span className='text-lg font-bold'>
          {t('app.stxOnlyHistory.cycle', { cycle: cycle.cycle })}
        </span>
        <span className='text-sm'>
          {cycle.totalSatsPer1000Stx === null ? (
            <span className='text-muted'>
              {t('app.stxOnlyHistory.stillPaying')}
            </span>
          ) : (
            <>
              <strong>
                {t('app.stxOnlyEstimate.rateValue', {
                  sats: number(cycle.totalSatsPer1000Stx),
                })}
              </strong>
              <span className='ml-2 text-muted'>
                {t('app.stxOnlyHistory.cycleTotal')}
              </span>
            </>
          )}
        </span>
      </div>

      <ul className='mt-3 space-y-2 text-sm'>
        {cycle.payouts.map((payout) => (
          <li
            key={payout.burnHeight}
            className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'
          >
            <span className='text-muted'>
              {payout.firstOfCycle
                ? t('app.stxOnlyHistory.firstHalf')
                : t('app.stxOnlyHistory.secondHalf')}
              <a
                className='ml-2 underline underline-offset-2 hover:text-grape'
                href={burnBlockUrl(payout.burnHeight)}
                target='_blank'
                rel='noreferrer'
              >
                {t('app.stxOnlyHistory.atHeight', {
                  height: number(payout.burnHeight),
                })}
              </a>
            </span>
            <span>
              {payout.rateSatsPer1000Stx === null ? (
                // Not "0": nobody was paid nothing, we simply cannot say what
                // this one paid. See the note on the field.
                <span className='text-muted'>
                  {t('app.stxOnlyHistory.rateUnknown')}
                </span>
              ) : (
                <strong>
                  {t('app.stxOnlyEstimate.rateValue', {
                    sats: number(BigInt(payout.rateSatsPer1000Stx)),
                  })}
                </strong>
              )}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
