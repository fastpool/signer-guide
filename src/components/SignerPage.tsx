import { useState } from 'react';
import { stxLabel } from '../lib/amounts';
import { explorerUrl } from '../lib/explorer';
import { formatLastUpdate, translator, type Locale } from '../lib/i18n';
import { contractHref, signerHref } from '../lib/route';
import {
  cycleStanding,
  shareBips,
  sumCycleUstx,
  type SignerGroup,
} from '../lib/signer-groups';
import {
  useCycleMembers,
  useSignerHistory,
  type Remote,
} from '../lib/signer-history';
import { ellipsedAddr, shortPrincipal } from '../lib/strings';
import type { Signer, SignerHistory } from '../lib/types';
import Badge, { feeLabel, noticeLabel } from './Badge';
import Identicon from './Identicon';
import LocaleSwitch from './LocaleSwitch';
import PoolName from './PoolName';

/**
 * One deployed signer contract.
 *
 * The sibling of ContractPage, and the two are worth telling apart. That page
 * is about a piece of reviewed code, which a dozen pools may share; this one
 * is about one deployment of it — its key, its money, and the people in it.
 *
 * Most of what is on it is about the signer rather than the contract, because
 * that is where the truth lives. A signer key can have several signer-manager
 * contracts registered against it, and the stake behind the key, its weight
 * and the slots it holds are all decided on those contracts together. So the
 * page a reader arrives at by naming one contract shows them the whole signer,
 * with the contract they came for marked among its siblings.
 */
