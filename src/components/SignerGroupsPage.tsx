import Badge from './Badge';
import { Page, PageHeading } from './ui';
import { stxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import { groupHref } from '../lib/route';
import {
  allGroups,
  groupContracts,
  groupNodes,
  groupUstx,
  groupVotingPowerBips,
  ungroupedContracts,
  ungroupedUstx,
  ungroupedVotingPowerBips,
} from '../lib/signer-groups';
import type { LockedTotals, Signer } from '../lib/types';

/**
 * Every group at once, largest share of the vote first.
 *
 * A group page answers "how much does this entity carry"; this one answers the
 * question a reader has after two of them — "who carries the rest". Ordered by
 * weight rather than by the file, because the order is the point: the top of
 * this list is who would have to agree before the signer set could move.
 *
 * The percentages here do not add to a hundred and are not meant to. A node
 * can sit in two groups — an operator signs with a key, an entity that
 * delegated into one contract on it controls that stake — so the same STX can
 * appear twice, and the last row says how much of the cycle nobody here has
 * written down at all.
 */
export default function SignerGroupsPage({
  signers,
  totals,
  locale,
}: {
  signers: Signer[];
  totals: LockedTotals;
  locale: Locale;
}) {
  const t = translator(locale);

  const rows = allGroups()
    .map((group) => ({
      group,
      bips: groupVotingPowerBips(group, signers, totals.ustx),
      staked: groupUstx(group, signers, totals.ustx),
      nodes: groupNodes(group, signers).length,
      contracts: groupContracts(group, signers).length,
    }))
    // Unknown weight last: a group the refresh could not price is not a small
    // one, and putting it at the bottom is the only honest place for it.
    .sort((a, b) => (b.bips ?? -1) - (a.bips ?? -1));

  const rest = {
    bips: ungroupedVotingPowerBips(signers, totals.ustx),
    staked: ungroupedUstx(signers, totals.ustx),
    contracts: ungroupedContracts(signers).length,
  };

  return (
    <Page>
      <PageHeading title={t('groups.heading')} intro={t('groups.intro')} />
      <p className='-mt-3 mb-5 text-sm text-muted'>
        {t('groups.asOf', {
          cycle: totals.cycle.toLocaleString(t.bundle.intlLocale),
        })}
      </p>

      {/*
        One bar per group on the same scale — the whole vote — so the page
        answers "who could move the signer set" at a glance, before anybody
        reads a summary. The summary and the counts stay underneath.
      */}
      <ul
        aria-label={t('groups.chartLabel')}
        className='overflow-hidden rounded-2xl bg-card shadow-lift'
      >
        {rows.map(({ group, bips, staked, nodes, contracts }) => (
          <li
            key={group.id}
            className='border-b border-hairline last:border-b-0'
          >
            <a
              href={groupHref(group.id)}
              className='block p-4 transition-colors hover:bg-card-raised'
            >
              <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
                <span className='flex flex-wrap items-baseline gap-x-2'>
                  <span className='text-lg font-bold text-ink'>
                    {group.name}
                  </span>
                  <Badge tone='fact' size='sm'>
                    {t(`group.kind.${group.kind}`)}
                  </Badge>
                </span>
                <span className='text-lg font-extrabold text-ink tabular-nums'>
                  {bips === null
                    ? t('group.unknownAmount')
                    : `${(bips / 100).toFixed(2)}%`}
                </span>
              </div>
              <div
                aria-hidden='true'
                className='mt-2 h-2.5 overflow-hidden rounded-full bg-trough'
              >
                <div
                  className='h-full rounded-full bg-grape'
                  style={{ width: `${bips === null ? 0 : bips / 100}%` }}
                />
              </div>
              <p className='mt-2 text-sm text-muted'>{group.summary}</p>
              <p className='mt-1 text-xs text-muted'>
                {t('groups.counts', {
                  nodes: nodes.toLocaleString(t.bundle.intlLocale),
                  contracts: contracts.toLocaleString(t.bundle.intlLocale),
                  staked:
                    staked === null
                      ? t('group.unknownAmount')
                      : stxLabel(staked.toString(), locale),
                })}
              </p>
            </a>
          </li>
        ))}
        {/*
          Last, and not a link: it is the one row that is not a claim about
          anybody. Pinned below the groups rather than sorted in among them —
          it would land fifth today, and a reader scanning for who holds the
          vote should not meet "nobody has written this down" mid-list as
          though it were an entity. Kept as a row rather than a footnote
          because it is the size of a large group and belongs in the same
          column of percentages as the rest.
        */}
        <li className='bg-card-raised/50 p-4'>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <span className='text-lg font-bold text-muted'>
              {t('groups.ungrouped')}
            </span>
            <span className='text-lg font-extrabold text-muted tabular-nums'>
              {rest.bips === null
                ? t('group.unknownAmount')
                : `${(rest.bips / 100).toFixed(2)}%`}
            </span>
          </div>
          <div
            aria-hidden='true'
            className='mt-2 h-2.5 overflow-hidden rounded-full bg-trough'
          >
            <div
              className='h-full rounded-full bg-faint'
              style={{ width: `${rest.bips === null ? 0 : rest.bips / 100}%` }}
            />
          </div>
          <p className='mt-2 text-sm text-muted'>{t('groups.ungroupedNote')}</p>
          <p className='mt-1 text-xs text-muted'>
            {t('groups.ungroupedCounts', {
              contracts: rest.contracts.toLocaleString(t.bundle.intlLocale),
              staked:
                rest.staked === null
                  ? t('group.unknownAmount')
                  : stxLabel(rest.staked.toString(), locale),
            })}
          </p>
        </li>
      </ul>

      <section className='mt-6 rounded-2xl bg-grape-soft/40 p-4 sm:p-5'>
        <h2 className='text-lg font-bold'>{t('groups.sourceHeading')}</h2>
        <p className='mt-2 text-sm text-ink'>{t('group.sourceNote')}</p>
        <p className='mt-2 text-xs text-muted'>{t('group.overlapNote')}</p>
      </section>
    </Page>
  );
}
