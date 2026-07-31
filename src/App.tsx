import { useMemo, useState } from 'react';
import ContractPage from './components/ContractPage';
import SignerCard from './components/SignerCard';
import data from './data/signers.json';
import { PROFILES } from './lib/profiles';
import { contractHref, useRoute } from './lib/route';
import { buildTemplates, templateFor } from './lib/templates';
import type { SignerData } from './lib/types';

const signerData = data as SignerData;

/** A fee we would call low. Not a promise — see the note under the filters. */
const LOW_FEE_BIPS = 500; // 5%

type FilterId = 'bitcoin' | 'lowFee' | 'cappedFee' | 'open';

/** A ceiling we would call reassuring. Juice Pool enforces exactly this. */
const CAPPED_FEE_BIPS = 2000; // 20%

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
    id: 'cappedFee',
    label: 'Fee capped at 20%',
    help: 'The contract itself refuses to let the fee go above 20%, whatever the pool decides. Most contracts have no such limit.',
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
  if (active.has('cappedFee')) {
    // A ceiling the code enforces, unlike the fee itself which can move.
    if (signer.maxFeeBips === null || signer.maxFeeBips > CAPPED_FEE_BIPS) {
      return false;
    }
  }
  if (active.has('lowFee')) {
    // A pool with no fee in its own contract is not counted as low: the fee
    // may simply live somewhere else. Better to leave it out than to promise.
    if (signer.feeBips === null || signer.feeBips >= LOW_FEE_BIPS) return false;
  }
  return true;
}

export default function App() {
  const route = useRoute();
  const [active, setActive] = useState<Set<FilterId>>(new Set());

  const templates = useMemo(
    () => buildTemplates(signerData.signers),
    [],
  );

  const shown = useMemo(
    () => signerData.signers.filter((s) => matches(s, active)),
    [active],
  );

  if (route.name === 'contract') {
    const template = templateFor(templates, route.profileId);
    if (template) return <ContractPage template={template} />;
  }

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
          today, but between them they run only{' '}
          <strong className='text-ink'>
            {templates.length} signer contracts
          </strong>{' '}
          — so there is less to learn than it looks.
        </p>
      </header>

      <section className='mt-10' aria-labelledby='contracts-heading'>
        <h2 id='contracts-heading' className='text-2xl font-bold'>
          The signer contracts
        </h2>
        <p className='mt-1 text-muted'>
          Each one behaves differently. Tap a contract to see what it does and
          who runs it.
        </p>
        <ul className='mt-4 grid gap-3 sm:grid-cols-2'>
          {templates.map((template) => (
            <li key={template.profile.id}>
              <a
                href={contractHref(template.profile.id)}
                className='flex h-full flex-col rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)] transition-colors hover:bg-grape-soft'
              >
                <span className='text-lg font-bold'>
                  {template.profile.name}
                </span>
                <span className='text-sm text-muted'>
                  {template.signers.length}{' '}
                  {template.signers.length === 1 ? 'pool' : 'pools'}
                </span>
                <span className='mt-2 text-sm text-muted'>
                  {template.profile.summary}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className='mt-12' aria-labelledby='filters-heading'>
        <h2 id='filters-heading' className='text-2xl font-bold'>
          All pools
        </h2>
        <p className='mt-1 text-sm font-bold text-muted'>
          What matters to you?
        </p>
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
          Most pools do not lock their fee in, so they can change it later. A
          few contracts do set a ceiling in code — those carry a{' '}
          <em>fee capped</em> badge, and that limit holds whatever the pool
          decides. Some pools have no fee in this contract at all, which does
          not always mean free, because the fee may be taken elsewhere.
        </p>
        <p>
          Every pool here is registered on Stacks and identified by what its
          code adds up to, not by its name — so two pools running the same
          signer contract are shown as such. Checked for cycle{' '}
          {signerData.feeCycle}, last updated{' '}
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
