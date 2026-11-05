import { useEffect, useMemo, useState } from 'react';
import BondsPage from './components/BondsPage';
import Chrome from './components/Chrome';
import ContractPage from './components/ContractPage';
import ContractsPage from './components/ContractsPage';
import HomePage from './components/HomePage';
import HowToStakePage from './components/HowToStakePage';
import SignerGroupPage from './components/SignerGroupPage';
import SignerGroupsPage from './components/SignerGroupsPage';
import SignerPage from './components/SignerPage';
import StatusPage from './components/StatusPage';
import StxOnlyHistoryPage from './components/StxOnlyHistoryPage';
import StxOnlyRewardsEstimate from './components/StxOnlyRewardsEstimate';
import { Breadcrumbs, Page } from './components/ui';
import { useSnapshot } from './lib/data-source';
import {
  detectLocale,
  formatLastUpdate,
  translator,
  type Locale,
} from './lib/i18n';
import { applyLocaleMetadata } from './lib/metadata';
import { isArchived } from './lib/profiles';
import { useRoute } from './lib/route';
import { groupById } from './lib/signer-groups';
import { nodeForContract, signerSlug } from './lib/signer-nodes';
import { useServiceWorker } from './lib/service-worker';
import { buildTemplates, templateFor } from './lib/templates';

/*
 * The filters themselves live in `lib/pool-filters.ts`, with the phone app —
 * a fee of 95% is a fee of 95% on either screen. What stays on the page is
 * which chips, in which order, with which copy: see `PoolList`.
 */
export { matches, type FilterId } from './lib/pool-filters';

export default function App() {
  const route = useRoute();
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const t = translator(locale);

  const update = useServiceWorker();

  // Whatever is already on the device, replaced by the branch when it answers.
  const { snapshot, stale } = useSnapshot();
  const signerData = snapshot.signers;
  const totals = snapshot.totals;
  const stxOnlyCalculations = snapshot.stxOnlyCalculations;
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

  useEffect(() => {
    applyLocaleMetadata(locale);
  }, [locale]);

  /**
   * Which page this is, and nothing about what surrounds it.
   *
   * Every branch below returns a page and only a page. What is on all of
   * them whichever one it is — the header, the stale-data warning, the
   * wallet bar, the update offer — is `Chrome`, once, around whatever this
   * returns.
   */
  const page = () => {
    if (route.name === 'howTo') {
      return <HowToStakePage locale={locale} />;
    }

    if (route.name === 'contract') {
      const template = templateFor(templates, route.profileId);
      if (template) {
        return (
          <ContractPage
            template={template}
            lockedUstx={totals.ustx}
            locale={locale}
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
        />
      );
    }

    if (route.name === 'bonds') {
      return (
        <BondsPage
          signers={signerData.signers}
          totals={totals}
          locale={locale}
        />
      );
    }

    if (route.name === 'stxOnlyHistory') {
      return <StxOnlyHistoryPage locale={locale} />;
    }

    if (route.name === 'stxOnlyRewards') {
      return (
        <Page>
          <Breadcrumbs
            items={[
              { label: t('nav.pools'), href: '#/' },
              { label: t('app.stxOnlyEstimate.title') },
            ]}
          />
          <StxOnlyRewardsEstimate
            calculations={stxOnlyCalculations}
            locale={locale}
            mode='full'
            asOf={lastUpdateStxOnlyCalculations}
          />
        </Page>
      );
    }

    if (route.name === 'groups') {
      return (
        <SignerGroupsPage
          signers={signerData.signers}
          totals={totals}
          locale={locale}
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
            calculations={stxOnlyCalculations}
            locale={locale}
          />
        );
      }
    }

    if (route.name === 'contracts') {
      return (
        <ContractsPage
          liveTemplates={liveTemplates}
          archivedTemplates={archivedTemplates}
          totals={totals}
          locale={locale}
        />
      );
    }

    return (
      <HomePage
        signerData={signerData}
        live={live}
        liveTemplates={liveTemplates}
        totals={totals}
        stxOnlyCalculations={stxOnlyCalculations}
        savedCopy={stale}
        locale={locale}
      />
    );
  };

  return (
    <Chrome
      route={route}
      signers={signerData.signers}
      update={update}
      locale={locale}
      onLocaleChange={setLocale}
      generatedAt={signerData.generatedAt}
      savedCopy={stale}
    >
      {page()}
    </Chrome>
  );
}
