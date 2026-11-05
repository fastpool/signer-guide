import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import type { Route } from '../lib/route';
import { SECTIONS, sectionOf } from './SiteHeader';

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';

/**
 * The foot of every page.
 *
 * Only the pool list used to have one, so every other page simply stopped —
 * the bonds page on a "Generated at" line that looked like part of the last
 * card. This says the things that are true of the whole site: where the
 * sections are, how old the data is, where the code is, and who made it and
 * why that is stated rather than left to be found.
 */
export default function SiteFooter({
  route,
  generatedAt,
  locale,
}: {
  route: Route;
  /** When the data on screen was read from the chain. */
  generatedAt: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const current = sectionOf(route);
  const link = 'font-semibold text-grape underline underline-offset-2';

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
        <p className='max-w-3xl'>
          {t('footer.data', { at: formatLastUpdate(generatedAt, locale) })}
        </p>
        <p className='max-w-3xl'>
          {t.rich('footer.code', {
            link: (
              <a
                className={link}
                href={REPO_URL}
                target='_blank'
                rel='noreferrer'
              >
                {t('app.footer.trustLink')}
              </a>
            ),
          })}
        </p>
        <p className='max-w-3xl'>
          {t.rich('footer.madeBy', {
            link: (
              <a className={link} href={FASTPOOL_URL}>
                Fast Pool
              </a>
            ),
          })}
        </p>
      </div>
    </footer>
  );
}
