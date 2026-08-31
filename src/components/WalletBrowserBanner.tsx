import { useEffect, useState } from 'react';
import { translator, type Locale } from '../lib/i18n';
import {
  BROWSER_WALLETS,
  BROWSER_WALLET_NAMES,
  shouldOfferWalletBrowser,
  walletBrowserUrl,
} from '../lib/wallet-browser';

/**
 * On a phone, the way into a wallet — offered once, at the top, and closable.
 *
 * A reader who opens this guide in Safari or Chrome on a phone has no route to
 * a wallet at all: there is no extension to inject a provider, and
 * WalletConnect is switched off (see `lib/wallet-connect`). Leather and Xverse
 * each have a browser of their own, and inside one the page reaches the wallet
 * the ordinary way. Until now that was said only inside the stake dialog,
 * which is several taps past the point where somebody has decided this site is
 * no use to them on a phone.
 *
 * **Not shown inside a wallet's own browser.** `shouldOfferWalletBrowser`
 * decides, and the test it makes is whether a provider has been injected
 * rather than what the user-agent claims: offering "open in Xverse" from
 * inside Xverse is a loop with a worse ending, and a wallet browser that does
 * not announce itself in its user-agent would fall for a sniff. It is a fact
 * about the page rather than a guess about the app.
 *
 * Read after mount, not during render, for the same reason the dialog does it:
 * a wallet injects while the page is still loading, and asking too early sees
 * a page with no wallet in it and offers the banner to somebody already inside
 * one. One frame late is the price of not being wrong.
 *
 * Closable, and it stays closed for the session only. Nothing is written to
 * storage for it: a banner somebody dismissed on a phone they have since
 * installed a wallet on should come back, and a preference that outlives the
 * reason for it is worse than one asked twice.
 */
export default function WalletBrowserBanner({ locale }: { locale: Locale }) {
  const [offer, setOffer] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    setOffer(
      typeof window === 'undefined' ? false : shouldOfferWalletBrowser(window),
    );
  }, []);

  if (!offer || closed) return null;
  return (
    <WalletBrowserBar
      locale={locale}
      here={typeof location === 'undefined' ? '' : location.href}
      onClose={() => setClosed(true)}
    />
  );
}

/**
 * The bar itself, apart from the decision to show it.
 *
 * Split so that it can be rendered on its own: the decision is made in an
 * effect, and effects do not run in the static render the rest of this site's
 * component tests use. The decision has tests of its own in
 * `lib/wallet-browser.test.ts`, where it belongs — this half is a row of two
 * links and the only thing that can be wrong with it is the links.
 */
export function WalletBrowserBar({
  locale,
  here,
  onClose,
}: {
  locale: Locale;
  /** The page to carry across, hash and all. */
  here: string;
  onClose: () => void;
}) {
  const t = translator(locale);

  return (
    <div
      role='region'
      aria-label={t('walletBanner.label')}
      className='flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-grape-soft px-4 py-2.5 text-sm'
      style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
    >
      <span className='font-semibold text-grape'>{t('walletBanner.title')}</span>

      {BROWSER_WALLETS.map((id) => {
        const link = walletBrowserUrl(id, here);
        if (link === null) return null;
        return (
          /*
           * A real link, not a button with an onClick. iOS refuses a
           * custom-scheme navigation that did not come from a gesture, and a
           * gesture on an anchor is the one it always accepts — which is what
           * `leather://` needs.
           */
          <a
            key={id}
            href={link}
            className='rounded-full bg-card px-3 py-1 font-semibold text-grape shadow-lift'
          >
            {t('walletBanner.open', { wallet: BROWSER_WALLET_NAMES[id] })}
          </a>
        );
      })}

      <button
        type='button'
        onClick={onClose}
        aria-label={t('walletBanner.dismiss')}
        className='ml-auto rounded-full px-2 py-1 text-base leading-none text-muted'
      >
        ×
      </button>
    </div>
  );
}
