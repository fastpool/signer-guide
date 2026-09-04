import { useEffect, useMemo, useState } from 'react';
import ContractPage from './components/ContractPage';
import Identicon from './components/Identicon';
import LocaleSwitch from './components/LocaleSwitch';
import Mark from './components/Mark';
import SignerCard from './components/SignerCard';
import SignerGroupPage from './components/SignerGroupPage';
import SignerGroupsPage from './components/SignerGroupsPage';
import SignerPage from './components/SignerPage';
import StxOnlyHistoryPage from './components/StxOnlyHistoryPage';
import StxOnlyRewardsEstimate from './components/StxOnlyRewardsEstimate';
import StatusPage from './components/StatusPage';
import Chrome from './components/Chrome';
import HowToStakePage from './components/HowToStakePage';
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
  groupsHref,
  howToHref,
  statusHref,
  stxOnlyRewardsHref,
  useRoute,
} from './lib/route';
import { groupById } from './lib/signer-groups';
import { nodeForContract, signerSlug } from './lib/signer-nodes';
import { inUse, isNewSigner } from './lib/activity';
import { useServiceWorker } from './lib/service-worker';
import { isArchived } from './lib/profiles';
import { buildTemplates, templateFor } from './lib/templates';
import {
  DEFAULT_FILTERS,
  FILTER_IDS,
  matches as poolMatches,
  type FilterId,
} from './lib/pool-filters';
import type { LockedTotals, SignerData } from './lib/types';

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';

/** Switch compact STX rewards style: 'original' or 'weekly'. */
const STX_COMPACT_VARIANT: 'original' | 'weekly' = 'weekly';

/*
 * The filters themselves live in `lib/pool-filters.ts`, with the phone app —
 * a fee of 95% is a fee of 95% on either screen. What stays here is the
 * page: which chips, in which order, with which copy.
 */
export { matches, type FilterId } from './lib/pool-filters';

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

  /*
   * What the opening line counts.
   *
   * "There are N pools to choose from today" is a claim about choosing, so it
   * counts what somebody could choose: pools in use, on contract types nobody
   * has replaced. Counting every registered signer put a third of them in that
   * sentence that hold nothing and never have — a number a reader then went
   * looking for in a list the default filter had already taken them out of.
   *
   * The contracts are counted off those same pools rather than off the whole
   * of profiles.json, because the sentence says the pools it just counted run
   * only these — which is only true of the ones they actually run.
   */
  const choosable = useMemo(
    () => live.filter((signer) => inUse(signer, totals)),
    [live, totals],
  );
  const choosableTemplates = useMemo(() => {
    const running = new Set(
      choosable.map((signer) => signer.profileId).filter((id) => id !== null),
    );
    return liveTemplates.filter((template) => running.has(template.profile.id));
  }, [choosable, liveTemplates]);

  const shown = useMemo(() => {
    const matching = live.filter((s) => poolMatches(s, active, totals));
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

  /**
   * Which page this is, and nothing about what surrounds it.
   *
   * Every branch below returns a page and only a page. What is on all of
   * them whichever one it is — the wallet bar, the update offer — is
   * `Chrome`, once, around whatever this returns.
   */
  const page = () => {
    if (route.name === 'howTo') {
      return <HowToStakePage locale={locale} onLocaleChange={setLocale} />;
    }

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

    if (route.name === 'status') {
      return (
        <StatusPage
          principals={route.principals}
          signers={signerData.signers}
          locale={locale}
          onLocaleChange={setLocale}
        />
      );
    }

    if (route.name === 'stxOnlyHistory') {
      return (
        <StxOnlyHistoryPage locale={locale} onLocaleChange={setLocale} />
      );
    }

    if (route.name === 'stxOnlyRewards') {
      return (
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
      );
    }

    if (route.name === 'groups') {
      return (
        <SignerGroupsPage
          signers={signerData.signers}
          totals={totals}
          locale={locale}
          onLocaleChange={setLocale}
        />
      );
    }

    if (route.name === 'group') {
      // Same rule as a pool that has gone: a group id nobody wrote lands on the
      // list, which is the page somebody who followed that link wanted.
      const group = groupById(route.groupId);
      if (group) {
        return (
          <SignerGroupPage
            group={group}
            signers={signerData.signers}
            totals={totals}
            locale={locale}
            onLocaleChange={setLocale}
          />
        );
      }
    }

    if (route.name === 'signer') {
      // A link to a pool that has since gone from the data falls through to the
      // list rather than to an error: the pool is not there, and the list is
      // what somebody who wanted it should be looking at.
      const node = nodeForContract(signerData.signers, route.contractId);
      const signer = node?.contracts.find(
        (contract) => contract.contractId === route.contractId,
      );
      if (node && signer) {
        return (
          <SignerPage
            signer={signer}
            node={node}
            slug={signerSlug(node)}
            totals={totals}
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
              {/* First, and the only one of these in solid grape. Everything
                  else on this page is for a reader who has staked before; this
                  is the one link for a reader who has not, and it should not
                  have to be found among the others. */}
              <a
                href={howToHref()}
                className='rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink shadow-lift transition-colors hover:bg-grape-soft'
              >
                {t('howTo.open')}
              </a>
              {/* The one question this guide could not answer until now: not
                  which pool to pick, but where your own STX already is — and,
                  since the rewards page was folded into it, what it has earned
                  there. Two buttons for one address was the reader being asked
                  to guess which half of the answer they wanted first. */}
              <a
                href={statusHref()}
                className='rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink shadow-lift transition-colors hover:bg-grape-soft'
              >
                {t('status.open')}
              </a>
              {/* The list below is forty-odd pools read one at a time. This is
                  the same set read the other way round — by who is behind them —
                  and it is the only page that answers what a reader worried
                  about the signer set is actually asking. */}
              <a
                href={groupsHref()}
                className='rounded-full bg-card px-4 py-2 text-sm font-semibold text-ink shadow-lift transition-colors hover:bg-grape-soft'
              >
                {t('groups.open')}
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
                  {t('app.introPools', { count: choosable.length })}
                </strong>
              ),
              contracts: (
                <strong className='text-ink'>
                  {t('app.introContracts', { count: choosableTemplates.length })}
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
      </main>
    );
  };

  return (
    <Chrome update={update} locale={locale}>
      {page()}
    </Chrome>
  );
}
