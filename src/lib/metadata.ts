import { translator, type Locale } from './i18n';

/**
 * The head of the document, which is the one bit of copy a reader may only
 * ever see in a search result or a shared link.
 */
export function applyLocaleMetadata(locale: Locale): void {
  const t = translator(locale);

  document.documentElement.setAttribute('lang', t.bundle.htmlLang);
  document.title = t('meta.title');

  setMeta('meta[name="description"]', t('meta.description'));
  setMeta('meta[property="og:title"]', t('meta.ogTitle'));
  setMeta('meta[property="og:description"]', t('meta.ogDescription'));
  setMeta('meta[property="og:locale"]', t.bundle.ogLocale);
}

function setMeta(selector: string, value: string): void {
  document.querySelector(selector)?.setAttribute('content', value);
}
