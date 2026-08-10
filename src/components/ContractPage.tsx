import { stxLabel, sumUstx } from '../lib/amounts';
import { explorerUrl } from '../lib/explorer';
import { SIP_IDENTICON_URL } from '../lib/identicon';
import { translator, type Locale } from '../lib/i18n';
import { localizeProfile } from '../lib/profile-i18n';
import type { Template } from '../lib/templates';
import Badge, { feeLabel, noticeLabel } from './Badge';
import Identicon from './Identicon';
import LocaleSwitch from './LocaleSwitch';
import PoolName from './PoolName';

const Code = ({ children }: { children: string }) => (
  <code className='break-all font-mono text-xs'>{children}</code>
);

export default function ContractPage({
  template,
  lockedUstx,
  locale,
  onLocaleChange,
}: {
  template: Template;
  /** uSTX per pool right now; undefined until the amounts are read. */
  lockedUstx?: Record<string, string | null>;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const { signers } = template;
  const t = translator(locale);
  const profile = localizeProfile(template.profile, locale);
  const staked = sumUstx(
    signers.map((s) => s.contractId),
    lockedUstx,
  );

  const sipLink = (
    <a
      className='underline'
      href={SIP_IDENTICON_URL}
      target='_blank'
      rel='noreferrer'
    >
      {t('identicon.sip')}
    </a>
  );

  // The icon shown is the group's majority, so the note may only claim every
  // pool shows it when every pool does — see Template.identiconHash. Plural
  // picked by hand rather than through t.plural, which returns a string and
  // would have nowhere to put the link.
  const outliers = template.identiconOutliers;
  const identiconNote =
    outliers === 0
      ? t.rich('contract.identiconNote', { link: sipLink })
      : t.rich(
          outliers === 1
            ? 'contract.identiconMajority.one'
            : 'contract.identiconMajority.other',
          {
            count: outliers,
            sharing: signers.length - outliers,
            total: signers.length,
            link: sipLink,
          },
        );

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('contract.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 flex items-center gap-3 text-4xl font-extrabold md:text-5xl'>
        <Identicon
          hash={template.identiconHash}
          locale={locale}
          className='h-12 w-12 md:h-14 md:w-14'
        />
        {t('contract.heading', { name: profile.name })}
      </h1>

      <p className='mt-4 text-lg text-muted'>{profile.detail}</p>

      <div className='mt-6 flex flex-wrap gap-2'>
        {template.openToAnyone ? (
          <Badge tone='good'>{t('badge.anyoneCanJoin')}</Badge>
        ) : (
          <Badge tone='warm'>{t('badge.inviteOnly')}</Badge>
        )}
        {template.bitcoinRewards && (
          <Badge tone='good'>{t('badge.bitcoinRewards')}</Badge>
        )}
        <Badge tone='neutral'>{t('badge.sbtcRewards')}</Badge>
        {template.maxFeeBips !== null && (
          <Badge tone='good'>
            {t('badge.feeCapped', { percent: template.maxFeeBips / 100 })}
          </Badge>
        )}
        {template.feeChangeNotice && (
          <Badge tone='good'>
            {t('badge.feeNotice', {
              notice: noticeLabel(template.feeChangeNotice, locale),
            })}
          </Badge>
        )}
        {template.feeExemption && (
          <Badge tone='good'>{t('badge.feeExemption')}</Badge>
        )}
      </div>

      <section className='mt-10'>
        <h2 className='text-2xl font-bold'>
          {t.plural('contract.poolsRunning', signers.length)}
        </h2>
        <p className='mt-2 text-muted'>
          {t('contract.sameCode')}
          {staked !== null &&
            t.rich('contract.stakedTotal', {
              amount: (
                <strong className='text-ink'>
                  {stxLabel(staked.toString(), locale)}
                </strong>
              ),
            })}
        </p>

        <ul className='mt-4 space-y-3'>
          {signers.map((signer) => (
            <li
              key={signer.contractId}
              className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'
            >
              <a
                className='text-lg font-bold underline underline-offset-2'
                href={explorerUrl(signer.contractId)}
                target='_blank'
                rel='noreferrer'
              >
                <PoolName signer={signer} locale={locale} />
              </a>
              <span className='flex flex-wrap items-baseline gap-2'>
                {lockedUstx && (
                  <span className='text-sm font-semibold'>
                    {stxLabel(lockedUstx[signer.contractId], locale)}
                  </span>
                )}
                <Badge tone='neutral'>
                  {t('badge.fee', { fee: feeLabel(signer.feeBips, locale) })}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
        <h2 className='text-lg font-bold'>{t('contract.howWeChecked')}</h2>
        <dl className='mt-3 space-y-3 text-sm'>
          <div>
            <dt className='font-semibold'>{t('contract.fingerprint')}</dt>
            <dd className='mt-0.5 break-all font-mono text-xs text-muted'>
              {template.groupSha256}
            </dd>
            <dd className='mt-1 text-muted'>{t('contract.fingerprintNote')}</dd>
          </div>

          {template.identiconHash && (
            <div>
              <dt className='font-semibold'>{t('contract.identicon')}</dt>
              <dd className='mt-1 flex items-center gap-2'>
                <Identicon
                  hash={template.identiconHash}
                  locale={locale}
                  className='h-10 w-10'
                />
                <span className='break-all font-mono text-xs text-muted'>
                  {template.identiconHash}
                </span>
              </dd>
              <dd className='mt-1 text-muted'>{identiconNote}</dd>
            </div>
          )}

          <div>
            <dt className='font-semibold'>{t('contract.whoMayJoin')}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.openToAnyone
                ? t.rich('contract.whoMayJoinEvidence', {
                    code: <Code>{template.evidence.openToAnyone}</Code>,
                  })
                : t('contract.whoMayJoinNone')}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{t('contract.feeCeiling')}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.maxFee
                ? t.rich('contract.feeCeilingEvidence', {
                    code: <Code>{template.evidence.maxFee}</Code>,
                  })
                : t('contract.feeCeilingNone')}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{t('contract.exempt')}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.feeExemption
                ? t.rich('contract.exemptEvidence', {
                    code: <Code>{template.feeExemption.evidence}</Code>,
                    source: t(
                      template.feeExemption.operatorChooses
                        ? 'contract.exemptOperator'
                        : 'contract.exemptFixed',
                      { source: template.feeExemption.source },
                    ),
                  })
                : t('contract.exemptNone')}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{t('contract.notice')}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.feeChangeNotice
                ? t.rich('contract.noticeEvidence', {
                    amount: template.feeChangeNotice.amount,
                    unit: t(
                      template.feeChangeNotice.unit === 'cycles'
                        ? 'contract.noticeUnit.cycles'
                        : 'contract.noticeUnit.blocks',
                    ),
                    human: noticeLabel(template.feeChangeNotice, locale),
                    code: <Code>{template.feeChangeNotice.evidence}</Code>,
                  })
                : t('contract.noticeNone')}
            </dd>
          </div>

          <div>
            <dt className='font-semibold'>{t('contract.bitcoin')}</dt>
            <dd className='mt-0.5 text-muted'>
              {template.evidence.bitcoinRewards
                ? t.rich('contract.bitcoinEvidence', {
                    code: <Code>{template.evidence.bitcoinRewards}</Code>,
                  })
                : t('contract.bitcoinNone')}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
