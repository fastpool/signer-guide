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
import LocaleSwitch from './LocaleSwitch';

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
  onLocaleChange,
}: {
  signers: Signer[];
  totals: LockedTotals;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
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
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('groups.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-4xl font-extrabold md:text-5xl'>
        {t('groups.heading')}
      </h1>
      <p className='mt-4 text-lg text-muted'>{t('groups.intro')}</p>
      <p className='mt-2 text-sm text-muted'>
        {t('groups.asOf', {
          cycle: totals.cycle.toLocaleString(t.bundle.intlLocale),
        })}
      </p>

      <ul className='mt-8 space-y-3'>
        {rows.map(({ group, bips, staked, nodes, contracts }) => (
          <li key={group.id}>
            <a
              href={groupHref(group.id)}
              className='flex flex-col rounded-3xl bg-card p-5 shadow-lift transition-colors hover:bg-grape-soft'
            >
              <div className='flex flex-wrap items-baseline justify-between gap-3'>
                <span className='text-lg font-bold text-ink'>{group.name}</span>
                <span className='text-lg font-extrabold text-ink'>
                  {bips === null
                    ? t('group.unknownAmount')
                    : `${(bips / 100).toFixed(2)}%`}
                </span>
              </div>
              <span className='text-sm font-semibold text-grape'>
                {t(`group.kind.${group.kind}`)}
              </span>
              <span className='mt-2 text-sm text-muted'>{group.summary}</span>
              <span className='mt-2 text-xs text-muted'>
                {t('groups.counts', {
                  nodes: nodes.toLocaleString(t.bundle.intlLocale),
                  contracts: contracts.toLocaleString(t.bundle.intlLocale),
                  staked:
                    staked === null
                      ? t('group.unknownAmount')
                      : stxLabel(staked.toString(), locale),
                })}
              </span>
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
        <li>
          <div className='flex flex-col rounded-3xl border border-dashed border-muted/40 p-5'>
            <div className='flex flex-wrap items-baseline justify-between gap-3'>
              <span className='text-lg font-bold text-muted'>
                {t('groups.ungrouped')}
              </span>
              <span className='text-lg font-extrabold text-muted'>
                {rest.bips === null
                  ? t('group.unknownAmount')
                  : `${(rest.bips / 100).toFixed(2)}%`}
              </span>
            </div>
            <span className='mt-2 text-sm text-muted'>
              {t('groups.ungroupedNote')}
            </span>
            <span className='mt-2 text-xs text-muted'>
              {t('groups.ungroupedCounts', {
                contracts: rest.contracts.toLocaleString(t.bundle.intlLocale),
                staked:
                  rest.staked === null
                    ? t('group.unknownAmount')
                    : stxLabel(rest.staked.toString(), locale),
              })}
            </span>
          </div>
        </li>
      </ul>

      <section className='mt-8 rounded-3xl bg-grape-soft/40 p-5'>
        <h2 className='text-lg font-bold'>{t('groups.sourceHeading')}</h2>
        <p className='mt-2 text-sm text-ink'>{t('group.sourceNote')}</p>
        <p className='mt-2 text-xs text-muted'>{t('group.overlapNote')}</p>
      </section>
    </main>
  );
}
