import { createElement, Fragment, type ReactNode } from 'react';
import {
  BUNDLES,
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type LocaleBundle,
  type MessageKey,
  type PluralKey,
} from '../locales';

export type { Locale, LocaleBundle, MessageKey };
export { LOCALES };

export type Values = Record<string, string | number>;

/** `{name}`, the only markup a message is allowed to carry. */
const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/;
const PLACEHOLDER_ALL = /\{([a-zA-Z0-9_]+)\}/g;
const PLACEHOLDER_SPLIT = /(\{[a-zA-Z0-9_]+\})/g;

export interface Translator {
  /** The message for `key`, with `{name}` placeholders filled in. */
  (key: MessageKey, values?: Values): string;
  locale: Locale;
  bundle: LocaleBundle;
  /**
   * Same, but placeholders take elements — so a sentence with a link or a bold
   * number inside it stays one sentence in the language file, and the
   * translator decides where in it the element goes.
   */
  rich(key: MessageKey, values: Record<string, ReactNode>): ReactNode;
  /** Picks `<key>.one` or `<key>.other`, and passes `count` through. */
  plural(key: PluralKey, count: number, values?: Values): string;
}

function lookup(bundle: LocaleBundle, key: string): string {
  const messages = bundle.messages as Record<string, string | undefined>;
  const fallback = BUNDLES[DEFAULT_LOCALE].messages as Record<string, string>;
  // A key with no translation reads better in English than as a raw key, and
  // typing makes this unreachable for the languages that ship with the app.
  return messages[key] ?? fallback[key] ?? key;
}

export function interpolate(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER_ALL, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

function interpolateNodes(
  template: string,
  values: Record<string, ReactNode>,
): ReactNode {
  const parts = template.split(PLACEHOLDER_SPLIT).map((part, index) => {
    const match = PLACEHOLDER.exec(part);
    if (!match || match[0] !== part) return part;
    const value = values[match[1]];
    return value === undefined
      ? part
      : createElement(Fragment, { key: index }, value);
  });
  return createElement(Fragment, null, ...parts);
}

const CACHE = new Map<Locale, Translator>();

/**
 * The one way to get text on the screen.
 *
 * Cached per language, so passing `t` down as a prop never re-renders anything
 * that would not have re-rendered anyway.
 */
export function translator(locale: Locale): Translator {
  const cached = CACHE.get(locale);
  if (cached) return cached;

  const bundle = BUNDLES[locale];
  const t = ((key: MessageKey, values?: Values) =>
    interpolate(lookup(bundle, key), values)) as Translator;

  t.locale = locale;
  t.bundle = bundle;
  t.rich = (key, values) => interpolateNodes(lookup(bundle, key), values);
  t.plural = (key, count, values) =>
    interpolate(lookup(bundle, `${key}.${count === 1 ? 'one' : 'other'}`), {
      count,
      ...values,
    });

  CACHE.set(locale, t);
  return t;
}

export function isLocale(value: string): value is Locale {
  return value in BUNDLES;
}

export function detectLocale(): Locale {
  // `navigator` exists but has no `language` in some non-browser runtimes.
  const tag =
    typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  const base = tag.toLowerCase().split('-')[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

/** The language's own name for itself — never translated. */
export function languageName(locale: Locale): string {
  return BUNDLES[locale].name;
}

export function formatLastUpdate(generatedAt: string, locale: Locale): string {
  const at = new Date(generatedAt);
  const day = at.toLocaleDateString(BUNDLES[locale].intlLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}
