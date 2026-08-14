import { useEffect, useMemo, useRef, useState } from 'react';
import { exactStxLabel } from '../lib/amounts';
import { explorerUrl } from '../lib/explorer';
import { translator, type Locale } from '../lib/i18n';
import {
  MAX_ADDRESSES,
  parseAddressList,
  takeAddresses,
  type AddressEntry,
} from '../lib/principals';
import { signerHref, statusHref } from '../lib/route';
import { cyclesRemaining, fetchCycleState } from '../lib/staking';
import {
  readAllStatuses,
  unlocksAtCycle,
  type AddressStatus,
} from '../lib/status';
import { ellipsedAddr } from '../lib/strings';
import type { Signer } from '../lib/types';
import Badge from './Badge';
import LocaleSwitch from './LocaleSwitch';

/**
 * What one or more addresses are staking.
 *
 * The one page here that asks a node about something a reader typed, and the
 * one that says "you" — everywhere else the guide describes pools, and this
 * describes your own position. So it borrows the staking dialog's words rather
 * than inventing a second vocabulary for the same facts: `stake.position.*` is
 * the copy the dialog shows above its form, and it says exactly what this page
 * needs to say about a stake that already exists.
 *
 * Addresses arrive two ways. A link carries them in the hash, which is what a
 * pool operator hands somebody; the box takes a pasted list, which is what
 * anybody with more than one address has already got written down somewhere.
 * Both end in the same place, and looking a list up rewrites the hash so the
 * result is a link that can be sent on.
 */
