import { stxCompact, sumUstx } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import { localizeProfile } from '../lib/profile-i18n';
import { contractHref } from '../lib/route';
import type { Template } from '../lib/templates';
import type { LockedTotals } from '../lib/types';
import Badge from './Badge';
import Identicon from './Identicon';
import { Page, PageHeading } from './ui';

/**
 * Every kind of signer contract, side by side.
 *
 * These were nine tiles on the pool list, above the pools, and every pool card
 * then repeated its own tile's description underneath. The list now names
 * each pool's type in a column, and the descriptions live here, once each,
 * with what each type promises a staker set out as the same few badges.
 */
export default function ContractsPage({
  liveTemplates,
  archivedTemplates,
  totals,
  locale,
}: {
  liveTemplates: Template[];
  archivedTemplates: Template[];
  totals: LockedTotals;
  locale: Locale;
}) {
  const t = translator(locale);

  return (
    <Page wide>
      <PageHeading
        title={t('app.contractsHeading')}
        intro={t('app.contractsIntro')}
      />

      <ul className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {liveTemplates.map((template) => {
          const profile = localizeProfile(template.profile, locale);
          const staked = sumUstx(
            template.signers.map((signer) => signer.contractId),
            totals.ustx,
          );
          return (
            <li key={template.profile.id}>
              <a
                href={contractHref(template.profile.id)}
                className='flex h-full flex-col rounded-2xl bg-card p-4 shadow-lift transition-colors hover:bg-grape-soft sm:p-5'
              >
                <span className='flex items-center gap-2 text-lg font-bold'>
                  <Identicon
                    hash={template.identiconHash}
                    locale={locale}
                    className='h-8 w-8'
                  />
                  {profile.name}
                </span>
                <span className='mt-1 text-sm text-muted'>
                  {t.plural('app.poolCount', template.signers.length)}
                  {staked !== null && staked > 0n && (
                    <>
                      {' · '}
                      {t('contracts.staked', {
                        amount: stxCompact(staked, locale) ?? '—',
                      })}
                    </>
                  )}
                </span>
                <span className='mt-2 flex flex-wrap gap-1'>
                  {template.openToAnyone ? (
                    <Badge tone='good' size='sm'>
                      {t('badge.anyoneCanJoin')}
                    </Badge>
                  ) : (
                    <Badge tone='warm' size='sm'>
                      {t('badge.inviteOnly')}
                    </Badge>
                  )}
                  {template.bitcoinRewards && (
                    <Badge tone='btc' size='sm'>
                      {t('badge.bitcoinRewards')}
                    </Badge>
                  )}
                  {template.maxFeeBips !== null && (
                    <Badge tone='good' size='sm'>
                      {t('badge.feeCapped', {
                        percent: template.maxFeeBips / 100,
                      })}
                    </Badge>
                  )}
                  {template.feeChangeNotice && (
                    <Badge tone='good' size='sm'>
                      {t('contracts.notice')}
                    </Badge>
                  )}
                </span>
                <span className='mt-2 text-sm text-muted'>
                  {profile.summary}
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {/*
        Archived types, below the live ones and deliberately plainer: no icon,
        no card, no invitation to choose. They are here because a contract
        somebody is staked with should never vanish from the page that
        describes it — not because anybody should be picking one today.
      */}
      {archivedTemplates.length > 0 && (
        <section className='mt-8' aria-labelledby='archived-heading'>
          <h2 id='archived-heading' className='text-lg font-bold text-muted'>
            {t('app.archivedHeading')}
          </h2>
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
    </Page>
  );
}
