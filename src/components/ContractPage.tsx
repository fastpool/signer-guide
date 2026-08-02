import { stxLabel, sumUstx } from '../lib/amounts';
import { languageName, type Locale } from '../lib/i18n';
import { localizeProfile } from '../lib/profile-i18n';
import type { Template } from '../lib/templates';
import Badge, { feeLabel, noticeLabel } from './Badge';

const EXPLORER = 'https://explorer.hiro.so';

export default function ContractPage({
  template,
  lockedUstx,
  locale,
  onLocaleChange,
}: {
  template: Template;
  /** uSTX per pool right now; undefined until the amounts are read. */
  lockedUstx?: Record<string, string | null>;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const { signers } = template;
  const ko = locale === 'ko';
  const profile = localizeProfile(template.profile, locale);
  const staked = sumUstx(
    signers.map((s) => s.contractId),
    lockedUstx,
  );

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {ko ? '← 모든 서명자 컨트랙트' : '← All signer contracts'}
        </a>
        <div className='inline-flex rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {(['en', 'ko'] as const).map((choice) => (
            <button
              key={choice}
              type='button'
              onClick={() => onLocaleChange(choice)}
              aria-pressed={locale === choice}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                locale === choice
                  ? 'bg-grape text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {languageName(choice)}
            </button>
          ))}
        </div>
      </div>

      <h1 className='mt-6 text-4xl font-extrabold md:text-5xl'>
        {ko ? `${profile.name} 서명자 컨트랙트` : `${profile.name} signer contract`}
      </h1>

      <p className='mt-4 text-lg text-muted'>{profile.detail}</p>

      <div className='mt-6 flex flex-wrap gap-2'>
        {template.openToAnyone ? (
          <Badge tone='good'>{ko ? '누구나 참여 가능' : 'Anyone can join'}</Badge>
        ) : (
          <Badge tone='warm'>{ko ? '초대 전용' : 'Invite only'}</Badge>
        )}
        {template.bitcoinRewards ? (
          <Badge tone='good'>{ko ? '보상은 비트코인으로' : 'Rewards in Bitcoin'}</Badge>
        ) : (
          <Badge tone='neutral'>{ko ? '보상은 sBTC로' : 'Rewards in sBTC'}</Badge>
        )}
        {template.maxFeeBips !== null && (
          <Badge tone='good'>
            {ko
              ? `수수료 상한 ${template.maxFeeBips / 100}%`
              : `Fee capped at ${template.maxFeeBips / 100}%`}
          </Badge>
        )}
        {template.feeChangeNotice && (
          <Badge tone='good'>
            {ko
              ? `수수료 변경은 ${noticeLabel(template.feeChangeNotice, locale)} 전에 공지`
              : `Fee changes announced ${noticeLabel(template.feeChangeNotice, locale)} ahead`}
          </Badge>
        )}
        {template.feeExemption && (
          <Badge tone='good'>{ko ? '일부 스테이커는 수수료 면제' : 'Some stakers pay no fee'}</Badge>
        )}
      </div>

      <section className='mt-10'>
        <h2 className='text-2xl font-bold'>
          {signers.length === 1
            ? ko
              ? '이 컨트랙트를 실행하는 풀은 1곳입니다'
              : 'One pool runs this contract'
            : ko
              ? `이 컨트랙트를 실행하는 풀은 ${signers.length}곳입니다`
              : `${signers.length} pools run this contract`}
        </h2>
        <p className='mt-2 text-muted'>
          {ko
            ? '모두 같은 코드를 실행하므로 동작은 같습니다. 다른 점은 운영 주체와 수수료입니다.'
            : 'They run the same code, so they behave the same way. What differs is who operates them and what they charge.'}
          {staked !== null && (
            <>
              {ko ? ' 합쳐서 현재 ' : ' Between them they are looking after '}
              <strong className='text-ink'>
                {stxLabel(staked.toString(), locale)}
              </strong>
              {ko ? '를 맡고 있습니다.' : '.'}
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
                    {stxLabel(lockedUstx[signer.contractId], locale)}
                  </span>
                )}
                <Badge tone='neutral'>
                  {ko ? '수수료: ' : 'Fee: '}
                  {feeLabel(signer.feeBips, locale)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
        <h2 className='text-lg font-bold'>{ko ? '검토 방식' : 'How we checked'}</h2>
        <dl className='mt-3 space-y-3 text-sm'>
          <div>
            <dt className='font-semibold'>{ko ? '코드 지문' : 'Code fingerprint'}</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {template.groupSha256}
            </dd>
            <dd className='mt-1 text-muted'>
              {ko
                ? '위 모든 풀의 해시가 이 값과 같기 때문에 같은 코드를 실행한다는 것을 알 수 있습니다.'
                : 'Every pool above hashes to this, which is how we know they run the same code.'}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{ko ? '참여 가능 대상' : 'Who may join'}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.openToAnyone ? (
                <>
                  {ko
                    ? '다음 조건이 성립하지 않으면 스테이킹이 거절됩니다: '
                    : 'Staking is refused unless this holds: '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.openToAnyone}
                  </code>
                </>
              ) : (
                ko
                  ? '컨트랙트에 참여자를 제한하는 검사 코드가 없어 누구도 배제되지 않습니다.'
                  : 'Nothing in the contract tests who you are, so nobody is turned away.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{ko ? '수수료 상한' : 'Fee ceiling'}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.maxFee ? (
                <>
                  {ko ? '컨트랙트가 더 높은 수수료를 거부합니다: ' : 'The contract refuses a higher fee: '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.maxFee}
                  </code>
                </>
              ) : (
                ko
                  ? '의미 있는 상한을 두는 코드가 없으므로 풀은 수수료를 임의로 정할 수 있습니다.'
                  : 'Nothing in the contract limits the fee to anything meaningful, so the pool can set it as it likes.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>
              {ko ? '수수료를 내지 않는 스테이커' : 'Stakers who pay no fee'}
            </dt>
            <dd className='mt-0.5 text-muted'>
              {template.feeExemption ? (
                <>
                  {ko
                    ? '일부 스테이커는 설정된 수수료와 관계없이 0%가 적용됩니다: '
                    : 'Some stakers are charged nothing, whatever the fee is set to: '}
                  <code className='break-all font-mono text-xs'>
                    {template.feeExemption.evidence}
                  </code>{' '}
                  {template.feeExemption.operatorChooses
                    ? ko
                      ? `대상 목록은 “${template.feeExemption.source}”에 저장되며 풀이 직접 쓰기 때문에, 누가 면제인지 풀에서 정하고 바꿀 수 있습니다.`
                      : `Who counts is kept in “${template.feeExemption.source}”, which the pool writes — so the pool picks, and can change its mind.`
                    : ko
                      ? `대상 목록은 “${template.feeExemption.source}”에 저장되며, 이를 쓰는 공개 함수가 없습니다.`
                      : `Who counts is kept in “${template.feeExemption.source}”, which no public function writes.`}
                </>
              ) : (
                ko
                  ? '모든 스테이커가 같은 수수료를 내며, 컨트랙트에 예외 규칙이 없습니다.'
                  : 'Every staker pays the same fee; the contract makes no exceptions.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>
              {ko ? '수수료 변경 사전 고지' : 'Warning before a fee change'}
            </dt>
            <dd className='mt-0.5 text-muted'>
              {template.feeChangeNotice ? (
                <>
                  {ko
                    ? '새 수수료는 먼저 공지된 뒤 '
                    : 'A new fee has to be announced and then wait '}
                  {template.feeChangeNotice.amount}{' '}
                  {template.feeChangeNotice.unit === 'cycles'
                    ? ko
                      ? '보상 사이클'
                      : 'reward cycles'
                    : ko
                      ? '비트코인 블록'
                      : 'Bitcoin blocks'}{' '}
                  {ko
                    ? `(${noticeLabel(template.feeChangeNotice, locale)})이 지나야 적용됩니다: `
                    : `— ${noticeLabel(template.feeChangeNotice, locale)} — before it can take effect: `}
                  <code className='break-all font-mono text-xs'>
                    {template.feeChangeNotice.evidence}
                  </code>
                </>
              ) : (
                ko
                  ? '새 수수료는 사전 고지 없이 풀에서 설정 즉시 적용될 수 있습니다.'
                  : 'A new fee can take effect as soon as the pool sets it, with no warning.'
              )}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>
              {ko ? '비트코인 보상' : 'Rewards in Bitcoin'}
            </dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.bitcoinRewards ? (
                <>
                  {ko
                    ? '사용자의 비트코인 주소를 기록합니다: '
                    : 'It records a Bitcoin address for you: '}
                  <code className='break-all font-mono text-xs'>
                    {template.evidence.bitcoinRewards}
                  </code>
                </>
              ) : (
                ko
                  ? '컨트랙트가 비트코인 주소를 다루지 않으므로 보상은 Stacks의 sBTC로 지급됩니다.'
                  : 'The contract never handles a Bitcoin address, so rewards arrive as sBTC on Stacks.'
              )}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