export default function StatusPage({
  principals,
  signers,
  locale,
  onLocaleChange,
}: {
  /** From the hash; empty means the box, waiting to be filled in. */
  principals: string[];
  /** The pools the guide knows, so a signer contract can be named and linked. */
  signers: Signer[];
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = translator(locale);
  const [input, setInput] = useState(principals.join('\n'));
  /** Answers as they land, by address. */
  const [answers, setAnswers] = useState<Map<string, AddressStatus>>(new Map());
  const [rejected, setRejected] = useState<string[]>([]);
  const [dropped, setDropped] = useState(0);
  const [reading, setReading] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  /** Bumped per look-up, so a slow one cannot land on top of a newer one. */
  const readId = useRef(0);

  const asked: AddressEntry[] = useMemo(
    () => principals.map((address) => ({ address, label: null })),
    [principals],
  );

  /**
   * Every address the link named, whether or not it has an answer yet.
   *
   * Derived rather than held in state, so the list is complete on the very
   * first render: it has its full height before anything lands, and nothing
   * jumps under a reader's finger as the rows fill in.
   */
  const rows: AddressStatus[] = useMemo(
    () =>
      asked.map(
        (entry) =>
          answers.get(entry.address) ?? {
            ...entry,
            position: null,
            unlockedUstx: null,
            lockedUstx: null,
            failed: false,
          },
      ),
    [asked, answers],
  );

  useEffect(() => {
    setAnswers(new Map());
    if (asked.length === 0) return;

    const id = ++readId.current;
    const controller = new AbortController();
    setReading(true);

    void fetchCycleState()
      .then((state) => {
        if (id === readId.current) setCurrentCycle(state.rewardCycleId);
      })
      .catch(() => {
        // Only used to say how many cycles are left; the rest stands without it.
      });

    void readAllStatuses(
      asked,
      (row) => {
        if (id !== readId.current) return;
        setAnswers((current) => new Map(current).set(row.address, row));
      },
      controller.signal,
    ).finally(() => {
      if (id === readId.current) setReading(false);
    });

    return () => {
      controller.abort();
    };
  }, [asked]);

  const onLookUp = () => {
    const parsed = parseAddressList(input);
    const { taken, dropped: over } = takeAddresses(parsed.entries);
    setRejected(parsed.rejected);
    setDropped(over);
    if (taken.length === 0) return;
    // Through the hash, so the result is a link and the back button works.
    window.location.hash = statusHref(taken.map((e) => e.address));
  };

  return (
    <main className='mx-auto max-w-3xl px-5 py-12 md:py-20'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <a
          href='#/'
          className='text-sm font-semibold text-grape underline underline-offset-2'
        >
          {t('status.back')}
        </a>
        <LocaleSwitch locale={locale} onChange={onLocaleChange} />
      </div>

      <h1 className='mt-6 text-4xl font-extrabold md:text-5xl'>
        {t('status.heading')}
      </h1>
      <p className='mt-4 text-lg text-muted'>{t('status.intro')}</p>

      <section className='mt-8 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
        <label
          htmlFor='status-addresses'
          className='block text-sm font-bold text-ink'
        >
          {t('status.inputLabel')}
        </label>
        <p className='mt-1 text-xs text-muted'>
          {t('status.inputHint', { max: MAX_ADDRESSES })}
        </p>
        <textarea
          id='status-addresses'
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={'SP2C2…\nSP3VR…  # savings'}
          className='mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-sm'
        />
        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <button
            type='button'
            onClick={onLookUp}
            disabled={reading}
            className='rounded-full bg-grape px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50'
          >
            {reading ? t('status.reading') : t('status.lookUp')}
          </button>
          {rows.length > 0 && (
            <a
              href='#/status'
              className='text-sm font-semibold text-muted underline underline-offset-2 hover:text-ink'
            >
              {t('status.clear')}
            </a>
          )}
        </div>

        {dropped > 0 && (
          <p className='mt-3 rounded-xl bg-amber-soft p-3 text-xs text-amber-warm'>
            {t('status.tooMany', { max: MAX_ADDRESSES, dropped })}
          </p>
        )}
        {rejected.length > 0 && (
          <div className='mt-3 rounded-xl bg-amber-soft p-3 text-xs text-amber-warm'>
            {/* Named, not counted: a line quietly skipped is an address
                nobody hears about again. */}
            <p className='font-semibold'>
              {t.plural('status.rejected', rejected.length)}
            </p>
            <ul className='mt-1 space-y-0.5 font-mono break-all'>
              {rejected.slice(0, 5).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section className='mt-8'>
          <h2 className='text-2xl font-bold'>
            {t.plural('status.resultsHeading', rows.length)}
          </h2>
          <ul className='mt-4 space-y-3'>
            {rows.map((row) => (
              <StatusCard
                key={row.address}
                row={row}
                signers={signers}
                currentCycle={currentCycle}
                locale={locale}
              />
            ))}
          </ul>
          <p className='mt-4 text-xs text-muted'>{t('status.readNote')}</p>
        </section>
      )}
    </main>
  );
}

/** One address, in the staking dialog's words. */
function StatusCard({
  row,
  signers,
  currentCycle,
  locale,
}: {
  row: AddressStatus;
  signers: Signer[];
  currentCycle: number | null;
  locale: Locale;
}) {
  const t = translator(locale);
  const pool = row.position
    ? (signers.find((s) => s.contractId === row.position?.signer) ?? null)
    : null;

  /**
   * Still being read: no position, no balance, nothing gone wrong yet. Said as
   * "reading" rather than shown as an answer, because an empty row that looks
   * settled is a reader being told they are not staking.
   */
  const pending =
    !row.failed &&
    row.position === null &&
    row.unlockedUstx === null &&
    row.lockedUstx === null;

  const remaining =
    row.position !== null && currentCycle !== null
      ? cyclesRemaining({ position: row.position, currentCycle })
      : null;

  return (
    <li className='rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <a
          className='font-mono text-sm font-semibold break-all underline underline-offset-2'
          href={explorerUrl(row.address)}
          target='_blank'
          rel='noreferrer'
          title={row.address}
        >
          {ellipsedAddr(row.address, 18)}
        </a>
        {row.label && <span className='text-xs text-muted'>{row.label}</span>}
      </div>

      {pending && (
        <p className='mt-2 text-sm text-muted'>{t('stake.checking')}</p>
      )}

      {row.failed && (
        <p className='mt-2 text-sm text-amber-warm'>{t('status.unreadable')}</p>
      )}

      {!pending && !row.failed && row.position === null && (
        <>
          <p className='mt-2 text-sm font-semibold text-ink'>
            {t('status.notStaking')}
          </p>
          {row.lockedUstx !== null && row.lockedUstx > 0n && (
            // Locked, but pox-5 has no position for it — staking somewhere
            // this page cannot see rather than idle, and the difference
            // matters to whoever is deciding what to do about it.
            <p className='mt-1 text-sm text-muted'>
              {t('status.lockedElsewhere', {
                amount: exactStxLabel(row.lockedUstx, locale),
              })}
            </p>
          )}
        </>
      )}

      {row.position && (
        <>
          <p className='mt-2 text-sm font-bold text-ink'>
            {t('stake.position.title')}
          </p>
          <p className='mt-1 text-sm text-ink'>
            {t('stake.position.amount', {
              amount: exactStxLabel(row.position.amountUstx, locale),
              pool: pool?.displayName ?? row.position.signer,
            })}
          </p>
          <p className='mt-1 text-sm text-muted'>
            {t.plural('stake.position.cycles', row.position.numCycles, {
              first: row.position.firstRewardCycle,
            })}{' '}
            {t('stake.position.cyclesHint')}
          </p>

          {remaining !== null && (
            <p className='mt-2 flex flex-wrap items-center gap-2 text-sm'>
              {remaining < 0 ? (
                <Badge tone='warm'>{t('status.ended')}</Badge>
              ) : remaining === 0 ? (
                <Badge tone='warm'>{t('status.endsThisCycle')}</Badge>
              ) : (
                <Badge tone='good'>
                  {t.plural('status.cyclesLeft', remaining)}
                </Badge>
              )}
              <span className='text-muted'>
                {t('status.unlocksAt', {
                  cycle: unlocksAtCycle(row.position),
                })}
              </span>
            </p>
          )}

          <p className='mt-2 text-sm text-ink'>
            {row.position.payout === null
              ? t('stake.position.rewardsUnknown')
              : row.position.payout.route.kind === 'sbtc'
                ? t('stake.position.rewardsSbtc')
                : t.rich('stake.position.rewardsBitcoin', {
                    address: (
                      <span
                        className='font-mono'
                        title={row.position.payout.route.address}
                      >
                        {ellipsedAddr(row.position.payout.route.address, 16)}
                      </span>
                    ),
                  })}
          </p>

          {pool && (
            <p className='mt-2 text-sm'>
              <a
                className='font-semibold text-grape underline underline-offset-2'
                href={signerHref(pool.contractId)}
              >
                {t('status.aboutPool', { pool: pool.displayName })}
              </a>
            </p>
          )}
        </>
      )}

      {row.unlockedUstx !== null && row.unlockedUstx > 0n && (
        <p className='mt-2 text-sm text-muted'>
          {t('status.unlocked', {
            amount: exactStxLabel(row.unlockedUstx, locale),
          })}
        </p>
      )}
    </li>
  );
}
