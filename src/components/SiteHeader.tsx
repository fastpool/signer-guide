import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { translator, type Locale, type MessageKey } from '../lib/i18n';
import { isLookupTarget } from '../lib/principals';
import {
  bondsHref,
  contractsHref,
  groupHref,
  groupsHref,
  howToHref,
  signerHref,
  statusHref,
  type Route,
} from '../lib/route';
import { allGroups, groupsForContract } from '../lib/signer-groups';
import type { Signer } from '../lib/types';
import LocaleSwitch from './LocaleSwitch';
import Mark from './Mark';

const FASTPOOL_URL = 'https://fastpool.org';

/** The site's sections, and which routes count as being inside each. */
type Section = 'pools' | 'contracts' | 'groups' | 'bonds' | 'status' | 'howTo';

/** Every section, flat — the footer lists them all. */
export const SECTIONS: { id: Section; href: string; label: MessageKey }[] = [
  { id: 'pools', href: '#/', label: 'nav.pools' },
  { id: 'contracts', href: contractsHref(), label: 'nav.contracts' },
  { id: 'bonds', href: bondsHref(), label: 'nav.bonds' },
  { id: 'howTo', href: howToHref(), label: 'nav.howTo' },
  { id: 'groups', href: groupsHref(), label: 'nav.groups' },
  { id: 'status', href: statusHref(), label: 'nav.status' },
];

/**
 * What the bar shows: the three places people go to compare, then the two
 * pages that explain, folded under "Learn". "Check an address" is not here —
 * the box beside the bar is that page's way in.
 */
const BAR: Section[] = ['pools', 'contracts', 'bonds'];
const LEARN: Section[] = ['howTo', 'groups'];
const section = (id: Section) => SECTIONS.find((entry) => entry.id === id)!;

/** How long typing has to pause before the box looks up what it holds. */
const TYPING_PAUSE_MS = 700;

/**
 * Where the box sends what was typed into it: a pool's own page for a signer
 * manager the guide knows, the address page for any other address or name,
 * and the empty address page for anything else.
 *
 * The address half is case-folded, as `isPrincipal` does — people paste
 * addresses lower-cased out of explorers.
 */
export function searchTarget(value: string, signers: Signer[]): string {
  const [address, ...rest] = value.split('.');
  const folded = [address.toUpperCase(), ...rest].join('.');
  const pool = signers.find((signer) => signer.contractId === folded);
  if (pool) return signerHref(pool.contractId);
  return statusHref(isLookupTarget(value) ? [value] : []);
}

/** One line of the box's suggestions: a pool, or the group behind some. */
export interface Suggestion {
  href: string;
  label: string;
  /** The contract id for a pool; nothing for a group. */
  detail: string | null;
  kind: 'pool' | 'group';
}

const MAX_SUGGESTIONS = 6;

/**
 * Pools and groups whose name holds what was typed — pools first, and a name
 * that starts with it before one that merely contains it.
 *
 * This is the pool list's old filter box moved up here, so there is one box
 * to type into: a name finds a pool, an address finds a stake.
 */
export function suggestionsFor(value: string, signers: Signer[]): Suggestion[] {
  const needle = value.trim().toLowerCase();
  if (needle.length < 2) return [];
  const rank = (text: string) => {
    const at = text.toLowerCase().indexOf(needle);
    return at < 0 ? -1 : at === 0 ? 0 : 1;
  };
  const pools = signers
    .map((signer) => ({
      signer,
      score: Math.min(
        ...[
          rank(signer.displayName),
          rank(signer.contractId.split('.')[1] ?? ''),
          // The operator's name finds its pools, as the list's filter did.
          ...groupsForContract(signer.contractId, signer.signerKey).map(
            (group) => (rank(group.name) < 0 ? -1 : 1),
          ),
        ].map((r) => (r < 0 ? Infinity : r)),
      ),
    }))
    .filter((entry) => entry.score !== Infinity)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.signer.displayName.localeCompare(b.signer.displayName),
    )
    .map(({ signer }): Suggestion => ({
      href: signerHref(signer.contractId),
      label: signer.displayName,
      detail: signer.contractId.split('.')[1] ?? null,
      kind: 'pool',
    }));
  const groups = allGroups()
    .filter((group) => rank(group.name) >= 0)
    .map((group): Suggestion => ({
      href: groupHref(group.id),
      label: group.name,
      detail: null,
      kind: 'group',
    }));
  // A group or two always shows, so an operator's page is reachable by name
  // even when its pools fill the list.
  const shownGroups = groups.slice(0, 2);
  return [
    ...pools.slice(0, MAX_SUGGESTIONS - shownGroups.length),
    ...shownGroups,
  ];
}

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
 * arrive with, and it should not need finding — it is the address page's only
 * way in from the bar. It takes what that page takes — an address or a BNS
 * name — and looks it up as soon as it is pasted, or once typing pauses. A
 * signer manager the guide knows opens that pool's page instead, and anything
 * else sent with Enter lands on the empty box, which takes a whole list.
 * Anything else typed is a name: pools and groups that match are offered
 * underneath, which is what the pool list's own filter box used to do.
 *
 * Below a wide screen the sections fold into a menu and the box goes with
 * them; the language switch moves to the footer.
 */
