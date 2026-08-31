import { stxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import { groupHref, groupsHref, signerHref } from '../lib/route';
import {
  allGroups,
  groupContracts,
  groupNodes,
  groupUstx,
  groupVotingPowerBips,
  groupsForContract,
  type SignerGroup,
} from '../lib/signer-groups';
import { answeredRate, neverAnswered, performanceFor } from '../lib/performance';
import { votingPowerBips } from '../lib/signer-nodes';
import type { LockedTotals, Signer } from '../lib/types';
import Identicon from './Identicon';
import LocaleSwitch from './LocaleSwitch';
import PoolName from './PoolName';

/**
 * One entity, and every signer node behind it.
 *
 * The page the guide was missing. A reader could see that a pool held four
 * percent and never that the company running it holds four more under two
 * other keys — which is the only version of the number that answers "who can
 * move the signer set". Nothing on chain says who is behind a key, so this
 * page is drawn from `src/data/signer-groups.json`, written by hand, and it
 * shows its evidence rather than asking to be believed.
 *
 * The per-node rows are the check on the total. A reader who disagrees with
 * the grouping can see exactly which nodes were added together and take the
 * ones they accept.
 */
export default function SignerGroupPage({
  group,
  signers,
  totals,
  locale,
  onLocaleChange,
}: {
  group: SignerGroup;
  signers: Signer[];
  totals: LockedTotals;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const nodes = groupNodes(group, signers);
  const contracts = groupContracts(group, signers);
  const bips = groupVotingPowerBips(group, signers, totals.ustx);
  const staked = groupUstx(group, signers, totals.ustx);

  /*
   * Whether the group takes the whole of a key or one contract on it. It is
   * the difference between "Xverse signs with this" and "Stacking DAO's money
   * sits in this", and the row says which rather than leaving a reader to
   * infer it from the kind of the group.
   */
  const wholeKey = (signerKey: string | null) =>
    signerKey !== null &&
    group.members.some((member) => member.signerKey === signerKey);

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('group.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-4xl font-extrabold md:text-5xl'>
        {group.name}
      </h1>
      <p className='mt-4 text-lg text-muted'>{group.summary}</p>

      <p className='mt-3 text-sm font-semibold text-ink'>
        {t(`group.kind.${group.kind}`)}
      </p>
      <p className='mt-1 text-sm text-muted'>
        {t(`group.kindNote.${group.kind}`)}
      </p>

      {group.url && (
        <p className='mt-3 text-sm'>
          <a
            className='font-semibold text-grape underline underline-offset-2'
            href={group.url}
            target='_blank'
            rel='noreferrer'
          >
            {t('group.site')} ↗
          </a>
        </p>
      )}

      <dl className='mt-8 rounded-3xl bg-card p-6 text-sm shadow-lift'>
        <div className='flex flex-wrap items-baseline justify-between gap-3'>
          <dt className='text-muted'>{t('group.votingPower')}</dt>
          <dd className='text-2xl font-extrabold text-ink'>
            {bips === null
              ? t('group.unknownAmount')
              : t('group.votingPowerValue', {
                  percent: (bips / 100).toFixed(2),
                  cycle: totals.cycle.toLocaleString(t.bundle.intlLocale),
                })}
          </dd>
        </div>
        <div className='mt-2 flex flex-wrap items-baseline justify-between gap-3'>
          <dt className='text-muted'>{t('group.staked')}</dt>
          <dd className='font-semibold text-ink'>
            {staked === null
              ? t('group.unknownAmount')
              : stxLabel(staked.toString(), locale)}
          </dd>
        </div>
        <div className='mt-2 flex flex-wrap items-baseline justify-between gap-3'>
          <dt className='text-muted'>{t('group.nodeCount')}</dt>
          <dd className='font-semibold text-ink'>
            {nodes.length.toLocaleString(t.bundle.intlLocale)}
          </dd>
        </div>
        <div className='mt-2 flex flex-wrap items-baseline justify-between gap-3'>
          <dt className='text-muted'>{t('group.contractCount')}</dt>
          <dd className='font-semibold text-ink'>
            {contracts.length.toLocaleString(t.bundle.intlLocale)}
          </dd>
        </div>
      </dl>

      <section className='mt-8'>
        <h2 className='text-lg font-bold'>{t('group.contracts')}</h2>
        <ul className='mt-3 space-y-3'>
          {nodes.map((node) => {
            const nodeBips = votingPowerBips(node, totals.ustx);
            const whole = wholeKey(node.signerKey);
            const conduct = performanceFor(node.signerKey);
            return (
              <li
                key={node.signerKey ?? node.contracts[0].contractId}
                className='rounded-3xl bg-card p-5 shadow-lift'
              >
                <div className='flex flex-wrap items-baseline justify-between gap-3'>
                  <p className='break-all font-mono text-xs text-muted'>
                    {node.signerKey ?? node.contracts[0].contractId}
                  </p>
                  <p className='text-sm font-bold text-ink'>
                    {nodeBips === null
                      ? t('group.unknownAmount')
                      : `${(nodeBips / 100).toFixed(2)}%`}
                  </p>
                </div>

                {/*
                  What the weight above does not say. A group's share of the
                  vote is a claim about what it could carry; this is whether
                  the nodes carrying it turn up, and it belongs on the same
                  row rather than one page further in.
                */}
                {conduct && (
                  <p className='text-xs text-muted'>
                    {neverAnswered(conduct)
                      ? t('group.nodeSilent', { cycle: conduct.cycle })
                      : t('group.nodeAnswered', {
                          percent:
                            answeredRate(conduct) === null
                              ? '—'
                              : ((answeredRate(conduct) as number) * 100).toFixed(1),
                          cycle: conduct.cycle,
                        })}
                  </p>
                )}

                <ul className='mt-2 space-y-1'>
                  {node.contracts.map((contract) => {
                    const also = groupsForContract(
                      contract.contractId,
                      contract.signerKey,
                    ).filter((other) => other.id !== group.id);
                    return (
                      <li key={contract.contractId} className='text-sm'>
                        <div className='flex flex-wrap items-baseline justify-between gap-2'>
                          <a
                            className='flex items-center gap-2 font-semibold text-grape underline underline-offset-2'
                            href={signerHref(contract.contractId)}
                          >
                            <Identicon
                              hash={contract.identiconHash}
                              locale={locale}
                              className='h-5 w-5'
                            />
                            <PoolName signer={contract} locale={locale} />
                          </a>
                          <span className='font-semibold text-ink'>
                            {stxLabel(
                              totals.ustx[contract.contractId] ?? null,
                              locale,
                            )}
                          </span>
                        </div>
                        {also.length > 0 && (
                          <p className='text-xs text-muted'>
                            {t('group.alsoIn', {
                              names: also.map((o) => o.name).join(', '),
                            })}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <p className='mt-2 text-xs text-muted'>
                  {whole ? t('group.wholeNode') : t('group.contractOnly')}
                </p>
              </li>
            );
          })}
        </ul>
        <p className='mt-3 text-xs text-muted'>{t('group.overlapNote')}</p>
      </section>

      <section className='mt-8 rounded-3xl bg-grape-soft/40 p-5'>
        <h2 className='text-lg font-bold'>{t('group.source')}</h2>
        <p className='mt-2 text-sm text-ink'>{group.source}</p>
        <p className='mt-2 text-xs text-muted'>{t('group.sourceNote')}</p>
        {group.members.some((member) => member.note) && (
          <ul className='mt-3 space-y-1 text-xs text-muted'>
            {group.members
              .filter((member) => member.note)
              .map((member) => (
                <li key={member.contractId ?? member.signerKey}>
                  <span className='font-mono'>
                    {(member.contractId ?? member.signerKey ?? '').split('.')[1] ??
                      member.signerKey}
                  </span>{' '}
                  — {member.note}
                </li>
              ))}
          </ul>
        )}
      </section>

      <nav className='mt-8 flex flex-wrap gap-3 text-sm'>
        {/* The index first: a reader who has read one group's evidence is
            usually asking who else there is, not which sibling to click. */}
        <a
          className='rounded-full bg-grape px-4 py-2 font-semibold text-on-grape shadow-lift'
          href={groupsHref()}
        >
          {t('groups.open')}
        </a>
        {allGroups()
          .filter((other) => other.id !== group.id)
          .map((other) => (
            <a
              key={other.id}
              className='rounded-full bg-card px-4 py-2 font-semibold text-ink shadow-lift'
              href={groupHref(other.id)}
            >
              {other.name}
            </a>
          ))}
      </nav>
    </main>
  );
}
