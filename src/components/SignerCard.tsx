import { useState } from 'react';
import { stxLabel } from '../lib/amounts';
import type { Locale } from '../lib/i18n';
import { contractHref } from '../lib/route';
import type { Signer } from '../lib/types';
import Badge, { feeLabel, noticeLabel } from './Badge';

const EXPLORER = 'https://explorer.hiro.so';

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
  const [, name] = signer.contractId.split('.');
  const ko = locale === 'ko';

  return (
    <li className='rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <h3 className='text-xl font-bold'>{signer.displayName}</h3>
        <p className='font-mono text-xs text-muted'>{name}</p>
      </div>

      {signer.profileId && signer.implementationName ? (
        <p className='mt-1 text-sm font-semibold'>
          {ko ? '다음 서명자 컨트랙트를 사용합니다: ' : 'Runs the '}
          <a
            className='text-grape underline underline-offset-2'
            href={contractHref(signer.profileId)}
          >
            {ko
              ? `${signer.implementationName} 서명자 컨트랙트`
              : `${signer.implementationName} signer contract`}
          </a>
        </p>
      ) : (
        <p className='mt-1 text-sm font-semibold text-amber-warm'>
          {ko
            ? '이 풀의 코드는 아직 검토되지 않았습니다'
            : 'We have not reviewed this pool\'s code yet'}
        </p>
      )}

      {summary && <p className='mt-2 text-muted'>{summary}</p>}

      {lockedUstx !== undefined && (
        <p className='mt-3 text-lg font-bold'>
          {stxLabel(lockedUstx)}
          {lockedUstx !== null && lockedUstx !== '0' && (
            <span className='ml-1.5 text-sm font-semibold text-muted'>
              {ko ? '이 풀에 스테이킹됨' : 'staked here'}
            </span>
          )}
        </p>
      )}

      <div className='mt-4 flex flex-wrap gap-2'>
        {signer.openToAnyone ? (
          <Badge tone='good'>{ko ? '누구나 참여 가능' : 'Anyone can join'}</Badge>
        ) : (
          <Badge tone='warm'>{ko ? '초대 전용' : 'Invite only'}</Badge>
        )}
        {signer.bitcoinRewards ? (
          <Badge tone='good'>{ko ? '보상은 비트코인으로' : 'Rewards in Bitcoin'}</Badge>
        ) : (
          <Badge tone='neutral'>{ko ? '보상은 sBTC로' : 'Rewards in sBTC'}</Badge>
        )}
        <Badge tone='neutral'>{ko ? '수수료: ' : 'Fee: '}{feeLabel(signer.feeBips, locale)}</Badge>
        {signer.maxFeeBips !== null && (
          <Badge tone='good'>
            {ko
              ? `수수료 상한 ${signer.maxFeeBips / 100}%`
              : `Fee capped at ${signer.maxFeeBips / 100}%`}
          </Badge>
        )}
        {signer.feeChangeNotice && (
          <Badge tone='good'>
            {ko
              ? `수수료 변경은 ${noticeLabel(signer.feeChangeNotice, locale)} 전에 공지`
              : `Fee changes announced ${noticeLabel(signer.feeChangeNotice, locale)} ahead`}
          </Badge>
        )}
        {signer.feeExemption && (
          <Badge tone='good'>{ko ? '일부 스테이커는 수수료 면제' : 'Some stakers pay no fee'}</Badge>
        )}
      </div>

      <button
        type='button'
        onClick={() => setShowDetails((open) => !open)}
        className='mt-4 text-sm font-semibold text-grape underline underline-offset-2'
      >
          {showDetails
            ? ko
              ? '자세한 내용 숨기기'
              : 'Hide the details'
            : ko
              ? '자세한 내용 보기'
              : 'Show the details'}
      </button>

      {showDetails && (
        <dl className='mt-4 space-y-3 border-t border-black/5 pt-4 text-sm'>
          <div>
            <dt className='font-semibold'>{ko ? '컨트랙트' : 'Contract'}</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              <a
                className='underline'
                href={`${EXPLORER}/txid/${signer.contractId}?chain=mainnet`}
                target='_blank'
                rel='noreferrer'
              >
                {signer.contractId}
              </a>
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>
              {ko ? '코드 지문' : 'Code fingerprint'}
            </dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {signer.canonicalSha256}
            </dd>
            <dd className='mt-1 text-muted'>
              {ko
                ? '이 지문이 같은 풀은 같은 코드를 실행합니다.'
                : 'Pools sharing this fingerprint run the same code.'}
            </dd>
          </div>
        </dl>
      )}
    </li>
  );
}
