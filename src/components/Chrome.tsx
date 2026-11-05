import type { ReactNode } from 'react';
import type { Locale } from '../lib/i18n';
import type { Route } from '../lib/route';
import type { UpdateState } from '../lib/service-worker';
import Freshness from './Freshness';
import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';
import UpdateBanner from './UpdateBanner';
import WalletBrowserBanner from './WalletBrowserBanner';

/**
 * What is on every page whichever page it is.
 *
 * The header with every section in it, the footer, the warning that the data has gone
 * stale, the way into a wallet from a phone browser, and the offer to reload
 * a new build. All of them are true of the site rather than of any one
 * route, so they are rendered once around whatever is showing — a tenth route
 * gets every one of them for nothing, and none can be forgotten on it.
 */
export default function Chrome({
  route,
  update,
  locale,
  onLocaleChange,
  generatedAt,
  savedCopy,
  children,
}: {
  route: Route;
  update: UpdateState;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  /** When the data on screen was read from the chain. */
  generatedAt: string;
  savedCopy: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <WalletBrowserBanner locale={locale} />
      <SiteHeader
        route={route}
        locale={locale}
        onLocaleChange={onLocaleChange}
      />
      <Freshness
        generatedAt={generatedAt}
        savedCopy={savedCopy}
        locale={locale}
        variant='banner'
      />
      {children}
      <SiteFooter route={route} generatedAt={generatedAt} locale={locale} />
      <UpdateBanner update={update} locale={locale} />
    </>
  );
}
