import { useMemo, useState } from 'react';
import ContractPage from './components/ContractPage';
import SignerCard from './components/SignerCard';
import data from './data/signers.json';
import totalsData from './data/totals.json';
import { stxLabel, sumUstx } from './lib/amounts';
import { detectLocale, formatLastUpdate, languageName, type Locale } from './lib/i18n';
import { localizeProfile } from './lib/profile-i18n';
import { PROFILES } from './lib/profiles';
import { contractHref, useRoute } from './lib/route';
import { buildTemplates, templateFor } from './lib/templates';
import type { LockedTotals, SignerData } from './lib/types';

const signerData = data as SignerData;

/**
 * What each pool holds, read from pox-5 by the hourly refresh rather than by
 * every visitor. See the note at the top of scripts/locked.ts.
 */
const totals = totalsData as LockedTotals;

/** A fee we would call low. Not a promise — see the note under the filters. */
const LOW_FEE_BIPS = 500; // 5%

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';
const SIGNUP_FORM_URL =
  typeof import.meta.env.VITE_SIGNER_UPDATES_FORM_URL === 'string' &&
  import.meta.env.VITE_SIGNER_UPDATES_FORM_URL.length > 0
    ? import.meta.env.VITE_SIGNER_UPDATES_FORM_URL
    : null;

export type FilterId =
  'bitcoin' | 'lowFee' | 'cappedFee' | 'feeNotice' | 'open';

/** A ceiling we would call reassuring. Juice Pool enforces exactly this. */
const CAPPED_FEE_BIPS = 2000; // 20%

const FILTER_IDS: FilterId[] = ['bitcoin', 'lowFee', 'cappedFee', 'feeNotice', 'open'];

function filterText(locale: Locale, id: FilterId): { label: string; help: string } {
  if (locale === 'ko') {
    if (id === 'bitcoin') {
      return {
        label: '보상은 비트코인으로',
        help: 'Stacks의 sBTC 대신 비트코인 주소로 보상을 받습니다.',
      };
    }
    if (id === 'lowFee') {
      return {
        label: '낮은 수수료 (5% 미만)',
        help: '현재 풀 수수료가 5% 미만입니다. 수수료는 이후 변경될 수 있습니다.',
      };
    }
    if (id === 'cappedFee') {
      return {
        label: '수수료 상한 20%',
        help: '풀 운영자가 무엇을 결정하든 컨트랙트가 수수료를 20% 초과로 올리지 못하게 막습니다.',
      };
    }
    if (id === 'feeNotice') {
      return {
        label: '수수료 변경 사전 공지',
        help: '수수료 변경이 즉시 적용되지 않고 대기 기간이 있어, 확인하고 이동할 시간이 생깁니다.',
      };
    }
    return {
      label: '누구나 참여 가능',
      help: '초대나 회원 자격 없이 누구나 이 풀에 스테이킹할 수 있습니다.',
    };
  }

  if (id === 'bitcoin') {
    return {
      label: 'Rewards in Bitcoin',
      help: 'Pays your rewards to a Bitcoin address, instead of as sBTC on Stacks.',
    };
  }
  if (id === 'lowFee') {
    return {
      label: 'Low fee (under 5%)',
      help: 'The fee the pool charges today is under 5%. Pools can change their fee later.',
    };
  }
  if (id === 'cappedFee') {
    return {
      label: 'Fee capped at 20%',
      help: 'The contract itself refuses to let the fee go above 20%, whatever the pool decides. Most contracts have no such limit.',
    };
  }
  if (id === 'feeNotice') {
    return {
      label: 'Fee changes announced first',
      help: 'A new fee cannot take effect the moment the pool decides on it — the contract makes it wait, so you have time to notice and move.',
    };
  }
  return {
    label: 'Anyone can join',
    help: 'No invitation or membership needed — you can stake with this pool yourself.',
  };
}

export function matches(
  signer: SignerData['signers'][number],
  active: Set<FilterId>,
): boolean {
  if (active.has('bitcoin') && !signer.bitcoinRewards) return false;
  if (active.has('open') && !signer.openToAnyone) return false;
  if (active.has('cappedFee')) {
    // A ceiling the code enforces, unlike the fee itself which can move.
    if (signer.maxFeeBips === null || signer.maxFeeBips > CAPPED_FEE_BIPS) {
      return false;
    }
  }
  if (active.has('feeNotice') && !signer.feeChangeNotice) return false;
  if (active.has('lowFee')) {
    // A pool with no fee in its own contract is not counted as low: the fee
    // may simply live somewhere else. Better to leave it out than to promise.
    if (signer.feeBips === null || signer.feeBips >= LOW_FEE_BIPS) return false;
  }
  return true;
}