export default function SignerPage({
  signer,
  group,
  slug,
  locale,
  onLocaleChange,
}: {
  signer: Signer;
  /** The signer this contract belongs to, siblings included. */
  group: SignerGroup;
  slug: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const [address, name] = signer.contractId.split('.');
  const history = useSignerHistory(slug);

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('signerPage.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 flex items-center gap-3 text-4xl font-extrabold md:text-5xl'>
        <Identicon
          hash={signer.identiconHash}
          locale={locale}
          className='h-12 w-12 md:h-14 md:w-14'
        />
        <PoolName signer={signer} locale={locale} />
      </h1>

      <p className='mt-3 break-all font-mono text-xs text-muted'>
        <a
          className='underline'
          href={explorerUrl(signer.contractId)}
          target='_blank'
          rel='noreferrer'
        >
          {ellipsedAddr(address)}.{name}
        </a>
      </p>

      {signer.profileId && signer.implementationName && (
        <p className='mt-3 text-sm font-semibold'>
          {t.rich('signer.runsContract', {
            link: (
              <a
                className='text-grape underline underline-offset-2'
                href={contractHref(signer.profileId)}
              >
                {t('signer.contractLink', { name: signer.implementationName })}
              </a>
            ),
          })}
        </p>
      )}

      <div className='mt-4 flex flex-wrap gap-2'>
        {signer.openToAnyone ? (
          <Badge tone='good'>{t('badge.anyoneCanJoin')}</Badge>
        ) : (
          <Badge tone='warm'>{t('badge.inviteOnly')}</Badge>
        )}
        {signer.bitcoinRewards && (
          <Badge tone='good'>{t('badge.bitcoinRewards')}</Badge>
        )}
        <Badge tone='neutral'>
          {t('badge.fee', { fee: feeLabel(signer.feeBips, locale) })}
        </Badge>
        {signer.maxFeeBips !== null && (
          <Badge tone='good'>
            {t('badge.feeCapped', { percent: signer.maxFeeBips / 100 })}
          </Badge>
        )}
        {signer.feeChangeNotice && (
          <Badge tone='good'>
            {t('badge.feeNotice', {
              notice: noticeLabel(signer.feeChangeNotice, locale),
            })}
          </Badge>
        )}
      </div>

      <SignerKeySection signer={signer} group={group} locale={locale} />

      <CycleSection
        signer={signer}
        group={group}
        slug={slug}
        history={history}
        locale={locale}
      />
    </main>
  );
}

/**
 * The key, and every contract registered against it.
 *
 * The point of the section is the sibling list. Somebody looking at a pool
 * holding four hundred thousand STX is looking at a quarter of its signer if
 * three other contracts share the key, and nothing else on the page would tell
 * them so.
 */
function SignerKeySection({
  signer,
  group,
  locale,
}: {
  signer: Signer;
  group: SignerGroup;
  locale: Locale;
}) {
  const t = translator(locale);
  const siblings = group.contracts;

  return (
    <section className='mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <h2 className='text-lg font-bold'>{t('signerPage.key')}</h2>
      <p className='mt-1 break-all font-mono text-xs text-muted'>
        {signer.signerKey ?? t('signer.notAvailable')}
      </p>

      {signer.signerKey === null ? (
        <p className='mt-3 text-sm text-muted'>{t('signerPage.keyNone')}</p>
      ) : (
        <>
          <p className='mt-3 text-sm font-semibold'>
            {t.plural('signerPage.sharedBy', siblings.length)}
          </p>
          <ul className='mt-2 space-y-2 text-sm'>
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
                      className='font-semibold text-grape underline underline-offset-2'
                      href={signerHref(sibling.contractId)}
                    >
                      <PoolName signer={sibling} locale={locale} />
                    </a>
                  )}
                  <span className='break-all font-mono text-xs text-muted'>
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
          {siblings.length > 1 && (
            <p className='mt-3 text-sm text-muted'>
              {t('signerPage.sharedNote')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** The cycle table, and whichever cycle a reader has opened. */
function CycleSection({
  signer,
  group,
  slug,
  history,
  locale,
}: {
  signer: Signer;
  group: SignerGroup;
  slug: string;
  history: Remote<SignerHistory>;
  locale: Locale;
}) {
  const t = translator(locale);
  const [open, setOpen] = useState<number | null>(null);
  const several = group.contracts.length > 1;

  return (
    <section className='mt-10'>
      <h2 className='text-2xl font-bold'>{t('signerPage.cycles')}</h2>
      <p className='mt-2 text-muted'>{t('signerPage.cyclesIntro')}</p>

      {history.state === 'loading' && (
        <p className='mt-4 text-muted'>{t('signerPage.loading')}</p>
      )}
      {history.state === 'missing' && (
        <p className='mt-4 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {t('signerPage.noHistory')}
        </p>
      )}
      {history.state === 'failed' && (
        <p className='mt-4 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          {t('signerPage.failed')}
        </p>
      )}

      {history.state === 'ready' && (
        <ul className='mt-4 space-y-3'>
          {history.value.cycles.map((cycle) => {
            const total = sumCycleUstx(cycle.ustx);
            const mine = cycle.ustx[signer.contractId];
            const showing = open === cycle.cycle;
            const standing = cycleStanding(cycle, history.value.currentCycle);

            return (
              <li
                key={cycle.cycle}
                className='rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'
              >
                <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2'>
                  <span className='flex items-baseline gap-2 text-lg font-bold'>
                    {t('signerPage.cycle', { cycle: cycle.cycle })}
                    {/* From `cycleFinal`, never `fileFinal`: one is whether
                        the cycle is shut, the other only whether the
                        generator will look again. See cycleStanding. */}
                    {standing === 'filling' && (
                      <Badge tone='good'>{t('signerPage.filling')}</Badge>
                    )}
                    {standing === 'active' && (
                      <Badge tone='neutral'>{t('signerPage.active')}</Badge>
                    )}
                  </span>
                  <span className='text-sm'>
                    {/* This contract's own share first: it is the one the
                        reader came for. The signer's total only earns a line
                        when it is a different number. */}
                    <strong>{stxLabel(mine ?? null, locale)}</strong>
                    {several && total !== null && (
                      <span className='ml-2 text-muted'>
                        {t('signerPage.ofSigner', {
                          total: stxLabel(total.toString(), locale),
                        })}
                      </span>
                    )}
                  </span>
                </div>

                <div className='mt-3 flex flex-wrap items-center justify-between gap-3 text-sm'>
                  <span className='text-muted'>
                    {cycle.memberCount === null
                      ? t('signerPage.notCounted')
                      : t.plural('signerPage.memberCount', cycle.memberCount)}
                    {/* When the list was made, which is the whole of how much
                        to read into it: a cycle still open is rebuilt at most
                        once a day, so this can be most of a day behind the
                        amounts above it. */}
                    {cycle.memberCount !== null && cycle.walkedAt && (
                      <span className='ml-1'>
                        {t('signerPage.walkedAt', {
                          at: formatLastUpdate(cycle.walkedAt, locale),
                        })}
                      </span>
                    )}
                  </span>
                  {cycle.memberCount !== null && cycle.memberCount > 0 && (
                    <button
                      type='button'
                      onClick={() => setOpen(showing ? null : cycle.cycle)}
                      className='font-semibold text-grape underline underline-offset-2'
                    >
                      {showing
                        ? t('signerPage.hideMembers')
                        : t('signerPage.showMembers')}
                    </button>
                  )}
                </div>

                {!cycle.membersAddUp && cycle.memberCount !== null && (
                  <p className='mt-2 text-sm text-amber-warm'>
                    {t('signerPage.shortList')}
                  </p>
                )}

                {/* Only where it can actually be behind. A closed cycle is
                    walked once and then never changes, so saying its list
                    might be a day old would be worrying somebody about
                    nothing. */}
                {showing && !cycle.cycleFinal && cycle.walkedAt && (
                  <p className='mt-3 text-xs text-muted'>
                    {t('signerPage.membersFresh')}
                  </p>
                )}

                {showing && (
                  <MemberList
                    slug={slug}
                    cycle={cycle.cycle}
                    group={group}
                    locale={locale}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** How many members to draw before asking whether the reader wants the rest. */
const FIRST_PAGE = 50;

function MemberList({
  slug,
  cycle,
  group,
  locale,
}: {
  slug: string;
  cycle: number;
  group: SignerGroup;
  locale: Locale;
}) {
  const t = translator(locale);
  const [all, setAll] = useState(false);
  const members = useCycleMembers(slug, cycle);
  // Which contract each member is with only earns a column when the signer
  // has more than one for them to be with.
  const several = group.contracts.length > 1;

  if (members.state === 'loading') {
    return <p className='mt-3 text-sm text-muted'>{t('signerPage.loading')}</p>;
  }
  if (members.state !== 'ready') {
    return (
      <p className='mt-3 text-sm text-muted'>
        {t(
          members.state === 'missing'
            ? 'signerPage.noMembers'
            : 'signerPage.failed',
        )}
      </p>
    );
  }

  const list = members.value.members;
  const staked = list.reduce((sum, member) => sum + BigInt(member.ustx), 0n);
  const shown = all ? list : list.slice(0, FIRST_PAGE);

  return (
    <div className='mt-4 border-t border-black/5 pt-4'>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-sm'>
          <thead>
            <tr className='text-xs font-semibold text-muted uppercase'>
              <th className='pb-2'>{t('signerPage.colStaker')}</th>
              <th className='pb-2 text-right'>{t('signerPage.colAmount')}</th>
              <th className='pb-2 text-right'>{t('signerPage.colShare')}</th>
              {several && (
                <th className='pb-2 text-right'>
                  {t('signerPage.colContract')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((member) => (
              <tr key={member.staker} className='border-t border-black/5'>
                <td className='py-2 pr-3 font-mono text-xs'>
                  <a
                    className='underline'
                    href={explorerUrl(member.staker)}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {shortPrincipal(member.staker)}
                  </a>
                </td>
                <td className='py-2 pr-3 text-right whitespace-nowrap'>
                  {stxLabel(member.ustx, locale)}
                </td>
                <td className='py-2 pr-3 text-right whitespace-nowrap text-muted'>
                  {(shareBips(member, staked) / 100).toFixed(2)}%
                </td>
                {several && (
                  <td className='py-2 text-right font-mono text-xs text-muted'>
                    {member.contractId.split('.')[1]}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!all && list.length > shown.length && (
        <button
          type='button'
          onClick={() => setAll(true)}
          className='mt-3 font-semibold text-grape underline underline-offset-2'
        >
          {t('signerPage.showAll', { count: list.length })}
        </button>
      )}
    </div>
  );
}
