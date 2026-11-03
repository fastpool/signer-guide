import { useState } from 'react';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import { lastRotation, replacedKey } from '../lib/key-rotations';
import {
  acceptedRate,
  answered,
  answeredRate,
  neverAnswered,
  proposals,
  responseSeconds,
} from '../lib/performance';
import {
  medianResponseMs,
  performanceFor,
  useSignerPerformance,
  PERFORMANCE,
} from '../lib/performance-data';
import type { Signer, SignerCyclePerformance } from '../lib/types';
import { Card, InfoTip } from './ui';

/**
 * Whether the signer behind this pool actually answers the miners.
 *
 * The page has always been able to say how much a pool holds and how much of
 * the signer set that buys. It could never say whether the node then does
 * anything, and the two are not the same question at all: one signer here
 * holds 2.7% of the vote, has answered a quarter of what it was asked, and
 * takes half a minute to do it.
 *
 * Three rules the copy is built on, all of them in `lib/performance.ts`:
 *
 * **Answering leads, agreeing follows.** A signer that reads a block and
 * refuses it is doing its job. One that says nothing is not. So the headline
 * counts answers of either kind, and what it said is underneath.
 *
 * **Never answered is not a bad score.** It is an absence, and it gets its own
 * sentence — usually a rotation, sometimes an operator who registered and
 * never started the node. Both are worth a reader knowing before they stake.
 *
 * **The cycle now is a cycle so far.** Every figure here is labelled with the
 * cycle it covers and whether that cycle has finished.
 */
