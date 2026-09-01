import type { ReactNode } from 'react';
import type { Locale } from '../lib/i18n';
import type { UpdateState } from '../lib/service-worker';
import UpdateBanner from './UpdateBanner';
import WalletBrowserBanner from './WalletBrowserBanner';

/**
 * What is on every page whichever page it is.
 *
 * Two bars, and neither belongs to a route: the way into a wallet from a phone
 * browser at the top, and the offer to reload a new build at the bottom. Both
 * are true of the site rather than of the pool list or the group index, so
 * they are rendered once around whatever is showing.
 *
 * It exists because they were not. `UpdateBanner` was written into all nine
 * route branches by hand, and adding a second bar beside it meant nine more
 * copies of a line — which is the point at which a thing that is on every page
 * should stop being pasted onto every page. A tenth route now gets both for
 * nothing, and neither can be forgotten on one of them.
 */
export default function Chrome({
  update,
  locale,
  children,
}: {
  update: UpdateState;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <>
      <WalletBrowserBanner locale={locale} />
      {children}
      <UpdateBanner update={update} locale={locale} />
    </>
  );
}
