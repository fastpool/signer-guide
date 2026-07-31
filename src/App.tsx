import { useMemo, useState } from 'react';
import SignerCard from './components/SignerCard';
import data from './data/signers.json';
import { PROFILES } from './lib/profiles';
import type { SignerData } from './lib/types';

const signerData = data as SignerData;

/** A fee we would call low. Not a promise — see the note under the filters. */
const LOW_FEE_BIPS = 500; // 5%

type FilterId = 'bitcoin' | 'lowFee' | 'open';

const FILTERS: { id: FilterId; label: string; help: string }[] = [
  {
    id: 'bitcoin',
    label: 'Rewards in Bitcoin',
    help: 'Pays your rewards to a Bitcoin address, instead of as sBTC on Stacks.',
  },
  {
    id: 'lowFee',
    label: 'Low fee (under 5%)',
    help: 'The fee the pool charges today is under 5%. Pools can change their fee later.',
  },
  {
    id: 'open',
    label: 'Anyone can join',
    help: 'No invitation or membership needed — you can stake with this pool yourself.',
  },
];

function matches(
  signer: SignerData['signers'][number],
  active: Set<FilterId>,
): boolean {
  if (active.has('bitcoin') && !signer.bitcoinRewards) return false;
  if (active.has('open') && !signer.openToAnyone) return false;
  if (active.has('lowFee')) {
    // A pool with no fee in its own contract is not counted as low: the fee
    // may simply live somewhere else. Better to leave it out than to promise.
    if (signer.feeBips === null || signer.feeBips >= LOW_FEE_BIPS) return false;
  }
  return true;
}

export default function App() {
  const [active, setActive] = useState<Set<FilterId>>(new Set());

  const shown = useMemo(
    () => signerData.signers.filter((s) => matches(s, active)),
    [active],
  );

  const toggle = (id: FilterId) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = signerData.signers.length;

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <header className='flex flex-col gap-4'>
        <h1 className='text-4xl font-extrabold md:text-5xl'>
          Where can you stake your STX?
        </h1>
        <p className='text-lg text-muted'>
          When you stake, you pick a pool to look after it for you. There are{' '}
          <strong className='text-ink'>{total} pools</strong> to choose from
          today. They work in different ways — this page lets you compare them
          in plain words.
        </p>
      </header>

      <section className='mt-10' aria-labelledby='filters-heading'>
        <h2 id='filters-heading' className='text-sm font-bold text-muted'>
          What matters to you?
        </h2>
        <div className='mt-3 flex flex-wrap gap-2'>
          {FILTERS.map((filter) => {
            const on = active.has(filter.id);
            return (
              <button
                key={filter.id}
                type='button'
                aria-pressed={on}
                title={filter.help}
                onClick={() => toggle(filter.id)}
                className={`rounded-full px-4 py-2 font-semibold transition-colors ${
                  on
                    ? 'bg-grape text-white'
                    : 'bg-white text-ink shadow-[0_1px_3px_rgba(44,42,53,0.08)] hover:bg-grape-soft'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <ul className='mt-3 space-y-1 text-sm text-muted'>
          {FILTERS.filter((f) => active.has(f.id)).map((f) => (
            <li key={f.id}>{f.help}</li>
          ))}
        </ul>
      </section>

      <p className='mt-8 font-semibold'>
        {shown.length === total
          ? `Showing all ${total} pools`
          : `${shown.length} of ${total} pools match`}
      </p>

      {shown.length === 0 && (
        <p className='mt-4 rounded-3xl bg-white p-6 text-muted shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          No pool matches everything you picked. Try turning one off.
        </p>
      )}

      <ul className='mt-4 space-y-4'>
        {shown.map((signer) => (
          <SignerCard
            key={signer.contractId}
            signer={signer}
            summary={
              signer.profileId
                ? (Object.values(PROFILES).find(
                    (p) => p.id === signer.profileId,
                  )?.summary ?? null)
                : null
            }
          />
        ))}
      </ul>

      <footer className='mt-12 space-y-3 border-t border-black/5 pt-6 text-sm text-muted'>
        <p>
          <strong className='text-ink'>About the fees.</strong> The fee shown is
          the one in force right now, read from the pool&rsquo;s own contract.
          No pool locks its fee in, so a pool can change it later. Some pools
          have no fee in this contract at all — that does not always mean free,
          because the fee may be taken elsewhere.
        </p>
        <p>
          Every pool here is registered on Stacks and identified by what its
          code adds up to, not by its name — so two pools running the same code
          are shown as such. Checked for cycle {signerData.feeCycle}, last
          updated{' '}
          {new Date(signerData.generatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
          .
        </p>
      </footer>
    </main>
  );
}
