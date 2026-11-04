import { useState } from 'react';
import {
  satsLabel,
  sbtcCompact,
  stxCompact,
  stxLabel,
  usdCompact,
} from '../lib/amounts';
import { countdownParts, cycleTiming } from '../lib/cycle-timing';
import { explorerUrl } from '../lib/explorer';
import { bitcoinPayout } from '../lib/features';
import { translator, type Locale } from '../lib/i18n';
import { joinMode, poolWarnings, stakesHere } from '../lib/pool-facts';
import { isHighFee } from '../lib/pool-filters';
import {
  afterFee,
  cycleRates,
  isBondPool,
  netApyPercent,
  poolEarnings,
} from '../lib/pool-yield';
import { pricesFrom, satsInUsd, ustxInUsd } from '../lib/prices';
import { useStxOnlyHistory } from '../lib/stx-only-history';
import { contractTypeName, localizeProfile } from '../lib/profile-i18n';
import { profileFor } from '../lib/profiles';
import { contractHref, groupHref, signerHref, statusHref } from '../lib/route';
import { groupsForNode } from '../lib/signer-groups';
import {
  cycleStanding,
  nodeUstx,
  shareBips,
  sumCycleUstx,
  votingPowerBips,
  type SignerNode,
} from '../lib/signer-nodes';
import {
  useCycleMembers,
  useSignerHistory,
  type Remote,
} from '../lib/signer-history';
import { ellipsedAddr, shortPrincipal } from '../lib/strings';
import type {
  LockedTotals,
  Signer,
  SignerCycleSummary,
  SignerHistory,
  StxOnlyCalculations,
} from '../lib/types';
import Badge, { feeLabel, feePercent, noticeLabel } from './Badge';
import { countdown } from './CycleTimeline';
import Identicon from './Identicon';
import { JoinTag, RewardTags } from './PoolList';
import PoolName from './PoolName';
import SignerConductSection from './SignerConductSection';
import StakeModal from './StakeModal';
import {
  Alert,
  Breadcrumbs,
  Card,
  FactGrid,
  InfoTip,
  Page,
  SectionNav,
  type Fact,
} from './ui';

/**
 * One deployed signer contract: should I stake here, and who already has?
 *
 * The page used to be one long column of boxes, each opening with a
 * paragraph, so the fee was a badge near the top, the operator was three
 * boxes down and how much was staked was at the bottom. Now it answers in the
 * order a reader asks:
 *
 *   1. what to do — stake, or check a stake — beside the name
 *   2. anything that could go wrong, in a box of its own, only when there is
 *   3. the eight facts every pool is compared on, always in the same cells
 *   4. then the detail: members, rewards, signing, the key, the code
 *
 * Most of the detail is about the signer rather than the contract, because a
 * signer key can have several contracts registered against it and the stake,
 * the weight and the slots are decided on all of them together.
 */
