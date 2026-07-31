import { stxLabel, sumUstx } from '../lib/amounts';
import type { Template } from '../lib/templates';
import Badge, { feeLabel, noticeLabel } from './Badge';

const EXPLORER = 'https://explorer.hiro.so';

export default function ContractPage({
  template,
  lockedUstx,
}: {
  template: Template;
  /** uSTX per pool right now; undefined until the amounts are read. */
  lockedUstx?: Record<string, string | null>;
}) {
  const { profile, signers } = template;
  const staked = sumUstx(
    signers.map((s) => s.contractId),
    lockedUstx,
  );

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <a
        href='#/'
        className='text-sm font-semibold text-grape underline underline-offset-2'
      >
        ← All signer contracts
      </a>

      <h1 className='mt-6 text-4xl font-extrabold md:text-5xl'>
        {profile.name} signer contract
      </h1>

      <p className='mt-4 text-lg text-muted'>{profile.detail}</p>

      <div className='mt-6 flex flex-wrap gap-2'>
        {template.openToAnyone ? (
          <Badge tone='good'>Anyone can join</Badge>
        ) : (
          <Badge tone='warm'>Invite only</Badge>
        )}
        {template.bitcoinRewards ? (
          <Badge tone='good'>Rewards in Bitcoin</Badge>
        ) : (
          <Badge tone='neutral'>Rewards in sBTC</Badge>
        )}
        {template.maxFeeBips !== null && (
          <Badge tone='good'>Fee capped at {template.maxFeeBips / 100}%</Badge>
        )}
        {template.feeChangeDelayBlocks !== null && (
          <Badge tone='good'>
            Fee changes announced {noticeLabel(template.feeChangeDelayBlocks)}{' '}
            ahead
          </Badge>
        )}
      </div>

      <section className='mt-10'>
        <h2 className='text-2xl font-bold'>
          {signers.length === 1
            ? 'One pool runs this contract'
            : `${signers.length} pools run this contract`}
        </h2>
        <p className='mt-2 text-muted'>
          They run the same code, so they behave the same way. What differs is
          who operates them and what they charge.
          {staked !== null && (
            <>
              {' '}
              Between them they are looking after{' '}
              <strong className='text-ink'>
                {stxLabel(staked.toString())}
              </strong>
              .
            </>
          )}
        </p>

        <ul className='mt-4 space-y-3'>
          {signers.map((signer) => (
            <li
              key={signer.contractId}
              className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'
            >
              <a
                className='text-lg font-bold underline underline-offset-2'
                href={`${EXPLORER}/txid/${signer.contractId}?chain=mainnet`}
                target='_blank'
                rel='noreferrer'
              >
                {signer.displayName}
              </a>
              <span className='flex flex-wrap items-baseline gap-2'>
                {lockedUstx && (
                  <span className='text-sm font-semibold'>
                    {stxLabel(lockedUstx[signer.contractId])}
                  </span>
                )}
                <Badge tone='neutral'>Fee: {feeLabel(signer.feeBips)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
        <h2 className='text-lg font-bold'>How we checked</h2>
        <dl className='mt-3 space-y-3 text-sm'>
          <div>
            <dt className='font-semibold'>Code fingerprint</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {template.groupSha256}
            </dd>
            <dd className='mt-1 text-muted'>
              Every pool above hashes to this, which is how we know they run the
              same code.
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>Who may join</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.openToAnyone ? (
                <>
                  Staking is refused unless this holds:{' '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.openToAnyone}
                  </code>
                </>
              ) : (
                'Nothing in the contract tests who you are, so nobody is turned away.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>Fee ceiling</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.maxFee ? (
                <>
                  The contract refuses a higher fee:{' '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.maxFee}
                  </code>
                </>
              ) : (
                'Nothing in the contract limits the fee to anything meaningful, so the pool can set it as it likes.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>Warning before a fee change</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.feeChangeDelay ? (
                <>
                  A new fee has to be announced and then wait{' '}
                  {template.feeChangeDelayBlocks} Bitcoin blocks —{' '}
                  {noticeLabel(template.feeChangeDelayBlocks ?? 0)} — before it
                  can take effect:{' '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.feeChangeDelay}
                  </code>
                </>
              ) : (
                'A new fee can take effect as soon as the pool sets it, with no warning.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>Rewards in Bitcoin</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.bitcoinRewards ? (
                <>
                  It records a Bitcoin address for you:{' '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.bitcoinRewards}
                  </code>
                </>
              ) : (
                'The contract never handles a Bitcoin address, so rewards arrive as sBTC on Stacks.'
              )}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
