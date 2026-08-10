import { translator, type Locale } from '../lib/i18n';
import type { Signer } from '../lib/types';

/**
 * A pool's name, printed so a reader can tell whether anyone stands behind it.
 *
 * Most of these names are not the pool's. They are `humanizeContractName`
 * making the best it can of a contract id, which gives "Pox5" for a pool
 * everybody calls Senseinode and a bare "signer-manager" for three others. A
 * page that sets those in the same type as a confirmed name is quietly
 * claiming to know something it does not, and a reader choosing where to put
 * their STX is exactly the person that misleads.
 *
 * So the two are drawn apart. A name somebody put in `signers-manual.json`,
 * with a note saying where they got it, is printed plainly and gets a tick. A
 * name read off the contract id is set in italic and gets nothing — the italic
 * is the whole signal, which is why the tick is not merely omitted but the
 * type changed as well: an absence is not something a reader notices.
 *
 * The tick is decoration and is hidden from screen readers; the sentence that
 * explains it is on the name itself, where a reader lands anyway.
 */
export default function PoolName({
  signer,
  locale,
}: {
  signer: Pick<Signer, 'displayName' | 'displayNameSource'>;
  locale: Locale;
}) {
  const t = translator(locale);

  if (signer.displayNameSource !== 'manual') {
    const label = t('name.fromContract');
    return (
      <span className='italic' title={label}>
        {signer.displayName}
      </span>
    );
  }

  const label = t('name.confirmed');
  return (
    <span title={label}>
      {signer.displayName}
      <span aria-hidden='true' className='ml-1 text-sm text-grape'>
        ✓
      </span>
      <span className='sr-only'> {label}</span>
    </span>
  );
}
