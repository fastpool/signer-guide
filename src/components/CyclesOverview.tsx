import { sbtcCompact, stxCompact, usdCompact } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import {
  cycleApyPercent,
  cycleComplete,
  cycleRateSatsPer1000Stx,
  cycleRewardSplit,
  cycleRewardsUsd,
  isNetworkHistory,
} from '../lib/network-history';
import { projectCycle, type CycleProjection } from '../lib/cycle-projection';
import { useRemoteJson } from '../lib/remote-json';
import type { NetworkCycle, StxOnlyCalculations } from '../lib/types';
import { InfoTip } from './ui';

/**
 * The network, one row per pox-5 cycle: what was staked, by how many signers
 * and pools, what it paid and what that came to as a yield.
 *
 * A chart of what each cycle paid in sBTC first, because the trend is the
 * question; the table after it for the figures. The cycle still being paid is
 * striped, as the pool page's cycle chart stripes the cycle still filling, and
 * drawn at where it is heading: paid so far plus the refresh's projection of
 * the payouts to come (`projectCycle`). In the table the same estimate follows
 * each figure of that row, after an arrow.
 */
export default function CyclesOverview({
  locale,
  currentCycle,
  calculations,
}: {
  locale: Locale;
  /** The reward cycle running now; a later one has not started. */
  currentCycle: number | null;
  /** The refresh's projection of the payout in progress. */
  calculations: StxOnlyCalculations;
}) {
  const t = translator(locale);
  const history = useRemoteJson('network-history.json', isNetworkHistory);

  if (history.state === 'loading') {
    return <p className='mt-6 text-muted'>{t('cycles.loading')}</p>;
  }
  if (history.state !== 'ready' || history.value.cycles.length === 0) {
    // The payout list below still stands on its own; say nothing loud.
    return null;
  }

  const projections = new Map<number, CycleProjection>();
  for (const cycle of history.value.cycles) {
    const projection = projectCycle(cycle, calculations);
    if (projection) projections.set(cycle.cycle, projection);
  }

  // Cycles with a payout or a projection, oldest first for the chart.
  const shown = history.value.cycles.filter(
    (c) => c.payouts.length > 0 || projections.has(c.cycle),
  );
  // Without the payout prints on file, a bar is the STX-only part alone
  // rather than nothing.
  const chart = [...shown].reverse().map((cycle) => {
    const stxOnly = BigInt(cycle.stxOnlyRewardsSats ?? '0');
    const projection = projections.get(cycle.cycle);
    return {
      cycle,
      estimate: projection !== undefined,
      split: projection ??
        cycleRewardSplit(cycle) ?? {
          stxOnly,
          bond: 0n,
          foundation: 0n,
          total: stxOnly,
        },
    };
  });
  const most = chart.reduce(
    (m, { split }) => (split.total > m ? split.total : m),
    1n,
  );
  // Each part's height as a share of the tallest bar, which fills 80%.
  const height = (sats: bigint) => (Number((sats * 1000n) / most) / 10) * 0.8;

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
          {chart.map(({ cycle, split, estimate }) => {
            const open = estimate || !cycleComplete(cycle);
            const total = split.total;
            return (
              <div
                key={cycle.cycle}
                className='flex h-full flex-1 flex-col items-center justify-end'
              >
                <span className='mb-1 text-[0.7rem] font-bold text-muted tabular-nums'>
                  {estimate && '≈'}
                  {(Number(total) / 1e8).toFixed(2)}
                </span>
                {/* Foundation on top, then bonds, STX-only at the base. */}
                <span
                  className={`block w-full max-w-12 rounded-t-md bg-mint ${open ? 'opacity-60' : ''}`}
                  style={{ height: `${height(split.foundation)}%` }}
                />
                <span
                  className={`block w-full max-w-12 bg-grape ${open ? 'opacity-60' : ''}`}
                  style={{ height: `${height(split.bond)}%` }}
                />
                <span
                  className={`block w-full max-w-12 ${
                    open
                      ? 'bg-[repeating-linear-gradient(135deg,var(--color-amber-warm)_0_5px,var(--color-amber-soft)_5px_9px)]'
                      : 'bg-amber-warm'
                  }`}
                  style={{
                    height: `${Math.max(2, height(split.stxOnly))}%`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div aria-hidden='true' className='flex gap-2 px-1 pt-1'>
          {chart.map(({ cycle }) => (
            <span
              key={cycle.cycle}
              className='flex-1 text-center text-xs text-muted tabular-nums'
            >
              {cycle.cycle}
            </span>
          ))}
        </div>
        <p className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted'>
          <Key className='bg-amber-warm' label={t('cycles.col.rewards')} />
          <Key className='bg-grape' label={t('cycles.col.bond')} />
          <Key className='bg-mint' label={t('cycles.col.foundation')} />
        </p>

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
                  {t('cycles.col.bond')}
                </th>
                <th scope='col' className='py-2 pr-3 font-bold'>
                  {t('cycles.col.foundation')}
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
                  <span className='block font-normal'>
                    {t('cycles.col.stakedSplit')}
                  </span>
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
                <Row
                  key={cycle.cycle}
                  cycle={cycle}
                  projection={projections.get(cycle.cycle) ?? null}
                  started={currentCycle === null || cycle.cycle <= currentCycle}
                  locale={locale}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className='mt-3 text-xs text-muted'>
          {t('cycles.splitNote')}
          {projections.size > 0 && ` ${t('cycles.estimateNote')}`}
        </p>
      </div>
    </section>
  );
}

function Row({
  cycle,
  projection,
  started,
  locale,
}: {
  cycle: NetworkCycle;
  projection: CycleProjection | null;
  started: boolean;
  locale: Locale;
}) {
  const t = translator(locale);
  const number = (value: number | bigint) =>
    value.toLocaleString(t.bundle.intlLocale);
  const rate = cycleRateSatsPer1000Stx(cycle);
  const apy = cycleApyPercent(cycle);
  const usd = cycleRewardsUsd(cycle);
  const split = cycleRewardSplit(cycle);
  const staked = BigInt(cycle.stakedUstx);
  const bonded = BigInt(cycle.bondUstx ?? '0');
  // The column says STX once, so the cell does not.
  const stx = (ustx: bigint) =>
    (stxCompact(ustx, locale) ?? '—').replace(/\s*STX$/, '');
  const status =
    cycle.payouts.length === 0
      ? t(started ? 'cycles.notPaid' : 'cycles.notStarted')
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
        <Figure
          strong
          now={cycle.payouts.length === 0 ? null : rewards}
          then={projection && sbtcCompact(projection.stxOnly, locale)}
          below={!projection && usd !== null ? usdCompact(usd, locale) : null}
        />
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        <Figure
          now={split && sbtcCompact(split.bond, locale)}
          then={projection && sbtcCompact(projection.bond, locale)}
        />
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        <Figure
          now={split && sbtcCompact(split.foundation, locale)}
          then={projection && sbtcCompact(projection.foundation, locale)}
        />
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        <Figure
          now={apy === null ? null : `${apy.toFixed(2)}%`}
          then={
            projection?.apyPercent == null
              ? null
              : `${projection.apyPercent.toFixed(2)}%`
          }
        />
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        <Figure
          now={
            rate === null
              ? null
              : t('app.stxOnlyEstimate.satsShort', { sats: number(rate) })
          }
          then={
            projection &&
            t('app.stxOnlyEstimate.satsShort', {
              sats: number(projection.rateSatsPer1000Stx),
            })
          }
        />
      </td>
      <td className='py-2 pr-3 whitespace-nowrap'>
        <strong>{stx(staked)}</strong>
        <span className='block text-xs text-muted'>
          {bonded > 0n ? `${stx(staked - bonded)} / ${stx(bonded)}` : '—'}
        </span>
      </td>
      <td className='py-2 pr-3'>{cycle.signers}</td>
      <td className='py-2'>{cycle.pools}</td>
    </tr>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className='inline-flex items-center gap-1.5'>
      <span
        aria-hidden='true'
        className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`}
      />
      {label}
    </span>
  );
}

/**
 * A figure, and where it is heading when the cycle is still being paid:
 * "—" then "→ 5.48 sBTC" below it, as paid so far and the estimate.
 */
function Figure({
  now,
  then,
  below = null,
  strong = false,
}: {
  now: string | null | undefined;
  then?: string | null;
  below?: string | null;
  strong?: boolean;
}) {
  return (
    <>
      {now ? strong ? <strong>{now}</strong> : now : '—'}
      {then ? (
        <span className='block text-xs text-muted'>→ {then}</span>
      ) : (
        below && <span className='block text-xs text-muted'>{below}</span>
      )}
    </>
  );
}
