import type { ReactNode } from 'react';
import { translator, type Locale } from '../lib/i18n';
import { statusHref } from '../lib/route';
import { SBTC_POOLS } from '../lib/sbtc-pools';
import LocaleSwitch from './LocaleSwitch';

/**
 * Staking, in three steps, for somebody who has not done it.
 *
 * Every other page here answers a question a reader already knows to ask —
 * which pool, whose key, what was paid. This one is for the reader who does
 * not, and it is the only page in the guide that is allowed to be short. Forty
 * pools, six contract types, a conduct section and a rewards estimate are what
 * the guide is for; they are also why somebody arriving for the first time
 * cannot tell whether staking is a five-minute job or a project. It is a
 * five-minute job, and nothing else on the site says so.
 *
 * So the rule for this page is subtraction. Three steps for STX and three for
 * sBTC, a sentence each, and a link out to the page that has the detail. Any
 * fact that wants a second sentence belongs on one of those pages instead.
 */
export default function HowToStakePage({
  locale,
  onLocaleChange,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('howTo.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-3xl font-extrabold md:text-4xl'>
        {t('howTo.title')}
      </h1>
      <p className='mt-3 text-lg text-muted'>{t('howTo.intro')}</p>

      <section className='mt-10' aria-labelledby='how-to-stx'>
        <h2 id='how-to-stx' className='text-2xl font-bold'>
          {t('howTo.stx.heading')}
        </h2>
        <ol className='mt-4 space-y-3'>
          <Step number={1} title={t('howTo.stx.one.title')}>
            {t('howTo.stx.one.body')}{' '}
            <a
              href='#/'
              className='font-semibold text-grape underline underline-offset-2'
            >
              {t('howTo.stx.one.link')}
            </a>
          </Step>
          <Step number={2} title={t('howTo.stx.two.title')}>
            {t('howTo.stx.two.body')}
          </Step>
          <Step number={3} title={t('howTo.stx.three.title')}>
            {t('howTo.stx.three.body')}{' '}
            <a
              href={statusHref()}
              className='font-semibold text-grape underline underline-offset-2'
            >
              {t('howTo.stx.three.link')}
            </a>
          </Step>
        </ol>
      </section>

      <section className='mt-12' aria-labelledby='how-to-sbtc'>
        <h2 id='how-to-sbtc' className='text-2xl font-bold'>
          {t('howTo.sbtc.heading')}
        </h2>
        <p className='mt-1 text-muted'>{t('howTo.sbtc.intro')}</p>

        <ol className='mt-4 space-y-3'>
          <Step number={1} title={t('howTo.sbtc.one.title')}>
            {t('howTo.sbtc.one.body')}{' '}
            {/* In the step rather than in a row of cards below it. Three cards
                for three names and nothing else made a section out of a list,
                and put the names a scroll away from the step that says to pick
                one of them. */}
            <span className='mt-2 flex flex-wrap gap-x-3 gap-y-1'>
              {SBTC_POOLS.map((pool) =>
                pool.url === null ? (
                  // Named without a link rather than sent somewhere unchecked.
                  <span key={pool.id} className='text-sm font-semibold'>
                    {pool.name}
                  </span>
                ) : (
                  <a
                    key={pool.id}
                    href={pool.url}
                    target='_blank'
                    rel='noreferrer'
                    className='text-sm font-semibold text-grape underline underline-offset-2'
                  >
                    {pool.name}
                  </a>
                ),
              )}
            </span>
          </Step>
          <Step number={2} title={t('howTo.sbtc.two.title')}>
            {t('howTo.sbtc.two.body')}
          </Step>
          <Step number={3} title={t('howTo.sbtc.three.title')}>
            {t('howTo.sbtc.three.body')}
          </Step>
        </ol>

        <p className='mt-4 text-sm text-muted'>{t('howTo.sbtc.poolsNote')}</p>
      </section>
    </main>
  );
}

/** One numbered step: a heading, a sentence, and sometimes a way on. */
function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className='flex gap-4 rounded-3xl bg-card p-5 shadow-lift'>
      <span
        aria-hidden='true'
        className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grape text-lg font-extrabold text-on-grape'
      >
        {number}
      </span>
      <span className='min-w-0'>
        <strong className='block text-lg font-bold text-ink'>{title}</strong>
        <span className='mt-1 block text-muted'>{children}</span>
      </span>
    </li>
  );
}
