import { identiconSvg, isIdenticonHash } from '../lib/identicon';
import { translator, type Locale } from '../lib/i18n';

/**
 * The icon of a contract's code (SIP-043).
 *
 * With no hash to draw from it shows a marked-out placeholder instead of
 * nothing. That case means one thing: this code is new here — nobody has
 * standardised it yet, which for a pool that registered in the last hour is
 * the ordinary state of affairs and worth saying. A blank space says the same
 * thing to a reader as a missing image, and an invented pattern would be far
 * worse: an icon is a claim about which code this is, and there is no claim
 * to make yet. So the placeholder is deliberately not a grid — dashed, amber,
 * the same colour the page uses elsewhere for what it has not checked.
 *
 * The SVG comes from `minidenticons` as a string of `<rect>`s, so it goes in
 * as markup. What reaches it is a 64-character hex hash this repo generated
 * and `identiconSvg` re-checks; no contract text, and nothing off the chain,
 * is anywhere in it.
 */
export default function Identicon({
  hash,
  locale,
  className = 'h-9 w-9',
}: {
  hash: string | null;
  locale: Locale;
  className?: string;
}) {
  const t = translator(locale);

  if (!isIdenticonHash(hash)) {
    const label = t('identicon.newLabel');
    return (
      <span
        role='img'
        aria-label={label}
        title={label}
        className={`inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-amber-warm/40 text-[0.6em] font-bold text-amber-warm ${className}`}
      >
        <span aria-hidden='true'>?</span>
      </span>
    );
  }

  const label = t('identicon.label');
  return (
    <span
      role='img'
      aria-label={label}
      title={label}
      className={`inline-block shrink-0 rounded-xl bg-card-raised p-0.5 ${className}`}
      dangerouslySetInnerHTML={{ __html: identiconSvg(hash) }}
    />
  );
}
