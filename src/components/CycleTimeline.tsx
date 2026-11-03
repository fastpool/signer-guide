import { usdCompact } from '../lib/amounts';
import {
  countdownParts,
  cycleTiming,
  type CycleTiming,
} from '../lib/cycle-timing';
import { translator, type Locale, type Translator } from '../lib/i18n';
import { pricesFrom } from '../lib/prices';
import { stxOnlyHistoryHref } from '../lib/route';
import type { StxOnlyCalculations } from '../lib/types';

/**
 * Where the reward cycle is, and the one deadline in it a reader can miss.
 *
 * The "Next payout" tile counts to the next sBTC payout, which arrives
 * whatever anybody does. This counts to the thing that does depend on the
 * reader: the prepare phase, when pox-5 fixes who is in the next cycle. Stake
 * before it and the next cycle counts you; after it, the one after that.
 *
 * The prices sit at the end of the same strip, because they are the other
 * thing on this page that is "as of the last refresh".
 */
export default function CycleTimeline({
  calculations,
  locale,
}: {
  calculations: StxOnlyCalculations;
  locale: Locale;
}) {
  const t = translator(locale);
  const timing = cycleTiming(calculations);
  const prices = pricesFrom(calculations);
  if (!timing && prices.stxPriceUsd === null) return null;

  return (
    <section
      aria-label={t('timing.label')}
      className='mt-3 rounded-2xl bg-card p-4 shadow-lift'
    >
      <div className='flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:items-start sm:justify-between'>
        {timing && <Timing timing={timing} t={t} />}
        {prices.stxPriceUsd !== null && prices.btcPriceUsd !== null && (
          <p
            className='text-xs whitespace-nowrap text-muted tabular-nums'
            title={t('timing.pricesHelp')}
          >
            {t('timing.prices', {
              stx: usdCompact(prices.stxPriceUsd, locale),
              btc: usdCompact(prices.btcPriceUsd, locale),
            })}
          </p>
        )}
      </div>
    </section>
  );
}

function Timing({ timing, t }: { timing: CycleTiming; t: Translator }) {
  const date = (value: Date) =>
    value.toLocaleString(t.bundle.intlLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const day = (value: Date) =>
    value.toLocaleDateString(t.bundle.intlLocale, {
      day: 'numeric',
      month: 'short',
    });
  const block = (height: number) => height.toLocaleString(t.bundle.intlLocale);

  const length = timing.nextCycleStartHeight - timing.cycleStartHeight;
  const done = timing.burnHeight - timing.cycleStartHeight;
  const percent = Math.max(0, Math.min(100, (done / length) * 100));
  const preparePercent =
    ((timing.prepareStartHeight - timing.cycleStartHeight) / length) * 100;

  // The cycle a stake made now first counts in.
  const joins = timing.inPrepare ? timing.cycle + 2 : timing.cycle + 1;
  const deadline = timing.inPrepare
    ? timing.nextCycleStartsAt
    : timing.prepareStartsAt;
  const left = countdownParts(deadline);

  return (
    <div className='min-w-0 flex-1'>
      <p className='text-sm'>
        <strong>
          {timing.inPrepare
            ? t('timing.inPrepare', {
                next: timing.cycle + 1,
                joins,
              })
            : t('timing.closes', {
                next: timing.cycle + 1,
                countdown: left ? countdown(left, t) : t('timing.soon'),
              })}
        </strong>{' '}
        <span className='text-muted'>
          {timing.inPrepare
            ? t('timing.inPrepareWhen', {
                countdown: left ? countdown(left, t) : t('timing.soon'),
                date: date(timing.nextCycleStartsAt),
              })
            : t('timing.closesWhen', {
                date: date(timing.prepareStartsAt),
                block: block(timing.prepareStartHeight),
              })}
        </span>
      </p>

      <div
        className='relative mt-2 h-1.5 overflow-hidden rounded-full bg-trough'
        role='img'
        aria-label={t('timing.progress', {
          cycle: timing.cycle,
          percent: Math.round(percent),
        })}
      >
        <span
          className='absolute inset-y-0 left-0 rounded-full bg-grape'
          style={{ width: `${percent}%` }}
        />
        <span
          className='absolute inset-y-0 right-0 bg-amber-warm/40'
          style={{ left: `${preparePercent}%` }}
        />
      </div>
      <p className='mt-1 flex justify-between gap-2 text-xs text-muted tabular-nums'>
        <span>
          {t('timing.started', {
            cycle: timing.cycle,
            date: day(timing.cycleStartedAt),
          })}
        </span>
        <a
          href={stxOnlyHistoryHref()}
          className='font-bold whitespace-nowrap text-grape'
        >
          {t('timing.allCycles')}
        </a>
        <span>
          {t('timing.next', {
            cycle: timing.cycle + 1,
            date: day(timing.nextCycleStartsAt),
            block: block(timing.nextCycleStartHeight),
          })}
        </span>
      </p>
    </div>
  );
}

/** "1d 17h", "5h 10m", "40m". */
export function countdown(
  parts: { days: number; hours: number; minutes: number },
  t: Translator,
): string {
  if (parts.days > 0) {
    return t('timing.dh', { d: parts.days, h: parts.hours });
  }
  if (parts.hours > 0) {
    return t('timing.hm', { h: parts.hours, m: parts.minutes });
  }
  return t('timing.m', { m: Math.max(1, parts.minutes) });
}
