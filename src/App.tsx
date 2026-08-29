import { useEffect, useMemo, useState } from 'react';
import ContractPage from './components/ContractPage';
import Identicon from './components/Identicon';
import LocaleSwitch from './components/LocaleSwitch';
import Mark from './components/Mark';
import SignerCard from './components/SignerCard';
import SignerPage from './components/SignerPage';
import MyRewardsPage from './components/MyRewardsPage';
import StxOnlyHistoryPage from './components/StxOnlyHistoryPage';
import StxOnlyRewardsEstimate from './components/StxOnlyRewardsEstimate';
import StatusPage from './components/StatusPage';
import UpdateBanner from './components/UpdateBanner';
import { stxLabel, sumUstx } from './lib/amounts';
import { useSnapshot } from './lib/data-source';
import {
  detectLocale,
  formatLastUpdate,
  translator,
  type Locale,
  type MessageKey,
} from './lib/i18n';
import { applyLocaleMetadata } from './lib/metadata';
import { localizeProfile } from './lib/profile-i18n';
import { PROFILES } from './lib/profiles';
import {
  contractHref,
  myRewardsHref,
  statusHref,
  stxOnlyRewardsHref,
  useRoute,
} from './lib/route';
import { groupForContract, signerSlug } from './lib/signer-groups';
import { inUse, isNewSigner } from './lib/activity';
import { useServiceWorker } from './lib/service-worker';
import { isArchived } from './lib/profiles';
import { buildTemplates, templateFor } from './lib/templates';
import type { LockedTotals, SignerData } from './lib/types';

/** A fee we would call low. Not a promise — see the note under the filters. */
const LOW_FEE_BIPS = 500; // 5%

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';

/** Switch compact STX rewards style: 'original' or 'weekly'. */
const STX_COMPACT_VARIANT: 'original' | 'weekly' = 'weekly';

export type FilterId =
  'inUse' | 'bitcoin' | 'lowFee' | 'cappedFee' | 'feeNotice' | 'open';

/** A ceiling we would call reassuring. Juice Pool enforces exactly this. */
const CAPPED_FEE_BIPS = 2000; // 20%

const FILTER_IDS: FilterId[] = [
  'inUse',
  'bitcoin',
  'lowFee',
  'cappedFee',
  'feeNotice',
  'open',
];

/**
 * The one filter that starts on.
 *
 * Half the registered signers hold nothing and never have, and a reader
 * choosing a pool is not helped by scrolling past them. Everything else here
 * narrows a list the reader has already been shown; this one decides what the
 * list is, so it is the only one that has any business being on by default —
 * and the count beside it says what it is keeping out.
 */
const DEFAULT_FILTERS: FilterId[] = ['inUse'];

export function matches(
  signer: SignerData['signers'][number],
  active: Set<FilterId>,
  totals?: LockedTotals,
): boolean {
  // Totals are optional so a caller with none is not silently told a pool is
  // unused: with nothing to check against, this filter keeps everything.
  if (active.has('inUse') && totals && !inUse(signer, totals)) return false;
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
    if (signer.feeBips === null || signer.feeBips > LOW_FEE_BIPS) return false;
  }
  return true;
}

