import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import type { Route } from '../lib/route';
import LocaleSwitch from './LocaleSwitch';
import { SECTIONS, sectionOf } from './SiteHeader';

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';

/**
 * The foot of every page: every section, how old the data is, where the code
 * is, and who made it. Two short lines with a mark each rather than two
 * paragraphs — the code is the argument, and the link to it says enough.
 *
 * On a phone the language switch lives here rather than in the menu, so the
 * menu holds only places to go.
 */
export default function SiteFooter({
  route,
  generatedAt,
  locale,
  onLocaleChange,
}: {
  route: Route;
  /** When the data on screen was read from the chain. */
  generatedAt: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const current = sectionOf(route);

  return (
    <footer className='mt-4 border-t border-hairline bg-card'>
      <div className='mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm text-muted sm:px-6'>
        <nav aria-label={t('footer.sections')}>
          <ul className='flex flex-wrap gap-x-5 gap-y-2'>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={section.href}
                  aria-current={section.id === current ? 'page' : undefined}
                  className={`font-semibold hover:text-grape ${
                    section.id === current ? 'text-ink' : ''
                  }`}
                >
                  {t(section.label)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p>{t('footer.data', { at: formatLastUpdate(generatedAt, locale) })}</p>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-3'>
          <a
            href={REPO_URL}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-2 font-semibold hover:text-grape'
          >
            <svg
              viewBox='0 0 16 16'
              className='h-5 w-5'
              fill='currentColor'
              aria-hidden='true'
            >
              <path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z' />
            </svg>
            {t('footer.code')}
          </a>
          <a
            href={FASTPOOL_URL}
            className='inline-flex items-center gap-2 hover:text-grape'
          >
            <img
              src='/fastpool-logo.svg'
              alt=''
              width='20'
              height='20'
              className='rounded bg-fastpool'
            />
            <span>
              <span className='font-semibold'>{t('footer.madeBy')}</span>
              {' · '}
              {t('footer.disclosure')}
            </span>
          </a>
          <div className='xl:hidden'>
            <LocaleSwitch locale={locale} onChange={onLocaleChange} />
          </div>
        </div>
      </div>
    </footer>
  );
}
