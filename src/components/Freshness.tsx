import { ageParts, freshness } from '../lib/freshness';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';

/**
 * How old the data is, in words, with a dot that turns amber when it is old.
 *
 * `inline` is the quiet line on the pool list. `banner` is the bar under the
 * header on every page, shown only once the data is stale — when every figure
 * on the page is about a moment that has passed, and a reader should know
 * before they act on any of them.
 */
export default function Freshness({
  generatedAt,
  savedCopy,
  locale,
  variant,
  now,
}: {
  generatedAt: string;
  /** The branch did not answer, so this is the copy saved on the device. */
  savedCopy: boolean;
  locale: Locale;
  variant: 'inline' | 'banner';
  now?: number;
}) {
  const t = translator(locale);
  const fresh = freshness(generatedAt, now);
  const at = formatLastUpdate(generatedAt, locale);

  if (variant === 'banner') {
    if (fresh.state !== 'stale') return null;
    const age = ageParts(fresh.ageMs);
    return (
      <div role='status' className='bg-amber-soft'>
        <p className='mx-auto max-w-6xl px-4 py-2 text-sm text-ink sm:px-6'>
          <strong className='text-amber-warm'>
            {t.plural(`freshness.staleTitle.${age.unit}`, age.count)}
          </strong>{' '}
          {t('freshness.staleBody', { at })}
        </p>
      </div>
    );
  }

  const stale = fresh.state === 'stale';
  const ago =
    fresh.state === 'unknown'
      ? null
      : (() => {
          const age = ageParts(fresh.ageMs);
          return t.plural(`freshness.ago.${age.unit}`, age.count);
        })();
  return (
    <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted'>
      <span
        aria-hidden='true'
        className={`h-2 w-2 rounded-full ${stale || savedCopy ? 'bg-amber-warm' : 'bg-mint'}`}
      />
      <span title={at}>
        {ago ? t('freshness.readAgo', { ago }) : t('app.lastUpdate', { at })}
      </span>
      <span aria-hidden='true'>·</span>
      <span>{savedCopy ? t('app.savedCopy') : t('freshness.hourly')}</span>
    </p>
  );
}