export default function SiteHeader({
  route,
  signers,
  locale,
  onLocaleChange,
}: {
  route: Route;
  /** The pools the guide knows, so a signer manager typed in opens its page. */
  signers: Signer[];
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const [open, setOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** The hash the box last sent the page to, so it knows when it was left. */
  const sentTo = useRef<string | null>(null);
  const learnRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const current = sectionOf(route);
  const trimmed = query.trim();
  const suggestions =
    focused && !isLookupTarget(trimmed) ? suggestionsFor(trimmed, signers) : [];

  const go = (value: string) => {
    const hash = searchTarget(value, signers);
    if (hash === window.location.hash) return;
    // A look-up started by the box replaces the one it started before, so
    // typing a name out does not leave a trail of half-names behind Back.
    if (sentTo.current !== null && sentTo.current === window.location.hash) {
      window.location.replace(hash);
    } else {
      window.location.hash = hash;
    }
    sentTo.current = hash;
    setOpen(false);
  };

  const pick = (suggestion: Suggestion) => {
    window.location.hash = suggestion.href;
    setQuery('');
    setHighlight(-1);
    sentTo.current = null;
    setOpen(false);
  };

  const lookUp = (event: FormEvent) => {
    event.preventDefault();
    // A name with matches opens the one picked, or the first.
    if (suggestions.length > 0) {
      pick(suggestions[Math.max(0, highlight)]);
      return;
    }
    go(trimmed);
    setQuery('');
    sentTo.current = null;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => (index <= 0 ? suggestions.length : index) - 1);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };

  // Look up as soon as the box holds something that can be looked up, once
  // typing pauses — no Enter needed.
  useEffect(() => {
    const value = query.trim();
    if (value === '' || !isLookupTarget(value)) return;
    const timer = window.setTimeout(() => go(value), TYPING_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Leaving the page the box sent somebody to empties the box.
  useEffect(() => {
    if (sentTo.current !== null && sentTo.current !== window.location.hash) {
      sentTo.current = null;
      setQuery('');
    }
    setLearnOpen(false);
  }, [route]);

  // The Learn menu closes on a click elsewhere or on Escape.
  useEffect(() => {
    if (!learnOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!learnRef.current?.contains(event.target as Node)) {
        setLearnOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLearnOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [learnOpen]);

  // A paste is a finished address, not one being typed: look it up now.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const value = event.clipboardData.getData('text').trim();
    if (isLookupTarget(value)) {
      event.preventDefault();
      setQuery(value);
      go(value);
    }
  };

  const search = (
    <form role='search' onSubmit={lookUp} className='relative flex'>
      <label className='sr-only' htmlFor='site-search'>
        {t('nav.searchLabel')}
      </label>
      <input
        id='site-search'
        type='search'
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(-1);
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        role='combobox'
        aria-expanded={suggestions.length > 0}
        aria-controls='site-search-suggestions'
        aria-autocomplete='list'
        aria-activedescendant={
          highlight >= 0 ? `site-search-option-${highlight}` : undefined
        }
        placeholder={t('nav.searchPlaceholder')}
        autoComplete='off'
        spellCheck={false}
        className={`w-full min-w-0 rounded-full bg-card-raised px-3.5 py-1.5 text-sm text-ink placeholder:text-faint focus:ring-2 focus:ring-grape focus:outline-none xl:w-48 2xl:w-64 ${
          current === 'status' ? 'ring-2 ring-grape-soft' : ''
        }`}
      />
      {suggestions.length > 0 && (
        <ul
          id='site-search-suggestions'
          role='listbox'
          className='absolute top-full right-0 left-0 z-30 mt-1 min-w-64 overflow-hidden rounded-2xl border border-hairline bg-card p-1 shadow-lift'
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.href}
              id={`site-search-option-${index}`}
              role='option'
              aria-selected={index === highlight}
              // Before the input's blur, which would take the list away.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(suggestion);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={`cursor-pointer rounded-xl px-3 py-2 text-sm ${
                index === highlight ? 'bg-grape-soft' : ''
              }`}
            >
              <span className='block truncate font-semibold text-ink'>
                {suggestion.label}
              </span>
              <span className='block truncate text-xs text-muted'>
                {suggestion.kind === 'group'
                  ? t('nav.suggestGroup')
                  : suggestion.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );

  const pill = (on: boolean) =>
    `rounded-full px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
      on ? 'bg-grape-soft text-grape' : 'text-muted hover:text-ink'
    }`;

  const link = (id: Section, extra = '') => {
    const entry = section(id);
    const on = id === current;
    return (
      <a
        key={id}
        href={entry.href}
        aria-current={on ? 'page' : undefined}
        onClick={() => {
          setOpen(false);
          setLearnOpen(false);
        }}
        className={`${pill(on)} ${extra}`}
      >
        {t(entry.label)}
      </a>
    );
  };

  const inLearn = LEARN.includes(current);

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
          {BAR.map((id) => link(id))}
          <div ref={learnRef} className='relative'>
            <button
              type='button'
              aria-expanded={learnOpen}
              aria-controls='learn-menu'
              onClick={() => setLearnOpen((value) => !value)}
              className={`${pill(inLearn)} inline-flex items-center gap-1`}
            >
              {t('nav.learn')}
              <svg viewBox='0 0 12 12' className='h-3 w-3' aria-hidden='true'>
                <path
                  d='M3 4.5l3 3 3-3'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
              </svg>
            </button>
            {learnOpen && (
              <div
                id='learn-menu'
                className='absolute top-full left-0 z-20 mt-1 grid min-w-48 gap-0.5 rounded-2xl border border-hairline bg-card p-1.5 shadow-lift'
              >
                {LEARN.map((id) => link(id, 'block'))}
              </div>
            )}
          </div>
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
            {BAR.map((id) => link(id, 'block'))}
            <p className='mt-2 px-2.5 text-xs font-bold tracking-wide text-faint uppercase'>
              {t('nav.learn')}
            </p>
            {LEARN.map((id) => link(id, 'block'))}
          </nav>
          {search}
        </div>
      )}
    </header>
  );
}
