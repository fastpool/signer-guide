import { useMemo, useState } from 'react';
import ContractPage from './components/ContractPage';
import SignerCard from './components/SignerCard';
import data from './data/signers.json';
import totalsData from './data/totals.json';
import { stxLabel, sumUstx } from './lib/amounts';
import { PROFILES } from './lib/profiles';
import { contractHref, useRoute } from './lib/route';
import { buildTemplates, templateFor } from './lib/templates';
import type { LockedTotals, SignerData } from './lib/types';

const signerData = data as SignerData;

/**
 * What each pool holds, read from pox-5 by the hourly refresh rather than by
 * every visitor. See the note at the top of scripts/locked.ts.
 */
const totals = totalsData as LockedTotals;

/** A fee we would call low. Not a promise — see the note under the filters. */
const LOW_FEE_BIPS = 500; // 5%

const REPO_URL = 'https://github.com/fastpool/signer-guide';
const FASTPOOL_URL = 'https://fastpool.org';
const SIGNUP_FORM_URL =
  typeof import.meta.env.VITE_SIGNER_UPDATES_FORM_URL === 'string' &&
  import.meta.env.VITE_SIGNER_UPDATES_FORM_URL.length > 0
    ? import.meta.env.VITE_SIGNER_UPDATES_FORM_URL
    : null;

/**
 * When the data was last read from the chain, in words.
 *
 * To the minute, and said in the middle of the page rather than only at the
 * bottom: the fees and amounts above are facts with a shelf life, and the
 * refresh runs hourly. A reader deciding where to put their STX should be
 * able to see how old the numbers are without hunting for it.
 */
const lastUpdate = (() => {
  const at = new Date(signerData.generatedAt);
  const day = at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // The clock is built by hand rather than left to toLocaleString, which
  // words the join differently between ICU versions ("at 15:11" here, ",
  // 15:11" on another machine) — not something the page should vary by.
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
})();

export type FilterId =
  'bitcoin' | 'lowFee' | 'cappedFee' | 'feeNotice' | 'open';

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
    id: 'feeNotice',
    label: 'Fee changes announced first',
    help: 'A new fee cannot take effect the moment the pool decides on it — the contract makes it wait, so you have time to notice and move.',
  },
  {
    id: 'open',
    label: 'Anyone can join',
    help: 'No invitation or membership needed — you can stake with this pool yourself.',
  },
];

export function matches(
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
  if (active.has('feeNotice') && !signer.feeChangeNotice) return false;
  if (active.has('lowFee')) {
    // A pool with no fee in its own contract is not counted as low: the fee
    // may simply live somewhere else. Better to leave it out than to promise.
    if (signer.feeBips === null || signer.feeBips >= LOW_FEE_BIPS) return false;
  }
  return true;
}

const CONTRACT_IDS = signerData.signers.map((s) => s.contractId);

export default function App() {
  const route = useRoute();
  const [active, setActive] = useState<Set<FilterId>>(new Set());

  const templates = useMemo(() => buildTemplates(signerData.signers), []);

  const shown = useMemo(() => {
    const matching = signerData.signers.filter((s) => matches(s, active));
    // Biggest first: the list is easier to read when the pools people
    // actually use are at the top.
    return [...matching].sort((a, b) => {
      const left = BigInt(totals.ustx[a.contractId] ?? 0);
      const right = BigInt(totals.ustx[b.contractId] ?? 0);
      return right > left ? 1 : right < left ? -1 : 0;
    });
  }, [active]);

  const staked = sumUstx(CONTRACT_IDS, totals.ustx);

  if (route.name === 'contract') {
    const template = templateFor(templates, route.profileId);
    if (template) {
      return <ContractPage template={template} lockedUstx={totals.ustx} />;
    }
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
        <a
          href={FASTPOOL_URL}
          className='flex items-center gap-2 self-start text-sm font-semibold text-muted transition-colors hover:text-grape'
        >
          <img
            src='/fastpool-logo.svg'
            alt=''
            width='36'
            height='36'
            className='rounded-xl bg-grape'
          />
          Fast Pool
        </a>
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
        {staked !== null && (
          <p className='text-lg text-muted'>
            Between them they are looking after{' '}
            <strong className='text-ink'>{stxLabel(staked.toString())}</strong>{' '}
            for cycle {totals.cycle}.
          </p>
        )}
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

      <p className='mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted'>
        <span className='inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 font-bold text-ink shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
          <span className='h-2 w-2 rounded-full bg-mint' aria-hidden='true' />
          Last update: {lastUpdate}
        </span>
        <span>Fees and amounts are read from the chain again every hour.</span>
      </p>

      <section className='mt-8 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]' aria-labelledby='updates-signup-heading'>
        <h2 id='updates-signup-heading' className='text-xl font-bold'>
          Get signer updates by email
        </h2>
        <p className='mt-1 text-sm text-muted'>
          Join the list for changes to signers and signer configurations.
        </p>
        <form
          className='mt-4 flex flex-col gap-3 sm:flex-row'
          action={SIGNUP_FORM_URL ?? undefined}
          method='post'
        >
          <label htmlFor='signup-email' className='sr-only'>
            Email address
          </label>
          <input
            id='signup-email'
            name='email'
            type='email'
            autoComplete='email'
            required
            placeholder='you@example.com'
            className='w-full rounded-full border border-black/10 px-4 py-2.5 text-ink outline-none transition-colors placeholder:text-muted/80 focus:border-grape'
          />
          <button
            type='submit'
            disabled={SIGNUP_FORM_URL === null}
            className='rounded-full bg-grape px-5 py-2.5 font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50'
          >
            Sign up
          </button>
        </form>
        {SIGNUP_FORM_URL === null && (
          <p className='mt-2 text-xs text-muted'>
            Signup is not configured yet. Set VITE_SIGNER_UPDATES_FORM_URL to enable it.
          </p>
        )}
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
            lockedUstx={totals.ustx[signer.contractId]}
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
          decides. Fewer still make a fee change wait before it applies, which
          gives you time to move — those carry a <em>fee changes announced</em>{' '}
          badge. Some pools have no fee in this contract at all, which does not
          always mean free, because the fee may be taken elsewhere.
        </p>
        <p>
          Every pool here is registered on Stacks and identified by what its
          code adds up to, not by its name — so two pools running the same
          signer contract are shown as such. Fees were read from each
          contract&rsquo;s own storage on {lastUpdate}, and the amounts staked
          are for cycle {totals.cycle}.
        </p>
        <p>
          Nothing here is taken on trust, and neither should this page be:{' '}
          <a
            className='font-semibold text-grape underline underline-offset-2'
            href={REPO_URL}
            target='_blank'
            rel='noreferrer'
          >
            read the code on GitHub
          </a>{' '}
          — every claim above comes from a line of Clarity you can check
          yourself.
        </p>
        <p>
          Made by{' '}
          <a
            className='font-semibold text-grape underline underline-offset-2'
            href={FASTPOOL_URL}
          >
            Fast Pool
          </a>
          , which runs some of the pools listed above. They are described by the
          same code as everyone else&rsquo;s and ranked by size like everyone
          else&rsquo;s — the reason all of this is public is so you do not have
          to take that on trust either.
        </p>
      </footer>
    </main>
  );
}
