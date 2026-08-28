import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { LOCALES, type Locale } from '@guide/lib/i18n';
import { useSettings } from '../settings';
import { en, type MessageKey, type Messages } from './en';
import { ko } from './ko';

/**
 * The phone app's own catalogue.
 *
 * Same shape as the guide's and a deliberately separate object — see the note
 * at the top of `en.ts`. Anything both apps say is reached through the shared
 * helpers by passing `locale`: amounts through `@guide/lib/amounts`, contract
 * copy through `@guide/lib/profile-i18n`. So a screen holds one translator,
 * not two.
 */
const BUNDLES = { en, ko };

export type { Locale, MessageKey };
export { LOCALES };

export type Values = Record<string, string | number>;

export interface Translate {
  (key: MessageKey, values?: Values): string;
  locale: Locale;
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

export function interpolate(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

const CACHE = new Map<Locale, Translate>();

export function translate(locale: Locale): Translate {
  const cached = CACHE.get(locale);
  if (cached) return cached;

  const messages = BUNDLES[locale].messages as Messages;
  const fallback = en.messages;
  const t = ((key: MessageKey, values?: Values) =>
    // A key with no translation reads better in English than as a raw key,
    // and the typing makes this unreachable for the languages that ship.
    interpolate(messages[key] ?? fallback[key] ?? key, values)) as Translate;
  t.locale = locale;

  CACHE.set(locale, t);
  return t;
}

/** The language's own name for itself — never translated. */
export function languageName(locale: Locale): string {
  return BUNDLES[locale].name;
}

const TranslateContext = createContext<Translate>(translate('en'));

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { locale } = useSettings();
  const t = useMemo(() => translate(locale), [locale]);
  return (
    <TranslateContext.Provider value={t}>{children}</TranslateContext.Provider>
  );
}

export function useT(): Translate {
  return useContext(TranslateContext);
}
