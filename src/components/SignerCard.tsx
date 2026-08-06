import { useState } from 'react';
import { stxLabel } from '../lib/amounts';
import { explorerUrl } from '../lib/explorer';
import { SIP_IDENTICON_URL } from '../lib/identicon';
import { translator, type Locale } from '../lib/i18n';
import { contractHref } from '../lib/route';
import { ellipsedAddr } from '../lib/strings';
import type { Signer } from '../lib/types';
import Badge, { feeLabel, noticeLabel } from './Badge';
import Identicon from './Identicon';
import StakeModal from './StakeModal';

export default function SignerCard({
  signer,
  summary,
  lockedUstx,
  locale,
}: {
  signer: Signer;
  summary: string | null;
  /** uSTX staked with this pool right now; undefined until it is read. */
  lockedUstx?: string | null;
  locale: Locale;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [addr, name] = signer.contractId.split('.');
  const t = translator(locale);

  return (
    <li className='rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='flex items-center gap-2 text-xl font-bold'>
          <Identicon
            hash={signer.identiconHash}
            locale={locale}
            className='h-8 w-8'
          />
          {signer.displayName}
        </h3>
        <p className='font-mono text-xs text-muted'>
          {ellipsedAddr(addr)}.{name}
        </p>
      </div>

      {signer.profileId && signer.implementationName ? (
        <p className='mt-1 text-sm font-semibold'>
          {t.rich('signer.runsContract', {
            link: (
              <a
                className='text-grape underline underline-offset-2'
                href={contractHref(signer.profileId)}
              >
                {t('signer.contractLink', { name: signer.implementationName })}
              </a>
            ),
          })}
        </p>
      ) : (
        <p className='mt-1 text-sm font-semibold text-amber-warm'>
          {t('signer.notReviewed')}
        </p>
      )}

      {summary && <p className='mt-2 text-muted'>{summary}</p>}

      {lockedUstx !== undefined && (
        <p className='mt-3 text-lg font-bold'>
          {stxLabel(lockedUstx, locale)}
          {lockedUstx !== null && lockedUstx !== '0' && (
            <span className='ml-1.5 text-sm font-semibold text-muted'>
              {t('signer.stakedHere')}
            </span>
          )}
        </p>
      )}

      <div className='mt-4 flex flex-wrap gap-2'>
        {signer.openToAnyone ? (
          <Badge tone='good'>{t('badge.anyoneCanJoin')}</Badge>
        ) : (
          <Badge tone='warm'>{t('badge.inviteOnly')}</Badge>
        )}
        {signer.bitcoinRewards && (
          <Badge tone='good'>{t('badge.bitcoinRewards')}</Badge>
        )}
        <Badge tone='neutral'>{t('badge.sbtcRewards')}</Badge>
        <Badge tone='neutral'>
          {t('badge.fee', { fee: feeLabel(signer.feeBips, locale) })}
        </Badge>
        {signer.maxFeeBips !== null && (
          <Badge tone='good'>
            {t('badge.feeCapped', { percent: signer.maxFeeBips / 100 })}
          </Badge>
        )}
        {signer.feeChangeNotice && (
          <Badge tone='good'>
            {t('badge.feeNotice', {
              notice: noticeLabel(signer.feeChangeNotice, locale),
            })}
          </Badge>
        )}
        {signer.feeExemption && (
          <Badge tone='good'>{t('badge.feeExemption')}</Badge>
        )}
      </div>

      <div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
        <button
          type='button'
          onClick={() => setShowDetails((open) => !open)}
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {showDetails ? t('signer.hideDetails') : t('signer.showDetails')}
        </button>

        {signer.openToAnyone &&
        (!signer.callApi || signer.callApi === 'pox5') ? (
          <StakeModal signer={signer} locale={locale} />
        ) : (
          <p className='text-xs text-muted'>{t('signer.customCalls')}</p>
        )}
      </div>

      {showDetails && (
        <dl className='mt-4 space-y-3 border-t border-black/5 pt-4 text-sm'>
          <div>
            <dt className='font-semibold'>{t('signer.contract')}</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              <a
                className='underline'
                href={explorerUrl(signer.contractId)}
                target='_blank'
                rel='noreferrer'
              >
                {signer.contractId}
              </a>
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{t('signer.signerKey')}</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {signer.signerKey ?? t('signer.notAvailable')}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{t('signer.fingerprint')}</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {signer.canonicalSha256}
            </dd>
            <dd className='mt-1 text-muted'>{t('signer.fingerprintNote')}</dd>
          </div>

          {signer.identiconHash && (
            <div>
              <dt className='font-semibold'>{t('signer.identicon')}</dt>
              <dd className='mt-1 flex items-center gap-2'>
                <Identicon
                  hash={signer.identiconHash}
                  locale={locale}
                  className='h-10 w-10'
                />
                <span className='break-all font-mono text-xs text-muted'>
                  {signer.identiconHash}
                </span>
              </dd>
              <dd className='mt-1 text-muted'>
                {t.rich('signer.identiconNote', {
                  link: (
                    <a
                      className='underline'
                      href={SIP_IDENTICON_URL}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {t('identicon.sip')}
                    </a>
                  ),
                })}
              </dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}