const CONTRACT_IDS = signerData.signers.map((s) => s.contractId);

export default function App() {
  const route = useRoute();
  const [active, setActive] = useState<Set<FilterId>>(new Set());
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const ko = locale === 'ko';
  const lastUpdate = formatLastUpdate(signerData.generatedAt, locale);

  const templates = useMemo(() => buildTemplates(signerData.signers), []);

  const shown = useMemo(() => {
    const matching = signerData.signers.filter((s) => matches(s, active));
    // Biggest first: the list is easier to read when the pools people
    // actually use are at the top.
    return [...matching].sort((a, b) => {
      const left = BigInt(totals.ustx[a.contractId] ?? 0);
      const right = BigInt(totals.ustx[b.contractId] ?? 0);
      return right > left ? 1 : right < left ? -1 : 0;
    });
  }, [active]);

  const staked = sumUstx(CONTRACT_IDS, totals.ustx);

  if (route.name === 'contract') {
    const template = templateFor(templates, route.profileId);
    if (template) {
      return (
        <ContractPage
          template={template}
          lockedUstx={totals.ustx}
          locale={locale}
          onLocaleChange={setLocale}
        />
      );
    }
  }

  const toggle = (id: FilterId) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = signerData.signers.length;
  const filters = FILTER_IDS.map((id) => ({ id, ...filterText(locale, id) }));
  const profileSummaryFor = (profileId: string | null): string | null => {
    if (!profileId) return null;
    const profile = Object.values(PROFILES).find((p) => p.id === profileId);
    if (!profile) return null;
    return localizeProfile(profile, locale).summary;
  };

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <header className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <a
            href={FASTPOOL_URL}
            className='flex items-center gap-2 self-start text-sm font-semibold text-muted transition-colors hover:text-grape'
          >
            <img
              src='/fastpool-logo.svg'
              alt=''
              width='36'
              height='36'
              className='rounded-xl bg-grape'
            />
            Fast Pool
          </a>
          <div className='inline-flex rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
            {(['en', 'ko'] as const).map((choice) => (
              <button
                key={choice}
                type='button'
                onClick={() => setLocale(choice)}
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
        <h1 className='text-4xl font-extrabold md:text-5xl'>
          {ko ? '내 STX를 어디에 스테이킹할 수 있을까?' : 'Where can you stake your STX?'}
        </h1>
        <p className='text-lg text-muted'>
          {ko ? (
            <>
              스테이킹할 때는 내 자산을 맡길 풀을 고르게 됩니다. 지금 선택 가능한 풀은{' '}
              <strong className='text-ink'>{total}개</strong>지만, 실제로는{' '}
              <strong className='text-ink'>
                {templates.length}개의 서명자 컨트랙트
              </strong>
              만 사용합니다. 그래서 겉보기보다 확인할 내용이 적습니다.
            </>
          ) : (
            <>
              When you stake, you pick a pool to look after it for you. There are{' '}
              <strong className='text-ink'>{total} pools</strong> to choose from
              today, but between them they run only{' '}
              <strong className='text-ink'>
                {templates.length} signer contracts
              </strong>{' '}
              — so there is less to learn than it looks.
            </>
          )}
        </p>
        {staked !== null && (
          <p className='text-lg text-muted'>
            {ko ? '합쳐서 현재 ' : 'Between them they are looking after '}
            <strong className='text-ink'>{stxLabel(staked.toString())}</strong>{' '}
            {ko ? `${totals.cycle} 사이클 기준으로 맡고 있습니다.` : `for cycle ${totals.cycle}.`}
          </p>
        )}
      </header>

      <section className='mt-10' aria-labelledby='contracts-heading'>
        <h2 id='contracts-heading' className='text-2xl font-bold'>
          {ko ? '서명자 컨트랙트' : 'The signer contracts'}
        </h2>
        <p className='mt-1 text-muted'>
          {ko
            ? '컨트랙트마다 동작이 다릅니다. 컨트랙트를 눌러 어떤 기능인지, 누가 운영하는지 확인하세요.'
            : 'Each one behaves differently. Tap a contract to see what it does and who runs it.'}
        </p>
        <ul className='mt-4 grid gap-3 sm:grid-cols-2'>
          {templates.map((template) => {
            const profile = localizeProfile(template.profile, locale);
            return (
            <li key={template.profile.id}>
              <a
                href={contractHref(template.profile.id)}
                className='flex h-full flex-col rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)] transition-colors hover:bg-grape-soft'
              >
                <span className='text-lg font-bold'>
                  {profile.name}
                </span>
                <span className='text-sm text-muted'>
                  {template.signers.length}{' '}
                  {ko ? '풀' : template.signers.length === 1 ? 'pool' : 'pools'}
                </span>
                <span className='mt-2 text-sm text-muted'>
                  {profile.summary}
                </span>
              </a>
            </li>
            );
          })}
        </ul>
      </section>

      <p className='mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted'>
        <span className='inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 font-bold text-ink shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          <span className='h-2 w-2 rounded-full bg-mint' aria-hidden='true' />
          {ko ? '마지막 업데이트: ' : 'Last update: '}
          {lastUpdate}
        </span>
        <span>
          {ko
            ? '수수료와 금액은 매시간 체인에서 다시 읽습니다.'
            : 'Fees and amounts are read from the chain again every hour.'}
        </span>
      </p>

      <section className='mt-8 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]' aria-labelledby='updates-signup-heading'>
        <h2 id='updates-signup-heading' className='text-xl font-bold'>
          {ko ? '이메일로 서명자 업데이트 받기' : 'Get signer updates by email'}
        </h2>
        <p className='mt-1 text-sm text-muted'>
          {ko
            ? '서명자와 서명자 구성 변경 소식을 이메일로 받으세요.'
            : 'Join the list for changes to signers and signer configurations.'}
        </p>
        <form
          className='mt-4 flex flex-col gap-3 sm:flex-row'
          action={SIGNUP_FORM_URL ?? undefined}
          method='post'
        >
          <label htmlFor='signup-email' className='sr-only'>
            {ko ? '이메일 주소' : 'Email address'}
          </label>
          <input
            id='signup-email'
            name='email'
            type='email'
            autoComplete='email'
            required
            placeholder={ko ? 'name@example.com' : 'you@example.com'}
            className='w-full rounded-full border border-black/10 px-4 py-2.5 text-ink outline-none transition-colors placeholder:text-muted/80 focus:border-grape'
          />
          <button
            type='submit'
            disabled={SIGNUP_FORM_URL === null}
            className='rounded-full bg-grape px-5 py-2.5 font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50'
          >
            {ko ? '구독하기' : 'Sign up'}
          </button>
        </form>
        {SIGNUP_FORM_URL === null && (
          <p className='mt-2 text-xs text-muted'>
            {ko
              ? '아직 구독 주소가 설정되지 않았습니다. VITE_SIGNER_UPDATES_FORM_URL을 설정해 활성화하세요.'
              : 'Signup is not configured yet. Set VITE_SIGNER_UPDATES_FORM_URL to enable it.'}
          </p>
        )}
      </section>

      <section className='mt-12' aria-labelledby='filters-heading'>
        <h2 id='filters-heading' className='text-2xl font-bold'>
          {ko ? '전체 풀' : 'All pools'}
        </h2>
        <p className='mt-1 text-sm font-bold text-muted'>
          {ko ? '어떤 기준이 중요한가요?' : 'What matters to you?'}
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          {filters.map((filter) => {
            const on = active.has(filter.id);
            return (
              <button
                key={filter.id}
                type='button'
                aria-pressed={on}
                title={filter.help}
                onClick={() => toggle(filter.id)}
                className={`rounded-full px-4 py-2 font-semibold transition-colors ${
                  on
                    ? 'bg-grape text-white'
                    : 'bg-white text-ink shadow-[0_1px_3px_rgba(44,42,53,0.08)] hover:bg-grape-soft'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <ul className='mt-3 space-y-1 text-sm text-muted'>
          {filters.filter((f) => active.has(f.id)).map((f) => (
            <li key={f.id}>{f.help}</li>
          ))}
        </ul>
      </section>

      <p className='mt-8 font-semibold'>
        {shown.length === total
          ? ko
            ? `전체 ${total}개 풀 표시 중`
            : `Showing all ${total} pools`
          : ko
            ? `${total}개 중 ${shown.length}개 풀이 조건과 일치`
            : `${shown.length} of ${total} pools match`}
      </p>

      {shown.length === 0 && (
        <p className='mt-4 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {ko
            ? '선택한 조건을 모두 만족하는 풀이 없습니다. 조건을 하나 꺼보세요.'
            : 'No pool matches everything you picked. Try turning one off.'}
        </p>
      )}

      <ul className='mt-4 space-y-4'>
        {shown.map((signer) => (
          <SignerCard
            key={signer.contractId}
            signer={signer}
            lockedUstx={totals.ustx[signer.contractId]}
            summary={profileSummaryFor(signer.profileId)}
            locale={locale}
          />
        ))}
      </ul>

      <footer className='mt-12 space-y-3 border-t border-black/5 pt-6 text-sm text-muted'>
        <p>
          {ko ? (
            <>
              <strong className='text-ink'>수수료 안내.</strong> 표시된 수수료는 각 풀의 컨트랙트에서 읽은 현재 적용 값입니다. 대부분의 풀은 수수료를 고정하지 않기 때문에 나중에 바꿀 수 있습니다. 일부 컨트랙트는 코드로 상한을 두며, 이런 경우 <em>수수료 상한</em> 배지가 붙습니다. 또 더 적은 일부는 수수료 변경 전에 대기 기간을 두어 이동할 시간을 주며, 이런 경우 <em>수수료 변경 사전 공지</em> 배지가 붙습니다. 어떤 풀은 이 컨트랙트에 수수료 정의가 전혀 없기도 하며, 그 경우 무료라는 뜻은 아닙니다.
            </>
          ) : (
            <>
              <strong className='text-ink'>About the fees.</strong> The fee shown is
              the one in force right now, read from the pool&rsquo;s own contract.
              Most pools do not lock their fee in, so they can change it later. A
              few contracts do set a ceiling in code — those carry a{' '}
              <em>fee capped</em> badge, and that limit holds whatever the pool
              decides. Fewer still make a fee change wait before it applies, which
              gives you time to move — those carry a <em>fee changes announced</em>{' '}
              badge. Some pools have no fee in this contract at all, which does not
              always mean free, because the fee may be taken elsewhere.
            </>
          )}
        </p>
        <p>
          {ko
            ? `여기의 모든 풀은 이름이 아니라 코드 해시로 식별되며, 같은 서명자 컨트랙트를 실행하면 같은 것으로 묶어 표시됩니다. 수수료는 ${lastUpdate} 시점에 각 컨트랙트 저장소에서 읽었고, 스테이킹 금액은 ${totals.cycle} 사이클 기준입니다.`
            : `Every pool here is registered on Stacks and identified by what its code adds up to, not by its name — so two pools running the same signer contract are shown as such. Fees were read from each contract’s own storage on ${lastUpdate}, and the amounts staked are for cycle ${totals.cycle}.`}
        </p>
        <p>
          {ko
            ? '여기의 내용은 신뢰에 기대지 않으며, 이 페이지도 마찬가지입니다: '
            : 'Nothing here is taken on trust, and neither should this page be: '}
          <a
            className='font-semibold text-grape underline underline-offset-2'
            href={REPO_URL}
            target='_blank'
            rel='noreferrer'
          >
            {ko ? 'GitHub에서 코드 보기' : 'read the code on GitHub'}
          </a>{' '}
          {ko
            ? '모든 설명은 직접 확인 가능한 Clarity 코드에 근거합니다.'
            : '— every claim above comes from a line of Clarity you can check yourself.'}
        </p>
        <p>
          {ko ? '제작: ' : 'Made by '}
          <a
            className='font-semibold text-grape underline underline-offset-2'
            href={FASTPOOL_URL}
          >
            Fast Pool
          </a>
          {ko
            ? ', 위 목록의 일부 풀을 운영합니다. 해당 풀도 다른 풀과 똑같이 같은 코드 기준으로 설명되고 규모 순으로 정렬됩니다. 이 모든 내용을 공개한 이유는 누구의 말도 그대로 믿지 않아도 되게 하기 위해서입니다.'
            : ', which runs some of the pools listed above. They are described by the same code as everyone else’s and ranked by size like everyone else’s — the reason all of this is public is so you do not have to take that on trust either.'}
        </p>
      </footer>
    </main>
  );
}