export default function App() {
  const route = useRoute();
  const [active, setActive] = useState<Set<FilterId>>(
    () => new Set(DEFAULT_FILTERS),
  );
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const t = translator(locale);

  const update = useServiceWorker();

  // Whatever is already on the device, replaced by the branch when it answers.
  const { snapshot, stale } = useSnapshot();
  const signerData = snapshot.signers;
  const totals = snapshot.totals;
  const stxOnlyCalculations = snapshot.stxOnlyCalculations;
  const lastUpdate = formatLastUpdate(signerData.generatedAt, locale);
  const lastUpdateStxOnlyCalculations = formatLastUpdate(
    stxOnlyCalculations.generatedAt,
    locale,
  );

  /*
   * Every contract type, archived ones included, because a contract's page has
   * to stay reachable for somebody already staked with it. The lists below are
   * the live ones; `archivedTemplates` is shown apart and much quieter.
   */
  const templates = useMemo(
    () => buildTemplates(signerData.signers),
    [signerData],
  );
  const liveTemplates = useMemo(
    () => templates.filter((template) => !template.profile.archived),
    [templates],
  );
  const archivedTemplates = useMemo(
    () => templates.filter((template) => template.profile.archived),
    [templates],
  );

  /*
   * The pools this page is about. A pool on an archived contract is not one of
   * them: the operator has redeployed and moved on, and a reader choosing
   * where to stake should not be sent somewhere nobody is being sent any more.
   * It keeps its own page, and the archived section says how many there are.
   */
  const live = useMemo(
    () => signerData.signers.filter((signer) => !isArchived(signer)),
    [signerData],
  );

  const shown = useMemo(() => {
    const matching = live.filter((s) => matches(s, active, totals));
    // Biggest first: the list is easier to read when the pools people
    // actually use are at the top.
    return [...matching].sort((a, b) => {
      const left = BigInt(totals.ustx[a.contractId] ?? 0);
      const right = BigInt(totals.ustx[b.contractId] ?? 0);
      return right > left ? 1 : right < left ? -1 : 0;
    });
  }, [active, live, totals]);

  useEffect(() => {
    applyLocaleMetadata(locale);
  }, [locale]);

  const contractIds = live.map((s) => s.contractId);
  const staked = sumUstx(contractIds, totals.ustx);
  // The cycle now filling, when the refresh could read it. Left out rather
  // than shown as unchanged: "the same as this cycle" is a claim of its own.
  const stakedNext = totals.next
    ? sumUstx(contractIds, totals.next.ustx)
    : null;

  if (route.name === 'contract') {
    const template = templateFor(templates, route.profileId);
    if (template) {
      return (
        <>
          <ContractPage
            template={template}
            lockedUstx={totals.ustx}
            locale={locale}
            onLocaleChange={setLocale}
          />
          <UpdateBanner update={update} locale={locale} />
        </>
      );
    }
  }

  if (route.name === 'status') {
    return (
      <>
        <StatusPage
          principals={route.principals}
          signers={signerData.signers}
          locale={locale}
          onLocaleChange={setLocale}
        />
        <UpdateBanner update={update} locale={locale} />
      </>
    );
  }

  if (route.name === 'myRewards') {
    return (
      <>
        <MyRewardsPage
          address={route.address}
          signers={signerData.signers}
          locale={locale}
          onLocaleChange={setLocale}
        />
        <UpdateBanner update={update} locale={locale} />
      </>
    );
  }

  if (route.name === 'stxOnlyHistory') {
    return (
      <>
        <StxOnlyHistoryPage locale={locale} onLocaleChange={setLocale} />
        <UpdateBanner update={update} locale={locale} />
      </>
    );
  }

  if (route.name === 'stxOnlyRewards') {
    return (
      <>
        <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <a
              href='#/'
              className='text-sm font-semibold text-grape underline underline-offset-2'
            >
              {t('app.stxOnlyEstimate.back')}
            </a>
            <LocaleSwitch locale={locale} onChange={setLocale} />
          </div>

          <StxOnlyRewardsEstimate
            calculations={stxOnlyCalculations}
            locale={locale}
            mode='full'
            asOf={lastUpdateStxOnlyCalculations}
          />
        </main>
        <UpdateBanner update={update} locale={locale} />
      </>
    );
  }

  if (route.name === 'signer') {
    // A link to a pool that has since gone from the data falls through to the
    // list rather than to an error: the pool is not there, and the list is
    // what somebody who wanted it should be looking at.
    const group = groupForContract(signerData.signers, route.contractId);
    const signer = group?.contracts.find(
      (contract) => contract.contractId === route.contractId,
    );
    if (group && signer) {
      return (
        <>
          <SignerPage
            signer={signer}
            group={group}
            slug={signerSlug(group)}
            locale={locale}
            onLocaleChange={setLocale}
          />
          <UpdateBanner update={update} locale={locale} />
        </>
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

  const total = live.length;
  // The keys are checked, not cast: a filter added without its copy is a
  // build error rather than a raw key on a button.
  const filters = FILTER_IDS.map((id) => {
    const label: MessageKey = `filter.${id}.label`;
    const help: MessageKey = `filter.${id}.help`;
    return { id, label: t(label), help: t(help) };
  });
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
          {/* The guide's own mark leads, and Fast Pool is named beside it.
              A guide that lists Fast Pool among forty-four other pools should
              not wear Fast Pool's glyph as its only identity — but it is a
              Fast Pool project, so the byline stays. */}
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1 self-start'>
            <span className='flex items-center gap-2 text-base font-extrabold text-ink'>
              <Mark className='h-9 w-9 shrink-0 rounded-xl bg-grape p-1.5 text-on-grape' />
              Signer Guide
            </span>
            <a
              href={FASTPOOL_URL}
              className='flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-grape'
            >
              {t('app.by')}
              <img
                src='/fastpool-logo.svg'
                alt=''
                width='18'
                height='18'
                className='rounded-md bg-fastpool'
              />
              Fast Pool
            </a>
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            {/* The one question this guide could not answer until now: not
                which pool to pick, but where your own STX already is. It was
                below the pool list, which is the last place somebody arriving
                with that question would look. */}
            <a
              href={statusHref()}
              className='rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink shadow-lift transition-colors hover:bg-grape-soft'
            >
              {t('status.open')}
            </a>
            <a
              href={myRewardsHref()}
              className='rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink shadow-lift transition-colors hover:bg-grape-soft'
            >
              {t('myRewards.open')}
            </a>
            <LocaleSwitch locale={locale} onChange={setLocale} />
          </div>
        </div>
        <h1 className='text-4xl font-extrabold md:text-5xl'>
          {t('app.heading')}
        </h1>
        <p className='text-lg text-muted'>
          {t.rich('app.intro', {
            pools: (
              <strong className='text-ink'>
                {t('app.introPools', { count: total })}
              </strong>
            ),
            contracts: (
              <strong className='text-ink'>
                {t('app.introContracts', { count: liveTemplates.length })}
              </strong>
            ),
          })}
        </p>
        {staked !== null && (
          <p className='text-lg text-muted'>
            {t.rich('app.staked', {
              amount: (
                <strong className='text-ink'>
                  {stxLabel(staked.toString(), locale)}
                </strong>
              ),
              cycle: totals.cycle,
            })}
          </p>
        )}
        {stakedNext !== null && totals.next && (
          <p className='text-lg text-muted'>
            {t.rich('app.stakedNext', {
              amount: (
                <strong className='text-ink'>
                  {stxLabel(stakedNext.toString(), locale)}
                </strong>
              ),
              cycle: totals.next.cycle,
            })}
          </p>
        )}
      </header>

      <StxOnlyRewardsEstimate
        calculations={stxOnlyCalculations}
        locale={locale}
        mode='compact'
        compactVariant={STX_COMPACT_VARIANT}
        detailsHref={stxOnlyRewardsHref()}
        asOf={lastUpdateStxOnlyCalculations}
      />

      <section className='mt-10' aria-labelledby='contracts-heading'>
        <h2 id='contracts-heading' className='text-2xl font-bold'>
          {t('app.contractsHeading')}
        </h2>
        <p className='mt-1 text-muted'>{t('app.contractsIntro')}</p>
        <ul className='mt-4 grid gap-3 sm:grid-cols-2'>
          {liveTemplates.map((template) => {
            const profile = localizeProfile(template.profile, locale);
            return (
              <li key={template.profile.id}>
                <a
                  href={contractHref(template.profile.id)}
                  className='flex h-full flex-col rounded-3xl bg-card p-5 shadow-lift transition-colors hover:bg-grape-soft'
                >
                  <span className='flex items-center gap-2 text-lg font-bold'>
                    <Identicon hash={template.identiconHash} locale={locale} />
                    {profile.name}
                  </span>
                  <span className='text-sm text-muted'>
                    {t.plural('app.poolCount', template.signers.length)}
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

      {/*
        Archived types, below the live ones and deliberately plainer: no
        identicon, no card, no invitation to click through and choose. They are
        here because a contract somebody is staked with should never vanish
        from the page that describes it — not because anybody should be picking
        one today.
      */}
      {archivedTemplates.length > 0 && (
        <section className='mt-8' aria-labelledby='archived-heading'>
          <h3 id='archived-heading' className='text-lg font-bold text-muted'>
            {t('app.archivedHeading')}
          </h3>
          <p className='mt-1 text-sm text-muted'>{t('app.archivedIntro')}</p>
          <ul className='mt-2 space-y-1 text-sm'>
            {archivedTemplates.map((template) => (
              <li key={template.profile.id}>
                <a
                  href={contractHref(template.profile.id)}
                  className='text-muted underline underline-offset-4 transition-colors hover:text-grape'
                >
                  {localizeProfile(template.profile, locale).name}
                </a>
                <span className='text-muted'>
                  {' — '}
                  {t.plural('app.poolCount', template.signers.length)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className='mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted'>
        <span className='inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 font-bold text-ink shadow-lift'>
          {/* Amber, not mint, when what is on screen is a saved copy. */}
          <span
            className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-warm' : 'bg-mint'}`}
            aria-hidden='true'
          />
          {t('app.lastUpdate', { at: lastUpdate })}
        </span>
        <span>{stale ? t('app.savedCopy') : t('app.refreshNote')}</span>
      </p>

      <section className='mt-12' aria-labelledby='filters-heading'>
        <h2 id='filters-heading' className='text-2xl font-bold'>
          {t('app.allPools')}
        </h2>
        <p className='mt-1 text-sm font-bold text-muted'>
          {t('app.whatMatters')}
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
                    ? 'bg-grape text-on-grape'
                    : 'bg-card text-ink shadow-lift hover:bg-grape-soft'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <ul className='mt-3 space-y-1 text-sm text-muted'>
          {filters
            .filter((f) => active.has(f.id))
            .map((f) => (
              <li key={f.id}>{f.help}</li>
            ))}
        </ul>
      </section>

      <p className='mt-8 font-semibold'>
        {shown.length === total
          ? t('app.showingAll', { total })
          : t('app.showingSome', { shown: shown.length, total })}
      </p>

      {shown.length === 0 && (
        <p className='mt-4 rounded-3xl bg-card p-6 text-muted shadow-lift'>
          {t('app.noMatch')}
        </p>
      )}

      <ul className='mt-4 space-y-4'>
        {shown.map((signer) => (
          <SignerCard
            key={signer.contractId}
            signer={signer}
            lockedUstx={totals.ustx[signer.contractId]}
            isNew={isNewSigner(signer, totals.cycle)}
            summary={profileSummaryFor(signer.profileId)}
            locale={locale}
          />
        ))}
      </ul>

      <footer className='mt-12 space-y-3 border-t border-hairline pt-6 text-sm text-muted'>
        <p>
          <strong className='text-ink'>{t('app.footer.feesTitle')}</strong>{' '}
          {t.rich('app.footer.fees', {
            capped: <em>{t('app.footer.feesCappedBadge')}</em>,
            notice: <em>{t('app.footer.feesNoticeBadge')}</em>,
          })}
        </p>
        <p>
          {t('app.footer.identity', { at: lastUpdate, cycle: totals.cycle })}
        </p>
        <p>
          {t.rich('app.footer.trust', {
            link: (
              <a
                className='font-semibold text-grape underline underline-offset-2'
                href={REPO_URL}
                target='_blank'
                rel='noreferrer'
              >
                {t('app.footer.trustLink')}
              </a>
            ),
          })}
        </p>
        <p>
          {t.rich('app.footer.madeBy', {
            link: (
              <a
                className='font-semibold text-grape underline underline-offset-2'
                href={FASTPOOL_URL}
              >
                Fast Pool
              </a>
            ),
          })}
        </p>
      </footer>

      <UpdateBanner update={update} locale={locale} />
    </main>
  );
}