export default function SignerPage({
  signer,
  node,
  slug,
  totals,
  calculations,
  locale,
}: {
  signer: Signer;
  /** The signer this contract belongs to, siblings included. */
  node: SignerNode;
  slug: string;
  /** Every pool's amount for the cycle: the denominator of a weight. */
  totals: LockedTotals;
  /** The rate, the prices and the cycle geometry, from the last refresh. */
  calculations: StxOnlyCalculations;
  locale: Locale;
}) {
  const t = translator(locale);
  const [address, name] = signer.contractId.split('.');
  const history = useSignerHistory(slug);
  const groups = groupsForNode(node);
  const group = groups[0] ?? null;
  const warnings = poolWarnings(signer);

  return (
    <Page wide>
      <Breadcrumbs
        items={[
          { label: t('nav.pools'), href: '#/' },
          // Not the group: its page lives under "Who holds the vote", and a
          // trail through it would say otherwise. "Run by" links it instead.
          { label: <PoolName signer={signer} locale={locale} /> },
        ]}
      />

      <div className='flex flex-wrap items-center gap-x-4 gap-y-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <Identicon
            hash={signer.identiconHash}
            locale={locale}
            className='h-11 w-11 md:h-13 md:w-13'
          />
          <div className='min-w-0'>
            <h1 className='text-2xl leading-tight font-extrabold md:text-3xl'>
              <PoolName signer={signer} locale={locale} />
            </h1>
            <a
              className='font-mono text-xs break-all text-muted underline decoration-hairline underline-offset-2 hover:text-grape'
              href={explorerUrl(signer.contractId)}
              target='_blank'
              rel='noreferrer'
            >
              {ellipsedAddr(address)}.{name}
            </a>
          </div>
        </div>
        <div className='flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto'>
          {stakesHere(signer) ? (
            <StakeModal
              signer={signer}
              locale={locale}
              variant={warnings.includes('highFee') ? 'secondary' : 'primary'}
            />
          ) : (
            <span className='text-xs text-muted'>
              {t(
                joinMode(signer) === 'nativePool'
                  ? 'pool.stakeElsewhere'
                  : 'signer.customCalls',
              )}
            </span>
          )}
          <a
            href={statusHref()}
            className='rounded-full px-4 py-2 text-sm font-semibold text-grape ring-1 ring-grape ring-inset hover:bg-grape-soft'
          >
            {t('pool.checkStake')}
          </a>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className='mt-4 space-y-2'>
          {warnings.map((warning) => (
            <Alert
              key={warning}
              tone={warning === 'highFee' ? 'bad' : 'warm'}
              title={t(`pool.warning.${warning}.title`)}
            >
              {t(`pool.warning.${warning}.body`, {
                fee: feePercent(signer.feeBips) ?? '',
              })}
            </Alert>
          ))}
        </div>
      )}

      <div className='mt-4'>
        <KeyFacts
          signer={signer}
          node={node}
          totals={totals}
          history={history}
          groupName={group?.name ?? null}
          groupId={group?.id ?? null}
          calculations={calculations}
          locale={locale}
        />
      </div>

      <SectionNav
        sections={[
          // The order a phone stacks them in: the left column, then the right.
          { id: 'members', label: t('pool.section.members') },
          { id: 'key', label: t('pool.section.key') },
          { id: 'rewards', label: t('pool.section.rewards') },
          { id: 'signing', label: t('pool.section.signing') },
          { id: 'contract', label: t('pool.section.contract') },
        ]}
      />

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]'>
        <div className='min-w-0 space-y-4'>
          <MembersCard
            signer={signer}
            node={node}
            slug={slug}
            history={history}
            locale={locale}
          />
          <KeyCard
            signer={signer}
            node={node}
            totals={totals}
            locale={locale}
          />
        </div>
        <div className='min-w-0 space-y-4'>
          <RewardsCard
            signer={signer}
            history={history}
            calculations={calculations}
            locale={locale}
          />
          <SignerConductSection
            signer={signer}
            currentCycle={totals.cycle}
            locale={locale}
          />
          <ContractCard signer={signer} locale={locale} />
        </div>
      </div>
    </Page>
  );
}

/** This contract's members in a cycle, when the history says so. */
function cycleFor(
  history: Remote<SignerHistory>,
  cycle: number,
): SignerCycleSummary | null {
  if (history.state !== 'ready') return null;
  return history.value.cycles.find((entry) => entry.cycle === cycle) ?? null;
}

/**
 * The eight cells, in the same order on every pool.
 *
 * Fee, ceiling, who can join and what rewards arrive in are what a reader
 * compares pools on; how much is staked now and next, the weight that buys,
 * and who is behind it are what they check before trusting one.
 */
