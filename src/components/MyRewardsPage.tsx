import { useEffect, useRef, useState } from 'react';
import { satsLabel, stxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import { isLookupTarget } from '../lib/principals';
import { myRewardsHref, signerHref, statusHref } from '../lib/route';
import {
  readAddressRewards,
  readFirstPox5Cycle,
  totalAtPox5,
  type AddressRewards,
} from '../lib/rewards';
import { readAddressStatus } from '../lib/status';
import { fetchCycleState } from '../lib/staking';
import { ellipsedAddr } from '../lib/strings';
import type { Signer } from '../lib/types';
import LocaleSwitch from './LocaleSwitch';
import PoolName from './PoolName';

/**
 * What one address is owed in sBTC, and where it is sitting.
 *
 * The sibling of the address check, and deliberately the same shape: a box,
 * a link you can share, and rows that say "we could not read this" rather than
 * "you have nothing". The difference is the question — that page answers where
 * your STX is, this one answers what it has earned you and what you have to do
 * to get it.
 *
 * One address at a time. Each one costs a position read, a call per pox-5
 * cycle and a probe or two of the pool, which is most of an anonymous rate
 * limit's patience for one person.
 */
export default function MyRewardsPage({
  address,
  signers,
  locale,
  onLocaleChange,
}: {
  /** From the hash; empty means the box, waiting to be filled in. */
  address: string | null;
  signers: Signer[];
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const [input, setInput] = useState(address ?? '');
  const [reading, setReading] = useState(false);
  const [rewards, setRewards] = useState<AddressRewards | null>(null);
  const [position, setPosition] = useState<{
    signer: string | null;
    ustx: bigint | null;
    unread: boolean;
  } | null>(null);
  const [firstCycle, setFirstCycle] = useState<number | null>(null);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const readId = useRef(0);

  useEffect(() => {
    void fetchCycleState()
      .then((state) => setCurrentCycle(state.rewardCycleId))
      .catch(() => {});
    void readFirstPox5Cycle()
      .then(setFirstCycle)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!address) {
      setRewards(null);
      setPosition(null);
      return;
    }
    if (currentCycle === null) return;

    const id = (readId.current += 1);
    const first = firstCycle ?? currentCycle;
    const cycles: number[] = [];
    for (let cycle = first; cycle <= currentCycle; cycle += 1) cycles.push(cycle);

    setReading(true);
    setRewards(null);
    void (async () => {
      // Their position first: it names the signer every reward read is keyed
      // by, so there is nothing to ask pox-5 until it lands.
      const status = await readAddressStatus(address, null);
      if (readId.current !== id) return;
      setPosition({
        signer: status.position?.signer ?? null,
        ustx: status.position?.amountUstx ?? null,
        unread: status.failed,
      });

      const answer = await readAddressRewards({
        address: status.address ?? address,
        signer: status.position?.signer ?? null,
        cycles,
        spacingMs: 350,
      });
      if (readId.current !== id) return;
      setRewards(answer);
      setReading(false);
    })();
  }, [address, currentCycle, firstCycle]);

  const onLookUp = () => {
    const typed = input.trim();
    if (!typed || !isLookupTarget(typed)) return;
    // Through the hash, so the answer is a link and the back button works.
    window.location.hash = myRewardsHref(typed);
  };

  const pox5Total = rewards ? totalAtPox5(rewards.atPox5) : null;

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('myRewards.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-4xl font-extrabold md:text-5xl'>
        {t('myRewards.heading')}
      </h1>
      <p className='mt-4 text-lg text-muted'>{t('myRewards.intro')}</p>

      <section className='mt-8 rounded-3xl bg-card p-6 shadow-lift'>
        <label
          htmlFor='rewards-address'
          className='block text-sm font-bold text-ink'
        >
          {t('myRewards.inputLabel')}
        </label>
        <p className='mt-1 text-xs text-muted'>{t('myRewards.inputHint')}</p>
        <input
          id='rewards-address'
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onLookUp();
          }}
          spellCheck={false}
          placeholder='friedger.btc'
          className='mt-2 w-full rounded-xl border border-hairline bg-card px-3 py-2 font-mono text-sm'
        />
        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <button
            type='button'
            onClick={onLookUp}
            disabled={reading}
            className='rounded-full bg-grape px-5 py-2.5 text-sm font-semibold text-on-grape disabled:opacity-50'
          >
            {reading ? t('myRewards.reading') : t('myRewards.lookUp')}
          </button>
          <a
            href={statusHref()}
            className='text-sm font-semibold text-muted underline underline-offset-2 hover:text-ink'
          >
            {t('myRewards.orCheckAddress')}
          </a>
        </div>
      </section>

      {address && (
        <section className='mt-8'>
          <h2 className='text-2xl font-bold'>
            {t('myRewards.resultsHeading', { address: ellipsedAddr(address) })}
          </h2>

          {reading && !rewards && (
            <p className='mt-4 text-muted'>{t('myRewards.readingRow')}</p>
          )}

          {position?.unread && (
            <p className='mt-4 rounded-3xl bg-amber-soft p-6 text-sm text-amber-warm'>
              {t('myRewards.unread')}
            </p>
          )}

          {rewards && !rewards.signer && !position?.unread && (
            <p className='mt-4 rounded-3xl bg-card p-6 text-muted shadow-lift'>
              {t('myRewards.notStaking')}
            </p>
          )}

          {rewards?.signer && (
            <div className='mt-4 rounded-3xl bg-card p-6 shadow-lift'>
              <p className='text-sm text-muted'>
                {t.rich('myRewards.withPool', {
                  pool: (
                    <a
                      className='font-semibold text-grape underline underline-offset-2'
                      href={signerHref(rewards.signer)}
                    >
                      <PoolNameFor
                        contractId={rewards.signer}
                        signers={signers}
                        locale={locale}
                      />
                    </a>
                  ),
                  amount: (
                    <strong className='text-ink'>
                      {stxLabel(position?.ustx?.toString() ?? null, locale)}
                    </strong>
                  ),
                })}
              </p>

              <dl className='mt-5 space-y-4 text-sm'>
                <div>
                  <dt className='font-semibold'>{t('myRewards.atPox5')}</dt>
                  <dd className='mt-1'>
                    <strong className='text-lg'>
                      {satsLabel(pox5Total?.toString() ?? null, locale)}
                    </strong>
                    <ul className='mt-2 space-y-1 text-muted'>
                      {rewards.atPox5.map((reward) => (
                        <li key={reward.cycle}>
                          {t('myRewards.perCycle', {
                            cycle: reward.cycle,
                            amount:
                              reward.sats === null
                                ? t('myRewards.unreadCycle')
                                : satsLabel(reward.sats.toString(), locale),
                          })}
                        </li>
                      ))}
                    </ul>
                    <p className='mt-2 text-xs text-muted'>
                      {t('myRewards.onlyYou')}
                    </p>
                  </dd>
                </div>

                {rewards.atPool && (
                  <div>
                    <dt className='font-semibold'>{t('myRewards.atPool')}</dt>
                    <dd className='mt-1'>
                      <strong>
                        {satsLabel(rewards.atPool.sats.toString(), locale)}
                      </strong>
                      <p className='mt-1 text-xs text-muted'>
                        {t('myRewards.atPoolNote', {
                          getter: rewards.atPool.getter,
                        })}
                      </p>
                    </dd>
                  </div>
                )}
              </dl>

              <p className='mt-5 text-xs text-muted'>
                {t('myRewards.movedNote')}
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

/** The pool's name when the guide lists it, and its id when it does not. */
function PoolNameFor({
  contractId,
  signers,
  locale,
}: {
  contractId: string;
  signers: Signer[];
  locale: Locale;
}) {
  const signer = signers.find((s) => s.contractId === contractId);
  if (!signer) return <>{ellipsedAddr(contractId.split('.')[0])}.{contractId.split('.')[1]}</>;
  return <PoolName signer={signer} locale={locale} />;
}
