import { useEffect, useState } from 'react';
import { stxCompact } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import { isBnsName } from '../lib/principals';
import { forgetAddress, rememberedAddress } from '../lib/remembered-address';
import { signerHref, statusHref } from '../lib/route';
import { readAddressStatus, type AddressStatus } from '../lib/status';
import { ellipsedAddr } from '../lib/strings';
import type { Signer } from '../lib/types';

/**
 * One line above the pool list for a reader who has checked their own address
 * before: where that STX is now, with the full answer a tap away.
 *
 * Nothing is read unless an address was remembered, so a first visit asks the
 * chain nothing, as the list page always has.
 */
export default function YourStake({
  signers,
  locale,
}: {
  signers: Signer[];
  locale: Locale;
}) {
  const t = translator(locale);
  const [query, setQuery] = useState<string | null>(() => rememberedAddress());
  const [row, setRow] = useState<AddressStatus | null>(null);

  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    void readAddressStatus(query, null, controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) setRow(status);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [query]);

  if (query === null) return null;

  const who = isBnsName(query) ? query : ellipsedAddr(query);
  const pool = row?.position
    ? signers.find((signer) => signer.contractId === row.position?.signer)
    : undefined;

  let text: string;
  if (row === null) text = t('home.you.reading', { who });
  else if (row.failed || row.unregistered) text = t('home.you.failed', { who });
  else if (row.position === null) text = t('home.you.notStaking', { who });
  else
    text = t('home.you.staked', {
      who,
      amount: stxCompact(row.position.amountUstx, locale) ?? '—',
    });

  return (
    <div className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-card px-4 py-2.5 text-sm shadow-lift'>
      <span className='font-semibold text-ink'>{text}</span>
      {row?.position && (
        <a
          href={signerHref(row.position.signer)}
          className='font-semibold text-grape hover:underline'
        >
          {pool?.displayName ?? row.position.signer.split('.')[1]}
        </a>
      )}
      <a
        href={statusHref([query])}
        className='font-bold whitespace-nowrap text-grape'
      >
        {t('home.you.open')}
      </a>
      <button
        type='button'
        onClick={() => {
          forgetAddress();
          setQuery(null);
        }}
        className='ml-auto text-xs text-muted underline underline-offset-2 hover:text-ink'
      >
        {t('home.you.forget')}
      </button>
    </div>
  );
}
