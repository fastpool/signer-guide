import { translator, type Locale } from '../lib/i18n';
import type { UpdateState } from '../lib/service-worker';

/**
 * Offered, not imposed. It sits at the bottom out of the way of the page and
 * waits: an installed app that reloads itself mid-transaction is worse than
 * one running last week's build for another minute.
 */
export default function UpdateBanner({
  update,
  locale,
}: {
  update: UpdateState;
  locale: Locale;
}) {
  const t = translator(locale);
  if (!update.ready) return null;

  return (
    <div
      role='status'
      className='fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-grape px-5 py-3 text-sm text-on-grape shadow-[0_-1px_6px_rgba(44,42,53,0.18)]'
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <span>{t('app.updateReady')}</span>
      <button
        type='button'
        onClick={update.apply}
        className='rounded-full bg-card px-4 py-1.5 font-semibold text-grape'
      >
        {t('app.updateApply')}
      </button>
    </div>
  );
}