export default function SignerConductSection({
  signer,
  currentCycle,
  locale,
}: {
  signer: Signer;
  /**
   * The cycle the chain is in. When the report on file is for an older one,
   * "nothing on file" is about the report, not the signer, and says so.
   */
  currentCycle?: number;
  locale: Locale;
}) {
  const t = translator(locale);
  const [open, setOpen] = useState(false);
  const row = performanceFor(signer.signerKey);
  const rotation = lastRotation(signer.contractId);
  const history = useSignerPerformance(open ? signer.signerKey : null);

  /*
   * A pool whose key was rotated has a key with no record — the new one has
   * not been seated yet — while the key it replaced is still holding the seat
   * and answering, or not. Saying "nothing on file" and stopping would hide
   * exactly the fortnight a reader most needs to know about, so the old key's
   * row is shown, named as the old key's.
   */
  const abandoned = rotation ? performanceFor(rotation.from) : null;

  return (
    <Card
      id='signing'
      title={t('conduct.title')}
      caption={
        <>
          {t('conduct.caption')} <InfoTip text={t('conduct.intro')} />
        </>
      }
    >
      {rotation && (
        <p className='mb-3 rounded-xl bg-grape-soft/40 p-3 text-sm text-ink'>
          {t('conduct.rotated', {
            when: rotation.observedAt.slice(0, 10),
            cycle: rotation.cycle ?? '—',
          })}
        </p>
      )}

      {row === null && abandoned === null ? (
        /*
         * Two different absences. A report older than the cycle the chain is
         * in has simply not been read again — the page once told readers a
         * signer holding half a percent of the vote had "never held a seat",
         * because the report on file was two months old. Only a current
         * report with no row in it says anything about the signer.
         */
        currentCycle !== undefined && PERFORMANCE.cycle < currentCycle ? (
          <p className='rounded-xl bg-card-raised p-3 text-sm text-muted'>
            <strong className='text-ink'>
              {t('conduct.staleTitle', {
                at: formatLastUpdate(PERFORMANCE.generatedAt, locale),
              })}
            </strong>{' '}
            {t('conduct.staleBody', { cycle: PERFORMANCE.cycle })}
          </p>
        ) : (
          <p className='text-sm text-muted'>{t('conduct.none')}</p>
        )
      ) : (
        <Cycle
          row={row ?? abandoned!}
          forOldKey={row === null}
          locale={locale}
        />
      )}

      {/*
        The history is a request, so it is a button rather than something every
        reader on this page pays for. Fifty-nine cycles of it exist.
      */}
      {(row !== null || abandoned !== null) && (
        <div className='mt-5'>
          <button
            type='button'
            onClick={() => setOpen((was) => !was)}
            className='text-sm font-semibold text-grape underline underline-offset-2'
            aria-expanded={open}
          >
            {open ? t('conduct.hideHistory') : t('conduct.showHistory')}
          </button>

          {open && (
            <div className='mt-3'>
              {history.state === 'loading' && (
                <p className='text-sm text-muted'>{t('conduct.loading')}</p>
              )}
              {history.state === 'missing' && (
                <p className='text-sm text-muted'>{t('conduct.noHistory')}</p>
              )}
              {history.state === 'failed' && (
                <p className='text-sm text-muted'>{t('conduct.failed')}</p>
              )}
              {history.state === 'ready' && (
                <History rows={history.value.cycles} locale={locale} />
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** One cycle in full: what it was asked, what it answered, how fast. */
function Cycle({
  row,
  forOldKey,
  locale,
}: {
  row: SignerCyclePerformance;
  forOldKey: boolean;
  locale: Locale;
}) {
  const t = translator(locale);
  const rate = answeredRate(row);
  const seconds = responseSeconds(row);
  const middle = medianResponseMs();
  const agreed = acceptedRate(row);
  const label = t(row.final ? 'conduct.cycleClosed' : 'conduct.cycleOpen', {
    cycle: row.cycle,
  });

  if (neverAnswered(row)) {
    return (
      <div>
        <p className='text-2xl font-extrabold text-ink'>
          {t('conduct.neverAnswered')}
        </p>
        <p className='mt-1 text-sm text-muted'>
          {t('conduct.neverAnsweredNote', {
            proposals: proposals(row).toLocaleString(t.bundle.intlLocale),
            cycle: row.cycle,
          })}
        </p>
        {forOldKey && (
          <p className='mt-2 text-xs text-muted'>{t('conduct.oldKeyNote')}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className='text-3xl font-extrabold text-ink'>
        {rate === null ? t('conduct.unknown') : `${(rate * 100).toFixed(2)}%`}
      </p>
      <p className='mt-1 text-sm text-muted'>
        {t('conduct.answeredNote', {
          answered: answered(row).toLocaleString(t.bundle.intlLocale),
          proposals: proposals(row).toLocaleString(t.bundle.intlLocale),
          label,
        })}
      </p>

      <dl className='mt-4 border-t border-hairline pt-3 text-sm'>
        <div className='flex flex-wrap items-baseline justify-between gap-3'>
          <dt className='text-muted'>{t('conduct.response')}</dt>
          <dd className='font-semibold text-ink'>
            {seconds === null
              ? t('conduct.unknown')
              : t('conduct.seconds', { seconds: seconds.toFixed(1) })}
          </dd>
        </div>
        {middle !== null && (
          <p className='mt-1 text-xs text-muted'>
            {t('conduct.responseMiddle', {
              seconds: (middle / 1000).toFixed(1),
              cycle: PERFORMANCE.cycle,
            })}
          </p>
        )}
        <div className='mt-3 flex flex-wrap items-baseline justify-between gap-3'>
          <dt className='text-muted'>{t('conduct.agreed')}</dt>
          <dd className='font-semibold text-ink'>
            {agreed === null
              ? t('conduct.unknown')
              : `${(agreed * 100).toFixed(1)}%`}
          </dd>
        </div>
        <p className='mt-1 text-xs text-muted'>{t('conduct.agreedNote')}</p>
      </dl>

      {forOldKey && (
        <p className='mt-3 text-xs text-muted'>{t('conduct.oldKeyNote')}</p>
      )}
    </div>
  );
}

/** Every cycle on file, newest first. */
function History({
  rows,
  locale,
}: {
  rows: SignerCyclePerformance[];
  locale: Locale;
}) {
  const t = translator(locale);
  if (rows.length === 0) {
    return <p className='text-sm text-muted'>{t('conduct.noHistory')}</p>;
  }

  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-left text-sm'>
        <thead className='text-xs text-muted'>
          <tr>
            <th className='py-1 pr-3 font-semibold'>{t('conduct.th.cycle')}</th>
            <th className='py-1 pr-3 font-semibold'>
              {t('conduct.th.answered')}
            </th>
            <th className='py-1 pr-3 font-semibold'>
              {t('conduct.th.response')}
            </th>
            <th className='py-1 font-semibold'>{t('conduct.th.weight')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = answeredRate(row);
            const seconds = responseSeconds(row);
            return (
              <tr key={row.cycle} className='border-t border-hairline'>
                <td className='py-1.5 pr-3 font-semibold text-ink'>
                  {row.cycle}
                  {!row.final && (
                    <span className='ml-1 text-xs font-normal text-muted'>
                      {t('conduct.soFar')}
                    </span>
                  )}
                </td>
                <td className='py-1.5 pr-3'>
                  {rate === null ? '—' : `${(rate * 100).toFixed(1)}%`}
                </td>
                <td className='py-1.5 pr-3'>
                  {seconds === null ? '—' : `${seconds.toFixed(1)}s`}
                </td>
                <td className='py-1.5'>{row.weightPercent.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className='mt-2 text-xs text-muted'>{t('conduct.source')}</p>
    </div>
  );
}

/** Exported for the node page, which asks about a key rather than a pool. */
export { replacedKey };
