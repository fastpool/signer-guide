import { useEffect, useRef, useState } from 'react';
import { satsLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import {
  readAddressRewards,
  totalAtPox5,
  type AddressRewards as Rewards,
} from '../lib/rewards';

/**
 * What one staked address has earned, and where the sBTC is sitting.
 *
 * This was a page of its own — `#/rewards/mine` — beside the address check,
 * which asked the same reader for the same address and then answered half the
 * question. The two are one page now, and this is the half that costs
 * something: a call to pox-5 for every cycle since it opened, then a probe or
 * two of the pool. So it is a request rather than something every row pays
 * for, the way the conduct section treats a signer's history.
 *
 * The one exception is a reader who asked about a single address, which is
 * what every link to the old page carries. They asked this question, and being
 * shown a button that says "ask it" is a page pretending not to know.
 */
export default function AddressRewards({
  address,
  signer,
  firstCycle,
  currentCycle,
  auto,
  locale,
}: {
  /** The resolved Stacks address — never a BNS name; pox-5 is asked with this. */
  address: string;
  /** The signer contract from their position. Every reward read is keyed by it. */
  signer: string;
  /** The first cycle pox-5 has, so nothing is asked about a cycle nobody earned in. */
  firstCycle: number | null;
  currentCycle: number | null;
  /** Read without being asked: a reader looking at one address asked already. */
  auto: boolean;
  locale: Locale;
}) {
  const t = translator(locale);
  const [open, setOpen] = useState(auto);
  const [reading, setReading] = useState(false);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  /** Bumped per read, so a slow answer cannot land on top of a newer one. */
  const readId = useRef(0);

  useEffect(() => {
    // Nothing to ask until the cycle range is known: without it the loop below
    // would ask about no cycles at all and report that as "earned nothing".
    if (!open || currentCycle === null) return;

    const id = (readId.current += 1);
    const first = firstCycle ?? currentCycle;
    const cycles: number[] = [];
    for (let cycle = first; cycle <= currentCycle; cycle += 1) {
      cycles.push(cycle);
    }

    setReading(true);
    void readAddressRewards({ address, signer, cycles, spacingMs: 350 })
      .then((answer) => {
        if (readId.current === id) setRewards(answer);
      })
      .finally(() => {
        if (readId.current === id) setReading(false);
      });
  }, [open, address, signer, firstCycle, currentCycle]);

  if (!open) {
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='mt-3 text-sm font-semibold text-grape underline underline-offset-2'
      >
        {t('myRewards.show')}
      </button>
    );
  }

  const pox5Total = rewards ? totalAtPox5(rewards.atPox5) : null;

  return (
    <div className='mt-4 border-t border-hairline pt-3'>
      <p className='text-sm font-bold text-ink'>{t('myRewards.title')}</p>

      {reading && !rewards && (
        <p className='mt-2 text-sm text-muted'>{t('myRewards.readingRow')}</p>
      )}

      {rewards && (
        <dl className='mt-2 space-y-4 text-sm'>
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
              <p className='mt-2 text-xs text-muted'>{t('myRewards.onlyYou')}</p>
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
                  {t('myRewards.atPoolNote', { getter: rewards.atPool.getter })}
                </p>
              </dd>
            </div>
          )}

          <p className='text-xs text-muted'>{t('myRewards.movedNote')}</p>
        </dl>
      )}
    </div>
  );
}
