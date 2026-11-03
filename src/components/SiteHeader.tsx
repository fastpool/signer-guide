import { useState, type FormEvent } from 'react';
import { translator, type Locale, type MessageKey } from '../lib/i18n';
import { isLookupTarget } from '../lib/principals';
import {
  bondsHref,
  contractsHref,
  groupsHref,
  howToHref,
  statusHref,
  type Route,
} from '../lib/route';
import LocaleSwitch from './LocaleSwitch';
import Mark from './Mark';

const FASTPOOL_URL = 'https://fastpool.org';

/** The site's sections, and which routes count as being inside each. */
type Section = 'pools' | 'contracts' | 'groups' | 'bonds' | 'status' | 'howTo';

const SECTIONS: { id: Section; href: string; label: MessageKey }[] = [
  { id: 'pools', href: '#/', label: 'nav.pools' },
  { id: 'contracts', href: contractsHref(), label: 'nav.contracts' },
  { id: 'groups', href: groupsHref(), label: 'nav.groups' },
  { id: 'bonds', href: bondsHref(), label: 'nav.bonds' },
  { id: 'status', href: statusHref(), label: 'nav.status' },
  { id: 'howTo', href: howToHref(), label: 'nav.howTo' },
];

export function sectionOf(route: Route): Section {
  switch (route.name) {
    case 'contracts':
    case 'contract':
      return 'contracts';
    case 'groups':
    case 'group':
      return 'groups';
    case 'bonds':
      return 'bonds';
    case 'status':
      return 'status';
    case 'howTo':
      return 'howTo';
    default:
      return 'pools';
  }
}

/**
 * The bar across the top of every page.
 *
 * Until this, only the pool list had a way to the other pages, as a row of
 * buttons above its heading; everywhere else the one way out was "← All
 * pools". Getting from a pool to the bonds page meant going home first. Now
 * every section is one tap from anywhere, and the one that is open is marked.
 *
 * The address box is here because "where is my STX" is the question people
 * arrive with, and it should not need finding. It takes what the status page
 * takes — an address or a BNS name — and sends anything else to the empty
 * box rather than looking it up.
 *
 * Below a wide screen the sections fold into a menu, and the box and the language
 * switch go with them.
 */
export default function SiteHeader({
  route,
  locale,
  onLocaleChange,
}: {
  route: Route;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = sectionOf(route);

  const lookUp = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    window.location.hash = statusHref(isLookupTarget(value) ? [value] : []);
    setQuery('');
    setOpen(false);
  };

  const search = (
    <form role='search' onSubmit={lookUp} className='flex'>
      <label className='sr-only' htmlFor='site-search'>
        {t('nav.searchLabel')}
      </label>
      <input
        id='site-search'
        type='search'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('nav.searchPlaceholder')}
        autoComplete='off'
        spellCheck={false}
        className='w-full min-w-0 rounded-full bg-card-raised px-3.5 py-1.5 text-sm text-ink placeholder:text-faint focus:ring-2 focus:ring-grape focus:outline-none xl:w-40 2xl:w-56'
      />
    </form>
  );

  const links = (layout: 'bar' | 'menu') =>
    SECTIONS.map((section) => {
      const on = section.id === current;
      return (
        <a
          key={section.id}
          href={section.href}
          aria-current={on ? 'page' : undefined}
          onClick={() => setOpen(false)}
          className={`rounded-full px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
            on ? 'bg-grape-soft text-grape' : 'text-muted hover:text-ink'
          } ${layout === 'menu' ? 'block' : ''}`}
        >
          {t(section.label)}
        </a>
      );
    });

  return (
    <header className='border-b border-hairline bg-card'>
      <div className='mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6'>
        <a
          href='#/'
          className='flex shrink-0 items-center gap-2 font-extrabold text-ink'
        >
          <Mark className='h-8 w-8 shrink-0 rounded-lg bg-grape p-1.5 text-on-grape' />
          <span>Signer Guide</span>
        </a>
        {/* The byline. A guide listing Fast Pool among forty other pools
            should not wear Fast Pool's glyph as its identity, but it is a
            Fast Pool project, so it says so. */}
        <a
          href={FASTPOOL_URL}
          className='hidden items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-grape 2xl:flex'
        >
          {t('app.by')}
          <img
            src='/fastpool-logo.svg'
            alt=''
            width='16'
            height='16'
            className='rounded bg-fastpool'
          />
          Fast Pool
        </a>

        <nav
          aria-label={t('nav.label')}
          className='ml-2 hidden flex-1 items-center gap-0.5 xl:flex'
        >
          {links('bar')}
        </nav>

        <div className='ml-auto hidden items-center gap-3 xl:flex'>
          {search}
          <LocaleSwitch locale={locale} onChange={onLocaleChange} />
        </div>

        <button
          type='button'
          aria-expanded={open}
          aria-controls='site-menu'
          onClick={() => setOpen((value) => !value)}
          className='ml-auto grid h-9 w-9 place-items-center rounded-xl bg-card-raised text-ink xl:hidden'
        >
          <span className='sr-only'>{t('nav.menu')}</span>
          <svg viewBox='0 0 20 20' className='h-5 w-5' aria-hidden='true'>
            {open ? (
              <path
                d='M5 5l10 10M15 5L5 15'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
              />
            ) : (
              <path
                d='M3 6h14M3 10h14M3 14h14'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
              />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div
          id='site-menu'
          className='mx-auto max-w-6xl space-y-3 border-t border-hairline px-4 py-3 sm:px-6 xl:hidden'
        >
          <nav aria-label={t('nav.label')} className='grid gap-0.5'>
            {links('menu')}
          </nav>
          {search}
          <LocaleSwitch locale={locale} onChange={onLocaleChange} />
        </div>
      )}
    </header>
  );
}
