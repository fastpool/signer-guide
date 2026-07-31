import { useState } from 'react';
import { contractHref } from '../lib/route';
import type { Signer } from '../lib/types';
import Badge, { feeLabel } from './Badge';

const EXPLORER = 'https://explorer.hiro.so';

export default function SignerCard({
  signer,
  summary,
}: {
  signer: Signer;
  summary: string | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [, name] = signer.contractId.split('.');

  return (
    <li className='rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <h3 className='text-xl font-bold'>{signer.displayName}</h3>
        <p className='font-mono text-xs text-muted'>{name}</p>
      </div>

      {signer.profileId && signer.implementationName ? (
        <p className='mt-1 text-sm font-semibold'>
          Runs the{' '}
          <a
            className='text-grape underline underline-offset-2'
            href={contractHref(signer.profileId)}
          >
            {signer.implementationName} signer contract
          </a>
        </p>
      ) : (
        <p className='mt-1 text-sm font-semibold text-amber-warm'>
          We have not reviewed this pool&rsquo;s code yet
        </p>
      )}

      {summary && <p className='mt-2 text-muted'>{summary}</p>}

      <div className='mt-4 flex flex-wrap gap-2'>
        {signer.openToAnyone ? (
          <Badge tone='good'>Anyone can join</Badge>
        ) : (
          <Badge tone='warm'>Invite only</Badge>
        )}
        {signer.bitcoinRewards ? (
          <Badge tone='good'>Rewards in Bitcoin</Badge>
        ) : (
          <Badge tone='neutral'>Rewards in sBTC</Badge>
        )}
        <Badge tone='neutral'>Fee: {feeLabel(signer.feeBips)}</Badge>
      </div>

      <button
        type='button'
        onClick={() => setShowDetails((open) => !open)}
        className='mt-4 text-sm font-semibold text-grape underline underline-offset-2'
      >
        {showDetails ? 'Hide the details' : 'Show the details'}
      </button>

      {showDetails && (
        <dl className='mt-4 space-y-3 border-t border-black/5 pt-4 text-sm'>
          <div>
            <dt className='font-semibold'>Contract</dt>
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
            <dt className='font-semibold'>Code fingerprint</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {signer.canonicalSha256}
            </dd>
            <dd className='mt-1 text-muted'>
              Pools sharing this fingerprint run the same code.
            </dd>
          </div>
        </dl>
      )}
    </li>
  );
}
