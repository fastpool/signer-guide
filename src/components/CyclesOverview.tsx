import { sbtcCompact, stxCompact, usdCompact } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import {
  cycleApyPercent,
  cycleComplete,
  cycleRateSatsPer1000Stx,
  cycleRewardsUsd,
  isNetworkHistory,
} from '../lib/network-history';
import { useRemoteJson } from '../lib/remote-json';
import type { NetworkCycle } from '../lib/types';
import { InfoTip } from './ui';

/**
 * The network, one row per pox-5 cycle: what was staked, by how many signers
 * and pools, what it paid and what that came to as a yield.
 *
 * A chart of what each cycle paid in sBTC first, because the trend is the
 * question; the table after it for the figures. The cycle still being paid is
 * striped, as the pool page's cycle chart stripes the cycle still filling.
 */
export default function CyclesOverview({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const history = useRemoteJson('network-history.json', isNetworkHistory);

  if (history.state === 'loading') {
    return <p className='mt-6 text-muted'>{t('cycles.loading')}</p>;
  }
  if (history.state !== 'ready' || history.value.cycles.length === 0) {
    // The payout list below still stands on its own; say nothing loud.
    return null;
  }

  // Cycles with a payout, oldest first for the chart.
  const paid = history.value.cycles.filter((c) => c.payouts.length > 0);
  const chart = [...paid].reverse();
  const most = chart.reduce((m, c) => {
    const sats = BigInt(c.stxOnlyRewardsSats ?? '0');
    return sats > m ? sats : m;
  }, 1n);

  return (
    <section aria-labelledby='cycles-heading' className='mt-8'>
      <h2 id='cycles-heading' className='text-xl font-extrabold'>
        {t('cycles.title')}
      </h2>
      <p className='mt-1 text-sm text-muted'>{t('cycles.intro')}</p>

      <div className='mt-4 rounded-2xl bg-card p-4 shadow-lift sm:p-5'>
        <p className='mb-2 flex items-center gap-1 text-xs font-semibold text-muted'>
          {t('cycles.chart')} <InfoTip text={t('cycles.rewardsHelp')} />
        </p>
        <div
          aria-hidden='true'
          className='flex h-32 items-end gap-2 border-b border-hairline px-1'
        >
          {chart.map((cycle) => {
            const sats = BigInt(cycle.stxOnlyRewardsSats ?? '0');
            const height = Number((sats * 1000n) / most) / 10;
            const open = !cycleComplete(cycle);
            return (
              <div
                key={cycle.cycle}
                className='flex h-full flex-1 flex-col items-center justify-end gap-1'
              >
                <span className='text-[0.7rem] font-bold text-muted tabular-nums'>
                  {(Number(sats) / 1e8).toFixed(2)}
                </span>
                <span
                  className={`block w-full max-w-12 rounded-t-md ${
                    open
                      ? 'bg-[repeating-linear-gradient(135deg,var(--color-amber-warm)_0_5px,var(--color-amber-soft)_5px_9px)]'
                      : 'bg-amber-warm'
                  }`}
                  style={{ height: `${Math.max(2, height * 0.8)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div aria-hidden='true' className='flex gap-2 px-1 pt-1'>
          {chart.map((cycle) => (
            <span
              key={cycle.cycle}
              className='flex-1 text-center text-xs text-muted tabular-nums'
            >
              {cycle.cycle}
            </span>
          ))}
        </div>

        <div className='mt-4 overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-hairline text-right text-xs text-muted'>
                <th scope='col' className='py-2 pr-3 text-left font-bold'>
                  {t('cycles.col.cycle')}
                </th>
                <th scope='col' className='py-2 pr-3 font-bold'>
                  {t('cycles.col.rewards')}
                </th>
                <th scope='col' className='py-2 pr-3 font-bold'>
                  <span className='inline-flex items-center gap-1'>
                    {t('cycles.col.apy')} <InfoTip text={t('cycles.apyHelp')} />
                  </span>
                </th>
                <th scope='col' className='py-2 pr-3 font-bold'>
                  {t('cycles.col.rate')}
                </th>
                <th scope='col' className='py-2 pr-3 font-bold'>
                  {t('cycles.col.staked')}
                </th>
                <th scope='col' className='py-2 pr-3 font-bold'>
                  <span className='inline-flex items-center gap-1'>
                    {t('cycles.col.signers')}{' '}
                    <InfoTip text={t('cycles.signersHelp')} />
                  </span>
                </th>
                <th scope='col' className='py-2 font-bold'>
                  <span className='inline-flex items-center gap-1'>
                    {t('cycles.col.pools')}{' '}
                    <InfoTip text={t('cycles.poolsHelp')} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history.value.cycles.map((cycle) => (
                <Row key={cycle.cycle} cycle={cycle} locale={locale} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Row({ cycle, locale }: { cycle: NetworkCycle; locale: Locale }) {
  const t = translator(locale);
  const number = (value: number | bigint) =>
    value.toLocaleString(t.bundle.intlLocale);
  const rate = cycleRateSatsPer1000Stx(cycle);
  const apy = cycleApyPercent(cycle);
  const usd = cycleRewardsUsd(cycle);
  const status =
    cycle.payouts.length === 0
      ? t('cycles.notPaid')
      : cycleComplete(cycle)
        ? null
        : t('cycles.soFar');
  const rewards =
    cycle.stxOnlyRewardsSats == null
      ? null
      : sbtcCompact(BigInt(cycle.stxOnlyRewardsSats), locale);

  return (
    <tr className='border-b border-hairline text-right tabular-nums last:border-b-0'>
      <td className='py-2 pr-3 text-left font-bold whitespace-nowrap'>
        {cycle.cycle}
        {status && (
          <span className='ml-1.5 text-xs font-normal text-muted'>
            {status}
          </span>
        )}
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        {rewards === null || cycle.payouts.length === 0 ? (
          '—'
        ) : (
          <>
            <strong>{rewards}</strong>
            {usd !== null && (
              <span className='block text-xs text-muted'>
                {usdCompact(usd, locale)}
              </span>
            )}
          </>
        )}
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        {apy === null ? '—' : `${apy.toFixed(2)}%`}
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        {rate === null
          ? '—'
          : t('app.stxOnlyEstimate.satsShort', { sats: number(rate) })}
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        {stxCompact(cycle.stakedUstx, locale)}
      </td>
      <td className='py-2 pr-3'>{cycle.signers}</td>
      <td className='py-2'>{cycle.pools}</td>
    </tr>
  );
}