function KeyFacts({
  signer,
  node,
  totals,
  history,
  groupName,
  groupId,
  calculations,
  locale,
}: {
  signer: Signer;
  node: SignerNode;
  totals: LockedTotals;
  history: Remote<SignerHistory>;
  groupName: string | null;
  groupId: string | null;
  calculations: StxOnlyCalculations;
  locale: Locale;
}) {
  const t = translator(locale);
  const now = totals.ustx[signer.contractId];
  const next = totals.next?.ustx[signer.contractId];
  const bips = votingPowerBips(node, totals.ustx);
  const several = node.contracts.length > 1;
  const nowCycle = cycleFor(history, totals.cycle);
  const btc = bitcoinPayout(signer);
  const typeName = contractTypeName(signer, locale);
  const prices = pricesFrom(calculations);
  const netApy = netApyPercent({
    rateSatsPer1000Stx: rateOf(calculations),
    stxPriceSats: prices.stxPriceSats,
    feeBips: signer.feeBips,
  });
  const nowUsd = ustxInUsd(now == null ? null : BigInt(now), prices);
  const timing = cycleTiming(calculations);
  const closesIn =
    timing && !timing.inPrepare ? countdownParts(timing.prepareStartsAt) : null;

  const change = (() => {
    if (now == null || next == null) return null;
    const a = BigInt(now);
    const b = BigInt(next);
    if (a === 0n) return null;
    const percent = Number(((b - a) * 1000n) / a) / 10;
    return `${percent >= 0 ? '+' : '−'}${Math.abs(Math.round(percent))}%`;
  })();

  const facts: Fact[] = [
    {
      label: t('pool.fact.fee'),
      value: (
        <span className={isHighFee(signer) ? 'text-rose' : ''}>
          {feePercent(signer.feeBips) ?? (
            <span className='text-base font-semibold text-muted'>
              {t('pools.feeElsewhereShort')}
            </span>
          )}
        </span>
      ),
      note:
        signer.feeBips === null
          ? t('pools.feeElsewhere')
          : signer.feeExemption
            ? t('badge.feeExemption')
            : netApy !== null
              ? t('pool.fact.feeYield', { percent: netApy.toFixed(2) })
              : t('pool.fact.feeNote'),
    },
    {
      label: t('pool.fact.cap'),
      help: t('pools.capHelp'),
      value:
        signer.maxFeeBips !== null ? (
          <Badge tone='good' size='sm'>
            {t('pools.cap', { percent: signer.maxFeeBips / 100 })}
          </Badge>
        ) : signer.feeBips === null ? (
          <span className='text-base font-semibold text-muted'>
            {t('pool.fact.capElsewhere')}
          </span>
        ) : (
          <Badge tone='bad' size='sm'>
            {t('pool.fact.capNone')}
          </Badge>
        ),
      note: signer.feeChangeNotice
        ? t('pool.fact.notice', {
            notice: noticeLabel(signer.feeChangeNotice, locale),
          })
        : signer.feeBips === null
          ? undefined
          : t('pool.fact.noNotice'),
    },
    {
      label: t('pool.fact.join'),
      value: <JoinTag signer={signer} locale={locale} />,
      note: t(`join.${joinMode(signer)}.help`),
    },
    {
      label: t('pool.fact.rewards'),
      value: <RewardTags signer={signer} locale={locale} />,
      note:
        btc === 'pool' ? t('badge.bitcoinViaPool') : t('pool.fact.rewardsNote'),
    },
    {
      label: t('pool.fact.staked', { cycle: totals.cycle }),
      value: stxCompact(now, locale) ?? '—',
      note:
        [
          nowCycle?.memberCount != null
            ? several
              ? t.plural('pool.fact.membersKey', nowCycle.memberCount)
              : t.plural('signerPage.memberCount', nowCycle.memberCount)
            : null,
          nowUsd !== null
            ? t('amount.usdAbout', { usd: usdCompact(nowUsd, locale) })
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    },
    {
      label: t('pool.fact.next', {
        cycle: totals.next?.cycle ?? totals.cycle + 1,
      }),
      value: stxCompact(next, locale) ?? '—',
      note: totals.next?.lockedIn
        ? t('pool.fact.nextLocked')
        : [
            change
              ? t('pool.fact.nextChange', { change })
              : t('pool.fact.nextOpen'),
            closesIn
              ? t('pool.fact.nextCloses', { countdown: countdown(closesIn, t) })
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
    },
    {
      label: t('pool.fact.share'),
      help: t('signerPage.votingPowerNote'),
      value: bips === null ? '—' : `${(bips / 100).toFixed(2)}%`,
      note: several
        ? t.plural('pool.fact.shareKey', node.contracts.length)
        : t('pool.fact.shareCycle', { cycle: totals.cycle }),
    },
    {
      label: t('pool.fact.runBy'),
      value:
        groupId && groupName ? (
          <a href={groupHref(groupId)} className='text-grape hover:underline'>
            {groupName} →
          </a>
        ) : (
          <span className='text-muted'>{t('pool.fact.runByUnknown')}</span>
        ),
      note:
        signer.profileId && typeName ? (
          <a href={contractHref(signer.profileId)} className='hover:text-grape'>
            {t('pool.fact.type', { name: typeName })}
          </a>
        ) : (
          <span className='font-semibold text-amber-warm'>
            {t('pools.unreviewed')}
          </span>
        ),
    },
  ];

  return <FactGrid facts={facts} />;
}

/** How many cycles to list before "show earlier". */
const RECENT_CYCLES = 6;

/**
 * What the pool held in each cycle: a bar for the trend, a row for the
 * figures, and the members of any one cycle opened in place.
 *
 * Only cycles from the one the pool was first seen in. Rows of "nothing
 * staked yet" for cycles before the contract existed said nothing a reader
 * needed, four times.
 */
function MembersCard({
  signer,
  node,
  slug,
  history,
  locale,
}: {
  signer: Signer;
  node: SignerNode;
  slug: string;
  history: Remote<SignerHistory>;
  locale: Locale;
}) {
  const t = translator(locale);
  const [open, setOpen] = useState<number | null>(null);
  const [earlier, setEarlier] = useState(false);
  const several = node.contracts.length > 1;

  const caption = (
    <>
      {t('pool.members.caption')} <InfoTip text={t('pool.members.how')} />
    </>
  );

  if (history.state !== 'ready') {
    return (
      <Card id='members' title={t('pool.members.title')} caption={caption}>
        <p className='text-sm text-muted'>
          {t(
            history.state === 'loading'
              ? 'signerPage.loading'
              : history.state === 'missing'
                ? 'signerPage.noHistory'
                : 'signerPage.failed',
          )}
        </p>
      </Card>
    );
  }

  const first = signer.firstSeenCycle ?? -Infinity;
  const cycles = history.value.cycles
    .filter((cycle) => cycle.cycle >= first)
    .sort((a, b) => b.cycle - a.cycle);
  const hiddenBefore = history.value.cycles.length - cycles.length;
  const listed = earlier ? cycles : cycles.slice(0, RECENT_CYCLES);
  const mine = (cycle: SignerCycleSummary): bigint | null => {
    const value = cycle.ustx[signer.contractId];
    return value == null ? null : BigInt(value);
  };
  const chart = [...cycles.slice(0, 8)].reverse();
  const max = chart.reduce((m, c) => {
    const v = mine(c) ?? 0n;
    return v > m ? v : m;
  }, 0n);

  return (
    <Card id='members' title={t('pool.members.title')} caption={caption}>
      {chart.length > 1 && max > 0n && (
        <div aria-hidden='true' className='mb-3'>
          <div className='flex h-28 items-end gap-2 border-b border-hairline px-1'>
            {chart.map((cycle) => {
              const value = mine(cycle) ?? 0n;
              const height = Number((value * 1000n) / max) / 10;
              const filling =
                cycleStanding(cycle, history.value.currentCycle) === 'filling';
              return (
                <div
                  key={cycle.cycle}
                  className='flex h-full flex-1 flex-col items-center justify-end gap-1'
                >
                  <span className='text-[0.7rem] font-bold text-muted tabular-nums'>
                    {value === 0n
                      ? '0'
                      : stxCompact(value, locale)?.replace(' STX', '')}
                  </span>
                  <span
                    className={`block w-full max-w-12 rounded-t-md ${
                      filling
                        ? 'bg-[repeating-linear-gradient(135deg,var(--color-grape)_0_5px,var(--color-grape-soft)_5px_9px)]'
                        : 'bg-grape'
                    }`}
                    style={{ height: `${Math.max(2, height * 0.8)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className='flex gap-2 px-1 pt-1'>
            {chart.map((cycle) => (
              <span
                key={cycle.cycle}
                className='flex-1 text-center text-xs text-muted tabular-nums'
              >
                {cycle.cycle}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-hairline text-left text-xs text-muted'>
              <th className='py-2 pr-2 font-bold'>{t('pool.members.cycle')}</th>
              <th className='py-2 pr-2 font-bold'>
                {t('pool.members.status')}
              </th>
              <th className='py-2 pr-2 text-right font-bold'>
                {t('pool.members.staked')}
              </th>
              <th className='py-2 pr-2 text-right font-bold'>
                {several
                  ? t('pool.members.membersKey')
                  : t('pool.members.members')}
              </th>
              <th className='py-2' />
            </tr>
          </thead>
          <tbody>
            {listed.map((cycle) => {
              const standing = cycleStanding(cycle, history.value.currentCycle);
              const showing = open === cycle.cycle;
              const total = sumCycleUstx(cycle.ustx);
              const canOpen =
                cycle.memberCount !== null && cycle.memberCount > 0;
              return (
                <CycleRows
                  key={cycle.cycle}
                  cycle={cycle}
                  standing={standing}
                  amount={stxCompact(mine(cycle), locale) ?? '—'}
                  keyTotal={
                    several && total !== null ? stxCompact(total, locale) : null
                  }
                  showing={showing}
                  canOpen={canOpen}
                  onToggle={() => setOpen(showing ? null : cycle.cycle)}
                  slug={slug}
                  node={node}
                  signer={signer}
                  locale={locale}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className='mt-3 text-xs text-muted'>
        {!earlier && cycles.length > listed.length ? (
          <button
            type='button'
            onClick={() => setEarlier(true)}
            className='font-semibold text-grape underline underline-offset-2'
          >
            {t.plural('pool.members.earlier', cycles.length - listed.length)}
          </button>
        ) : hiddenBefore > 0 && signer.firstSeenCycle != null ? (
          t('pool.members.firstSeen', { cycle: signer.firstSeenCycle })
        ) : null}
      </p>
    </Card>
  );
}

function CycleRows({
  cycle,
  standing,
  amount,
  keyTotal,
  showing,
  canOpen,
  onToggle,
  slug,
  node,
  signer,
  locale,
}: {
  cycle: SignerCycleSummary;
  standing: ReturnType<typeof cycleStanding>;
  amount: string;
  keyTotal: string | null;
  showing: boolean;
  canOpen: boolean;
  onToggle: () => void;
  slug: string;
  node: SignerNode;
  signer: Signer;
  locale: Locale;
}) {
  const t = translator(locale);
  return (
    <>
      <tr
        className={`border-b border-hairline ${showing ? 'bg-card-raised' : ''}`}
      >
        <td className='py-2 pr-2 font-bold tabular-nums'>{cycle.cycle}</td>
        <td className='py-2 pr-2'>
          {standing === 'filling' && (
            <Badge tone='good' size='sm'>
              {t('signerPage.filling')}
            </Badge>
          )}
          {standing === 'active' && (
            <Badge tone='neutral' size='sm'>
              {t('signerPage.active')}
            </Badge>
          )}
          {standing === 'done' && (
            <Badge tone='fact' size='sm'>
              {t('pool.members.ended')}
            </Badge>
          )}
        </td>
        <td className='py-2 pr-2 text-right whitespace-nowrap tabular-nums'>
          <strong>{amount}</strong>
          {keyTotal && (
            <span
              className='block text-xs text-muted'
              title={t('signerPage.sharedNote')}
            >
              {t('pool.members.ofKey', { total: keyTotal })}
            </span>
          )}
        </td>
        <td className='py-2 pr-2 text-right tabular-nums'>
          {cycle.memberCount ?? '—'}
          {!cycle.membersAddUp && cycle.memberCount !== null && (
            <span
              className='ml-1 text-amber-warm'
              title={t('signerPage.shortList')}
            >
              *
            </span>
          )}
        </td>
        <td className='py-2 text-right'>
          {canOpen && (
            <button
              type='button'
              aria-expanded={showing}
              onClick={onToggle}
              className='text-xs font-bold whitespace-nowrap text-grape'
            >
              <span className='hidden sm:inline'>
                {showing
                  ? t('signerPage.hideMembers')
                  : t('pool.members.open')}{' '}
              </span>
              <span aria-hidden='true'>{showing ? '▴' : '▾'}</span>
              <span className='sr-only sm:hidden'>
                {showing ? t('signerPage.hideMembers') : t('pool.members.open')}
              </span>
            </button>
          )}
        </td>
      </tr>
      {showing && (
        <tr className='bg-card-raised'>
          <td colSpan={5} className='px-2 pb-3'>
            {!cycle.cycleFinal && cycle.walkedAt && (
              <p className='pt-1 text-xs text-muted'>
                {t('signerPage.membersFresh')}
              </p>
            )}
            <MemberList
              slug={slug}
              cycle={cycle.cycle}
              node={node}
              signer={signer}
              locale={locale}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** How many members to draw before asking whether the reader wants the rest. */
const FIRST_PAGE = 10;

/**
 * One cycle's members, largest first.
 *
 * On a key with several contracts, the people in *this* contract first and
 * the rest of the key a tap away: the page is about this pool, and the
 * old page's "nothing staked yet · 3 members" was the key's three members
 * printed beside this contract's empty total.
 */
function MemberList({
  slug,
  cycle,
  node,
  signer,
  locale,
}: {
  slug: string;
  cycle: number;
  node: SignerNode;
  signer: Signer;
  locale: Locale;
}) {
  const t = translator(locale);
  const [all, setAll] = useState(false);
  const [wholeKey, setWholeKey] = useState(false);
  const members = useCycleMembers(slug, cycle);
  const several = node.contracts.length > 1;

  if (members.state === 'loading') {
    return <p className='pt-2 text-sm text-muted'>{t('signerPage.loading')}</p>;
  }
  if (members.state !== 'ready') {
    return (
      <p className='pt-2 text-sm text-muted'>
        {t(
          members.state === 'missing'
            ? 'signerPage.noMembers'
            : 'signerPage.failed',
        )}
      </p>
    );
  }

  const everyone = members.value.members;
  const here = everyone.filter((m) => m.contractId === signer.contractId);
  const list = several && !wholeKey ? here : everyone;
  const staked = list.reduce((sum, member) => sum + BigInt(member.ustx), 0n);
  const shown = all ? list : list.slice(0, FIRST_PAGE);

  return (
    <div className='pt-2'>
      {several && (
        <p className='mb-2 text-xs text-muted'>
          {wholeKey
            ? t.plural('pool.members.onKey', everyone.length)
            : t.plural('pool.members.inThis', here.length)}{' '}
          <button
            type='button'
            onClick={() => setWholeKey((value) => !value)}
            className='font-semibold text-grape underline underline-offset-2'
          >
            {wholeKey ? t('pool.members.showThis') : t('pool.members.showKey')}
          </button>
        </p>
      )}
      {list.length === 0 ? (
        <p className='text-sm text-muted'>{t('pool.members.none')}</p>
      ) : (
        <table className='w-full text-sm'>
          <tbody>
            {shown.map((member) => (
              <tr key={member.staker}>
                <td className='py-1 pr-2 font-mono text-xs'>
                  <a
                    className='hover:text-grape hover:underline'
                    href={explorerUrl(member.staker)}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {shortPrincipal(member.staker)}
                  </a>
                </td>
                <td className='py-1 pr-2 text-right whitespace-nowrap tabular-nums'>
                  {stxLabel(member.ustx, locale)}
                </td>
                <td className='hidden py-1 pr-2 text-right whitespace-nowrap text-muted tabular-nums sm:table-cell'>
                  {(shareBips(member, staked) / 100).toFixed(2)}%
                </td>
                {several && wholeKey && (
                  <td className='hidden py-1 text-right font-mono text-xs text-muted sm:table-cell'>
                    {member.contractId.split('.')[1]}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!all && list.length > shown.length && (
        <button
          type='button'
          onClick={() => setAll(true)}
          className='mt-2 text-xs font-bold text-grape'
        >
          {t('signerPage.showAll', { count: list.length })} →
        </button>
      )}
    </div>
  );
}

/**
 * The sBTC around this contract right now: what pox-5 still owes it, what it
 * has collected and not paid out, and what it has kept for itself. Together
 * they answer whether the pool is actually paying people.
 */
/** The published rate, or null. */
function rateOf(calculations: StxOnlyCalculations): bigint | null {
  try {
    return calculations.rateSatsPer1000Stx == null
      ? null
      : BigInt(calculations.rateSatsPer1000Stx);
  } catch {
    return null;
  }
}

/** How many cycles of earnings to list before "show earlier". */
const EARNED_CYCLES = 4;

function RewardsCard({
  signer,
  history,
  calculations,
  locale,
}: {
  signer: Signer;
  history: Remote<SignerHistory>;
  calculations: StxOnlyCalculations;
  locale: Locale;
}) {
  const t = translator(locale);
  const unclaimed = signer.unclaimedFromPoxSats ?? null;
  const undistributed = signer.undistributedSats ?? null;
  const earnedFees = signer.earnedFeesSats ?? null;
  const rows: { label: string; value: string; help: string }[] = [
    {
      label: t('signerPage.unclaimed'),
      value: satsLabel(unclaimed, locale),
      help: t(
        unclaimed === null
          ? 'signerPage.claimUnknown'
          : BigInt(unclaimed) === 0n
            ? 'signerPage.claimCurrent'
            : 'signerPage.claimBehind',
      ),
    },
  ];
  if (undistributed !== null) {
    rows.push({
      label: t('signerPage.undistributed'),
      value: satsLabel(undistributed, locale),
      help: t('signerPage.undistributedNote'),
    });
  }
  if (earnedFees !== null) {
    rows.push({
      label: t('signerPage.earnedFees'),
      value: satsLabel(earnedFees, locale),
      help: t('signerPage.earnedFeesNote'),
    });
  }
  const behind = unclaimed !== null && BigInt(unclaimed) > 0n;

  return (
    <Card
      id='rewards'
      title={t('signerPage.rewards')}
      caption={t('pool.rewards.caption')}
    >
      <Earnings
        signer={signer}
        history={history}
        calculations={calculations}
        locale={locale}
      />

      <h3 className='mt-5 mb-2 text-sm font-bold'>
        {t('pool.earned.whereNow')}
      </h3>
      <dl className='space-y-2 text-sm'>
        {rows.map((row) => (
          <div
            key={row.label}
            className='flex items-baseline justify-between gap-3'
          >
            <dt className='flex items-center gap-1 text-muted'>
              {row.label} <InfoTip text={row.help} />
            </dt>
            <dd className='font-bold whitespace-nowrap tabular-nums'>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {behind && (
        <p className='mt-2 text-xs text-amber-warm'>
          {t('signerPage.claimBehind')}
        </p>
      )}
      {undistributed === null && earnedFees === null && (
        <p className='mt-3 text-xs text-muted'>{t('pool.rewards.none')}</p>
      )}
    </Card>
  );
}

/**
 * What this contract has earned, cycle by cycle, and what that is a year.
 *
 * Worked out rather than read: pox-5 pays every STX-only share in a cycle
 * the same, so a cycle's earnings are what this contract held times that
 * cycle's rewards-per-token (see `lib/pool-yield.ts`). Before the fee,
 * because only today's fee is on file; the yield after the fee is at today's
 * fee and today's rate, which is the figure somebody choosing now compares.
 */
function Earnings({
  signer,
  history,
  calculations,
  locale,
}: {
  signer: Signer;
  history: Remote<SignerHistory>;
  calculations: StxOnlyCalculations;
  locale: Locale;
}) {
  const t = translator(locale);
  const [all, setAll] = useState(false);
  const rates = useStxOnlyHistory();
  const prices = pricesFrom(calculations);
  const netApy = netApyPercent({
    rateSatsPer1000Stx: rateOf(calculations),
    stxPriceSats: prices.stxPriceSats,
    feeBips: signer.feeBips,
  });
  const bond = isBondPool(signer);

  const earnings =
    history.state === 'ready' && rates.state === 'ready'
      ? poolEarnings({
          contractId: signer.contractId,
          cycles: history.value.cycles,
          rates: cycleRates(rates.value.distributions),
        })
      : null;
  const total = earnings?.reduce((sum, e) => sum + e.sats, 0n) ?? null;
  const listed = earnings && !all ? earnings.slice(0, EARNED_CYCLES) : earnings;
  const usd = (sats: bigint) => {
    const value = satsInUsd(sats, prices);
    return value === null ? null : usdCompact(value, locale);
  };

  return (
    <div>
      <div className='grid grid-cols-2 gap-3'>
        <div>
          <p className='flex items-center gap-1 text-xs font-semibold text-muted'>
            {t('pool.earned.yield')}{' '}
            <InfoTip text={t('pool.earned.yieldHelp')} />
          </p>
          <p
            className={`text-2xl font-extrabold tabular-nums ${
              isHighFee(signer) ? 'text-rose' : ''
            }`}
          >
            {netApy === null
              ? signer.feeBips === null
                ? t('pools.feeElsewhereShort')
                : '—'
              : `${netApy.toFixed(2)}%`}
          </p>
          <p className='text-xs text-muted'>
            {signer.feeBips === null
              ? t('pools.feeElsewhere')
              : t('pool.earned.yieldNote', {
                  fee: feePercent(signer.feeBips) ?? '',
                })}
          </p>
        </div>
        <div>
          <p className='flex items-center gap-1 text-xs font-semibold text-muted'>
            {earnings && earnings.length > 0
              ? t('pool.earned.total', {
                  cycle: earnings[earnings.length - 1].cycle,
                })
              : t('pool.earned.totalPlain')}{' '}
            <InfoTip text={t('pool.earned.how')} />
          </p>
          <p className='text-2xl font-extrabold tabular-nums'>
            {total === null ? '—' : (sbtcCompact(total, locale) ?? '—')}
          </p>
          <p className='text-xs text-muted'>
            {[total !== null ? usd(total) : null, t('pool.earned.beforeFee')]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      {bond && <p className='mt-2 text-xs text-muted'>{t('pools.bondHelp')}</p>}

      {earnings === null ? (
        <p className='mt-3 text-sm text-muted'>
          {history.state === 'loading' || rates.state === 'loading'
            ? t('signerPage.loading')
            : t('pool.earned.unavailable')}
        </p>
      ) : earnings.length === 0 ? (
        <p className='mt-3 text-sm text-muted'>{t('pool.earned.none')}</p>
      ) : (
        <>
          <table className='mt-3 w-full text-sm'>
            <thead>
              <tr className='border-b border-hairline text-left text-xs text-muted'>
                <th className='py-1.5 pr-2 font-bold'>
                  {t('pool.members.cycle')}
                </th>
                <th className='py-1.5 pr-2 text-right font-bold'>
                  {t('pool.earned.colEarned')}
                </th>
                {signer.feeBips !== null && (
                  <th className='py-1.5 text-right font-bold'>
                    {t('pool.earned.colKept', {
                      fee: feePercent(signer.feeBips) ?? '',
                    })}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {listed!.map((entry) => {
                const kept =
                  signer.feeBips === null
                    ? null
                    : afterFee(entry.sats, signer.feeBips);
                return (
                  <tr
                    key={entry.cycle}
                    className='border-b border-hairline last:border-b-0'
                  >
                    <td className='py-1.5 pr-2 font-bold tabular-nums'>
                      {entry.cycle}
                      {entry.partial && (
                        <span className='ml-1.5 text-xs font-normal text-muted'>
                          {t('pool.earned.soFar')}
                        </span>
                      )}
                    </td>
                    <td className='py-1.5 pr-2 text-right whitespace-nowrap tabular-nums'>
                      <strong>{sbtcCompact(entry.sats, locale)}</strong>
                      {usd(entry.sats) && (
                        <span className='block text-xs text-muted'>
                          {usd(entry.sats)}
                        </span>
                      )}
                    </td>
                    {kept !== null && (
                      <td className='py-1.5 text-right whitespace-nowrap text-muted tabular-nums'>
                        {sbtcCompact(kept, locale)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!all && earnings.length > EARNED_CYCLES && (
            <button
              type='button'
              onClick={() => setAll(true)}
              className='mt-2 text-xs font-semibold text-grape underline underline-offset-2'
            >
              {t.plural(
                'pool.members.earlier',
                earnings.length - EARNED_CYCLES,
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** The key, what it weighs, who is behind it, and its other contracts. */
function KeyCard({
  signer,
  node,
  totals,
  locale,
}: {
  signer: Signer;
  node: SignerNode;
  totals: LockedTotals;
  locale: Locale;
}) {
  const t = translator(locale);
  const siblings = node.contracts;
  const staked = nodeUstx(node, totals.ustx);
  const groups = groupsForNode(node);

  return (
    <Card id='key' title={t('signerPage.key')} caption={t('pool.key.caption')}>
      <p className='font-mono text-xs break-all text-muted'>
        {signer.signerKey ?? t('signer.notAvailable')}
      </p>
      {staked !== null && (
        <p className='mt-2 text-sm'>
          {t('pool.key.staked', {
            amount: stxLabel(staked.toString(), locale),
            cycle: totals.cycle,
          })}
        </p>
      )}

      {groups.length > 0 && (
        <div className='mt-3'>
          <p className='flex items-center gap-1 text-xs font-semibold text-muted'>
            {t.plural('signerPage.groups', groups.length)}
            <InfoTip text={t('signerPage.groupsNote')} />
          </p>
          <ul className='mt-1 flex flex-wrap gap-1.5'>
            {groups.map((group) => (
              <li key={group.id}>
                <a
                  className='inline-block rounded-full bg-grape-soft px-3 py-1 text-sm font-semibold text-grape'
                  href={groupHref(group.id)}
                >
                  {group.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {signer.signerKey === null ? (
        <p className='mt-3 text-sm text-muted'>{t('signerPage.keyNone')}</p>
      ) : (
        <div className='mt-3'>
          <p className='flex items-center gap-1 text-xs font-semibold text-muted'>
            {t.plural('signerPage.sharedBy', siblings.length)}
            {siblings.length > 1 && (
              <InfoTip text={t('signerPage.sharedNote')} />
            )}
          </p>
          <ul className='mt-1 space-y-1 text-sm'>
            {siblings.map((sibling) => {
              const here = sibling.contractId === signer.contractId;
              return (
                <li
                  key={sibling.contractId}
                  className='flex flex-wrap items-baseline gap-x-2'
                >
                  {here ? (
                    <span className='font-semibold'>
                      <PoolName signer={sibling} locale={locale} />
                    </span>
                  ) : (
                    <a
                      className='font-semibold text-grape hover:underline'
                      href={signerHref(sibling.contractId)}
                    >
                      <PoolName signer={sibling} locale={locale} />
                    </a>
                  )}
                  <span className='font-mono text-xs break-all text-muted'>
                    {sibling.contractId.split('.')[1]}
                  </span>
                  {here && (
                    <span className='text-xs text-muted'>
                      {t('signerPage.thisOne')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** What the code does, in the contract type's own summary, and where to read it. */
function ContractCard({ signer, locale }: { signer: Signer; locale: Locale }) {
  const t = translator(locale);
  const profile = profileFor(signer.groupSha256);
  const localized = profile ? localizeProfile(profile, locale) : null;

  return (
    <Card
      id='contract'
      title={t('pool.contract.title')}
      caption={t('pool.contract.caption')}
    >
      {localized && signer.profileId ? (
        <>
          <p className='text-sm'>{localized.summary}</p>
          <a
            href={contractHref(signer.profileId)}
            className='mt-2 inline-block text-sm font-bold text-grape'
          >
            {t('pool.contract.more', { name: localized.name })} →
          </a>
        </>
      ) : (
        <p className='text-sm text-amber-warm'>{t('signer.notReviewed')}</p>
      )}
      <dl className='mt-3 space-y-2 border-t border-hairline pt-3 text-xs'>
        <div>
          <dt className='font-semibold text-muted'>{t('signer.contract')}</dt>
          <dd className='font-mono break-all'>
            <a
              className='hover:text-grape hover:underline'
              href={explorerUrl(signer.contractId)}
              target='_blank'
              rel='noreferrer'
            >
              {signer.contractId}
            </a>
          </dd>
        </div>
        <div>
          <dt className='flex items-center gap-1 font-semibold text-muted'>
            {t('signer.fingerprint')}
            <InfoTip text={t('signer.fingerprintNote')} />
          </dt>
          <dd className='font-mono break-all text-muted'>
            {signer.canonicalSha256}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
