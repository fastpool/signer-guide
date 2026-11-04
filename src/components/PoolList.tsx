import { useMemo, useRef, useState } from 'react';
import { inUse, isNewSigner } from '../lib/activity';
import { stxCompact } from '../lib/amounts';
import { translator, type Locale, type MessageKey } from '../lib/i18n';
import {
  joinMode,
  rewardCurrencies,
  stakesHere,
  type JoinMode,
  type RewardCurrency,
} from '../lib/pool-facts';
import {
  FILTER_IDS,
  isHighFee,
  matches as poolMatches,
  type FilterId,
} from '../lib/pool-filters';
import { contractTypeName } from '../lib/profile-i18n';
import { signerHref } from '../lib/route';
import { groupsForContract } from '../lib/signer-groups';
import {
  nodesBySignerKey,
  votingPowerBips,
  type SignerNode,
} from '../lib/signer-nodes';
import { ellipsedAddr } from '../lib/strings';
import type { LockedTotals, Signer, StxOnlyCalculations } from '../lib/types';
import { isBondPool, netApyPercent } from '../lib/pool-yield';
import { pricesFrom } from '../lib/prices';
import Badge, { feePercent, noticeLabel } from './Badge';
import Identicon from './Identicon';
import PoolName from './PoolName';
import StakeModal from './StakeModal';
import { InfoTip, useEdgeFade } from './ui';

type SortKey = 'staked' | 'next' | 'yield' | 'fee' | 'share' | 'name';

const SORTS: SortKey[] = ['staked', 'next', 'yield', 'fee', 'share', 'name'];

/** The filters offered as chips. `inUse` is the "show empty pools" toggle. */
const CHIP_FILTERS = FILTER_IDS.filter((id) => id !== 'inUse');

const big = (value: string | null | undefined): bigint | null =>
  value === null || value === undefined ? null : BigInt(value);

/** Largest first, unknowns last — an unread amount is not a small one. */
function byAmount(a: bigint | null, b: bigint | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b > a ? 1 : b < a ? -1 : 0;
}

/**
 * A pool named only by the plumbing in its contract id — "signer-manager" —
 * has no name to lead with. Its address does the job instead, and the name
 * goes underneath, because a list where three rows say "signer-manager" is a
 * list where three rows cannot be told apart.
 */
function hasOwnName(signer: Signer): boolean {
  const contractName = signer.contractId.split('.')[1];
  return (
    signer.displayNameSource === 'manual' ||
    signer.displayName.toLowerCase() !== contractName.toLowerCase()
  );
}

interface Row {
  signer: Signer;
  /**
   * The amount as the file has it: null when the refresh could not read it,
   * undefined when the pool registered after the refresh ran. Two different
   * things to say about a pool, so the cell says them differently.
   */
  nowRaw: string | null | undefined;
  now: bigint | null;
  next: bigint | null;
  /**
   * The vote share of the signer key, not of this contract: pox-5 weighs the
   * key, so every contract on one key carries the same figure.
   */
  shareBips: number | null;
  /** How many contracts share that key — the note under a repeated share. */
  keyContracts: number;
  /**
   * What a staker keeps, a year, at today's rate and today's fee. Null for a
   * fee held somewhere else, or without a rate or price.
   */
  netApy: number | null;
  group: string | null;
  isNew: boolean;
}

/**
 * Every pool, one line each, comparable down the column.
 *
 * This replaced a card per pool, each repeating its contract type's whole
 * description: forty of them were fifteen thousand pixels of page, and the
 * fee of the twentieth was a long way from the fee of the first. On a wide
 * screen it is a table, sortable by each figure; on a phone it is two lines a
 * pool, the amount on the right, and a tap opens the pool.
 */
export default function PoolList({
  signers,
  totals,
  calculations,
  locale,
}: {
  signers: Signer[];
  totals: LockedTotals;
  /** The rate and the STX price the yield column is worked out from. */
  calculations: StxOnlyCalculations;
  locale: Locale;
}) {
  const t = translator(locale);
  const rate = useMemo(() => {
    try {
      return calculations.rateSatsPer1000Stx == null
        ? null
        : BigInt(calculations.rateSatsPer1000Stx);
    } catch {
      return null;
    }
  }, [calculations.rateSatsPer1000Stx]);
  const { stxPriceSats } = pricesFrom(calculations);
  const [active, setActive] = useState<Set<FilterId>>(
    () => new Set<FilterId>(['inUse']),
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('staked');
  const chips = useRef<HTMLDivElement>(null);
  const chipFade = useEdgeFade(chips);

  const nodes = useMemo(() => nodesBySignerKey(signers), [signers]);
  const nodeOf = useMemo(() => {
    const map = new Map<string, SignerNode>();
    for (const node of nodes) {
      for (const contract of node.contracts) map.set(contract.contractId, node);
    }
    return map;
  }, [nodes]);

  const rows = useMemo<Row[]>(
    () =>
      signers.map((signer) => {
        const node = nodeOf.get(signer.contractId);
        return {
          signer,
          nowRaw: totals.ustx[signer.contractId],
          now: big(totals.ustx[signer.contractId]),
          next: totals.next ? big(totals.next.ustx[signer.contractId]) : null,
          shareBips: node ? votingPowerBips(node, totals.ustx) : null,
          keyContracts: node?.contracts.length ?? 1,
          netApy: netApyPercent({
            rateSatsPer1000Stx: rate,
            stxPriceSats,
            feeBips: signer.feeBips,
          }),
          group:
            groupsForContract(signer.contractId, signer.signerKey)[0]?.name ??
            null,
          isNew: isNewSigner(signer, totals.cycle),
        };
      }),
    [signers, totals, nodeOf, rate, stxPriceSats],
  );

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const matching = rows.filter(
      (row) =>
        poolMatches(row.signer, active, totals) &&
        (needle === '' ||
          row.signer.displayName.toLowerCase().includes(needle) ||
          row.signer.contractId.toLowerCase().includes(needle) ||
          (row.group ?? '').toLowerCase().includes(needle)),
    );
    const order: Record<SortKey, (a: Row, b: Row) => number> = {
      staked: (a, b) => byAmount(a.now, b.now),
      next: (a, b) => byAmount(a.next, b.next),
      // Cheapest first; a fee the contract does not hold sorts last.
      fee: (a, b) =>
        (a.signer.feeBips ?? Number.MAX_SAFE_INTEGER) -
          (b.signer.feeBips ?? Number.MAX_SAFE_INTEGER) ||
        byAmount(a.now, b.now),
      share: (a, b) => (b.shareBips ?? -1) - (a.shareBips ?? -1),
      // Highest first; a yield that cannot be worked out sorts last.
      yield: (a, b) =>
        (b.netApy ?? -1) - (a.netApy ?? -1) || byAmount(a.now, b.now),
      name: (a, b) =>
        a.signer.displayName.localeCompare(
          b.signer.displayName,
          t.bundle.intlLocale,
        ),
    };
    return [...matching].sort(order[sort]);
  }, [rows, active, totals, needle, sort, t.bundle.intlLocale]);

  const hiddenEmpty = active.has('inUse')
    ? rows.filter((row) => !inUse(row.signer, totals)).length
    : 0;
  const maxShare = Math.max(1, ...shown.map((row) => row.shareBips ?? 0));

  const toggle = (id: FilterId) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sortLabel = (key: SortKey): string =>
    t(`pools.sort.${key}` as MessageKey, {
      cycle: totals.cycle,
      next: totals.next?.cycle ?? totals.cycle + 1,
    });

  const header = (
    key: SortKey,
    label: string,
    align: 'left' | 'right',
    help?: string,
  ) => (
    <th
      scope='col'
      aria-sort={sort === key ? 'descending' : undefined}
      // A head with a help mark may wrap: "Yield after fee" over two lines is
      // narrower than any figure under it.
      className={`px-2 py-2.5 text-xs font-bold text-muted ${
        help ? 'max-w-24' : 'whitespace-nowrap'
      } ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type='button'
        onClick={() => setSort(key)}
        className={`hover:text-grape ${sort === key ? 'text-grape' : ''}`}
      >
        {label}
        {sort === key && <span aria-hidden='true'> ▾</span>}
      </button>
      {help && (
        <>
          {' '}
          <InfoTip text={help} />
        </>
      )}
    </th>
  );

  return (
    <section aria-labelledby='pools-heading'>
      <h2 id='pools-heading' className='sr-only'>
        {t('app.allPools')}
      </h2>

      <div className='flex flex-wrap items-center gap-2'>
        <label className='sr-only' htmlFor='pool-search'>
          {t('pools.searchLabel')}
        </label>
        <input
          id='pool-search'
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('pools.searchPlaceholder')}
          className='w-full rounded-full bg-card px-4 py-2 text-sm shadow-lift placeholder:text-faint focus:ring-2 focus:ring-grape focus:outline-none sm:w-60'
        />
        <div
          ref={chips}
          style={chipFade}
          className='-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0'
        >
          {CHIP_FILTERS.map((id) => {
            const on = active.has(id);
            const label: MessageKey = `filter.${id}.label`;
            const help: MessageKey = `filter.${id}.help`;
            return (
              <button
                key={id}
                type='button'
                aria-pressed={on}
                title={t(help)}
                onClick={() => toggle(id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  on
                    ? 'bg-grape text-on-grape'
                    : 'bg-card text-ink shadow-lift hover:bg-grape-soft'
                }`}
              >
                {t(label)}
              </button>
            );
          })}
        </div>
      </div>

      <div className='mt-3 mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm'>
        <p className='font-bold' aria-live='polite'>
          {t.plural('pools.count', shown.length)}
          {hiddenEmpty > 0 && (
            <span className='font-normal text-muted'>
              {' · '}
              {t.plural('pools.hiddenEmpty', hiddenEmpty)}{' '}
              <button
                type='button'
                onClick={() => toggle('inUse')}
                className='font-semibold text-grape underline underline-offset-2'
              >
                {t('pools.showEmpty')}
              </button>
            </span>
          )}
          {!active.has('inUse') && (
            <span className='font-normal text-muted'>
              {' · '}
              <button
                type='button'
                onClick={() => toggle('inUse')}
                className='font-semibold text-grape underline underline-offset-2'
              >
                {t('pools.hideEmpty')}
              </button>
            </span>
          )}
        </p>
        {/* On a phone there are no column heads to sort by. */}
        <label className='flex items-center gap-2 text-muted lg:hidden'>
          {t('pools.sortBy')}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className='rounded-lg bg-card px-2 py-1 font-semibold text-grape shadow-lift'
          >
            {SORTS.map((key) => (
              <option key={key} value={key}>
                {sortLabel(key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Legend locale={locale} />

      {shown.length === 0 && (
        <p className='rounded-2xl bg-card p-5 text-muted shadow-lift'>
          {t('app.noMatch')}
        </p>
      )}

      {shown.length > 0 && (
        <>
          <div className='hidden overflow-x-auto rounded-2xl bg-card shadow-lift lg:block'>
            <table className='w-full border-collapse text-sm'>
              <thead className='border-b border-hairline'>
                <tr>
                  {header('name', t('pools.col.pool'), 'left')}
                  <th
                    scope='col'
                    // On the pool's own page too; below 1280px the table
                    // needs the room more.
                    className='hidden px-2 py-2.5 text-left text-xs font-bold text-muted xl:table-cell'
                  >
                    {t('pools.col.type')}
                  </th>
                  {header('fee', t('pools.col.fee'), 'left')}
                  {header(
                    'yield',
                    t('pools.col.yield'),
                    'right',
                    t('pools.yieldHelp'),
                  )}
                  <th
                    scope='col'
                    className='px-2 py-2.5 text-left text-xs font-bold text-muted'
                  >
                    {t('pools.col.join')}
                  </th>
                  <th
                    scope='col'
                    className='px-2 py-2.5 text-left text-xs font-bold text-muted'
                  >
                    {t('pools.col.rewards')}
                  </th>
                  {header('staked', sortLabel('staked'), 'right')}
                  {header(
                    'share',
                    t('pools.col.share'),
                    'right',
                    t('pools.shareHelp'),
                  )}
                  <th scope='col' className='px-2 py-2.5'>
                    <span className='sr-only'>{t('pools.col.stake')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <TableRow
                    key={row.signer.contractId}
                    row={row}
                    maxShare={maxShare}
                    nextCycle={totals.next?.cycle ?? totals.cycle + 1}
                    locale={locale}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <ul className='overflow-hidden rounded-2xl bg-card shadow-lift lg:hidden'>
            {shown.map((row) => (
              <PhoneRow key={row.signer.contractId} row={row} locale={locale} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function NameBlock({
  row,
  locale,
  withSub = true,
}: {
  row: Row;
  locale: Locale;
  /** The line under the name; a phone row has its facts there instead. */
  withSub?: boolean;
}) {
  const t = translator(locale);
  const { signer } = row;
  const [address, contractName] = signer.contractId.split('.');
  const own = hasOwnName(signer);
  const sub = own
    ? (row.group ?? `${ellipsedAddr(address)}.${contractName}`)
    : row.group
      ? t('pools.unnamedIn', { group: row.group })
      : t('pools.unnamed');
  return (
    <span className='min-w-0'>
      <span className='flex items-center gap-1.5 font-bold'>
        <span className='truncate'>
          {own ? (
            <PoolName signer={signer} locale={locale} />
          ) : (
            <span className='font-mono text-[0.85em]'>
              {ellipsedAddr(address)}
            </span>
          )}
        </span>
        {row.isNew && (
          <Badge tone='warm' size='sm'>
            {t('badge.new')}
          </Badge>
        )}
      </span>
      {withSub && (
        <span className='block truncate text-xs text-muted'>{sub}</span>
      )}
    </span>
  );
}

/**
 * The fee, and under it only the protections the pool actually has.
 *
 * "no cap · no notice" under nearly every row said the same nothing forty
 * times, so absence is left blank and a protection, being rare, stands out:
 * a shield for a ceiling the code enforces, a clock for the warning a change
 * has to give.
 */
function FeeCell({ signer, locale }: { signer: Signer; locale: Locale }) {
  const t = translator(locale);
  // A word, not a dash: in a fee column a dash reads as "no fee", which is
  // the one thing this cell cannot say. The full sentence is the hover.
  if (signer.feeBips === null) {
    return (
      <span title={t('pools.feeElsewhere')} className='text-xs text-muted'>
        {t('pools.feeElsewhereShort')}
      </span>
    );
  }
  const high = isHighFee(signer);
  return (
    <span className='block'>
      <span className={`font-bold ${high ? 'text-rose' : ''}`}>
        {feePercent(signer.feeBips)}
      </span>
      {(signer.maxFeeBips !== null || signer.feeChangeNotice) && (
        <span className='mt-0.5 flex flex-col text-xs text-mint'>
          {signer.maxFeeBips !== null && (
            <span title={t('pools.capHelp')}>
              <span aria-hidden='true'>⛉ </span>
              {t('pools.cap', { percent: signer.maxFeeBips / 100 })}
            </span>
          )}
          {signer.feeChangeNotice && (
            <span title={t('pools.noticeHelp')}>
              <span aria-hidden='true'>◷ </span>
              {t('pools.noticeShort', {
                notice: noticeLabel(signer.feeChangeNotice, locale),
              })}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

const JOIN_TONE: Record<JoinMode, 'good' | 'warm' | 'fact'> = {
  anyone: 'good',
  invite: 'warm',
  nativePool: 'fact',
};

export function JoinTag({
  signer,
  locale,
}: {
  signer: Signer;
  locale: Locale;
}) {
  const t = translator(locale);
  const mode = joinMode(signer);
  return (
    <Badge tone={JOIN_TONE[mode]} size='sm' title={t(`join.${mode}.help`)}>
      {t(`join.${mode}.short`)}
    </Badge>
  );
}

const CURRENCY_TONE: Record<RewardCurrency, 'btc' | 'neutral'> = {
  btc: 'btc',
  sbtc: 'btc',
  stx: 'neutral',
};

export function RewardTags({
  signer,
  locale,
}: {
  signer: Signer;
  locale: Locale;
}) {
  const t = translator(locale);
  return (
    <span className='flex gap-1'>
      {rewardCurrencies(signer).map((currency) => (
        <Badge
          key={currency}
          tone={CURRENCY_TONE[currency]}
          size='sm'
          title={t(`currency.${currency}.help`)}
        >
          {t(`currency.${currency}`)}
        </Badge>
      ))}
    </span>
  );
}

function Change({
  row,
  locale,
  inline = false,
}: {
  row: Row;
  locale: Locale;
  /** Run on after the amount, in the table's two-line Staked cell. */
  inline?: boolean;
}) {
  const display = inline ? 'inline' : 'block';
  const t = translator(locale);
  if (row.next === null) return null;
  if (row.now === null || row.now === 0n) {
    return row.next > 0n ? (
      <span className={`${display} text-xs text-mint`}>
        {t('pools.change.new')}
      </span>
    ) : null;
  }
  // An invite-only pool is filled by its operator, often late in the cycle,
  // so an empty next cycle is "not yet" rather than a hundred per cent gone.
  if (row.next === 0n) {
    return (
      <span className={`${display} text-xs text-muted`}>
        {t('pools.change.notYet')}
      </span>
    );
  }
  const percent = Number(((row.next - row.now) * 1000n) / row.now) / 10;
  if (Math.abs(percent) < 1) {
    return (
      <span className={`${display} text-xs text-muted`}>
        {t('pools.change.same')}
      </span>
    );
  }
  return (
    <span
      className={`${display} text-xs ${percent > 0 ? 'text-mint' : 'text-amber-warm'}`}
    >
      {percent > 0 ? '+' : '−'}
      {Math.round(Math.abs(percent))}%
    </span>
  );
}

function TableRow({
  row,
  maxShare,
  nextCycle,
  locale,
}: {
  row: Row;
  maxShare: number;
  nextCycle: number;
  locale: Locale;
}) {
  const t = translator(locale);
  const { signer } = row;
  const href = signerHref(signer.contractId);
  const typeName = contractTypeName(signer, locale);
  return (
    <tr className='border-b border-hairline last:border-b-0 hover:bg-card-raised'>
      <td className='max-w-52 px-2 py-2 pl-3'>
        <a href={href} className='flex items-center gap-2.5'>
          <Identicon
            hash={signer.identiconHash}
            locale={locale}
            className='h-8 w-8'
          />
          <NameBlock row={row} locale={locale} />
        </a>
      </td>
      <td className='hidden max-w-32 px-2 py-2 text-xs text-muted xl:table-cell'>
        {typeName ?? (
          <span className='font-semibold text-amber-warm'>
            {t('pools.unreviewed')}
          </span>
        )}
      </td>
      <td className='max-w-32 px-2 py-2'>
        <FeeCell signer={signer} locale={locale} />
      </td>
      <td className='px-2 py-2 text-right whitespace-nowrap tabular-nums'>
        <YieldCell row={row} locale={locale} />
      </td>
      <td className='px-2 py-2'>
        <JoinTag signer={signer} locale={locale} />
      </td>
      <td className='px-2 py-2'>
        <RewardTags signer={signer} locale={locale} />
      </td>
      {/* Two lines: this cycle, and the next one filling. The next cycle had
          a column of its own, which the yield column needed more. */}
      <td className='px-2 py-2 text-right whitespace-nowrap tabular-nums'>
        <strong>
          <Amount raw={row.nowRaw} locale={locale} />
        </strong>
        <span
          className='block text-xs text-muted'
          title={t('pools.nextInlineHelp', { cycle: nextCycle })}
        >
          {t('pools.nextInline', {
            cycle: nextCycle,
            amount:
              stxCompact(row.next, locale)?.replace(/ STX$/, '') ??
              t('pools.amountUnknown'),
          })}{' '}
          <Change row={row} locale={locale} inline />
        </span>
      </td>
      <td className='px-2 py-2 text-right whitespace-nowrap tabular-nums'>
        {row.shareBips === null ? (
          <Missing reason='unknown' locale={locale} />
        ) : (
          <>
            <span className='inline-flex items-center gap-2'>
              {(row.shareBips / 100).toFixed(2)}%
              <span
                aria-hidden='true'
                className='h-1.5 w-10 overflow-hidden rounded-full bg-trough'
              >
                <span
                  className='block h-full rounded-full bg-grape'
                  style={{ width: `${(row.shareBips / maxShare) * 100}%` }}
                />
              </span>
            </span>
            {row.keyContracts > 1 && (
              <span className='block text-xs text-muted'>
                {t.plural('pools.shareSharedKey', row.keyContracts)}
              </span>
            )}
          </>
        )}
      </td>
      <td className='px-2 py-2 pr-3 text-right'>
        {stakesHere(signer) ? (
          <StakeModal
            signer={signer}
            locale={locale}
            compact
            variant={isHighFee(signer) ? 'secondary' : 'primary'}
          />
        ) : (
          <a
            href={href}
            className='text-xs font-semibold text-grape underline underline-offset-2'
          >
            {t('pools.details')}
          </a>
        )}
      </td>
    </tr>
  );
}

/** An amount, or why there is none: not readable, or not read yet. */
function Amount({
  raw,
  locale,
}: {
  raw: string | null | undefined;
  locale: Locale;
}) {
  if (raw === undefined) return <Missing reason='notRead' locale={locale} />;
  if (raw === null) return <Missing reason='unknown' locale={locale} />;
  return <>{stxCompact(raw, locale)}</>;
}

/**
 * A figure that is not there, said in a word. A dash had one hover title per
 * meaning, and a phone has no hover, so all the meanings looked the same.
 */
function Missing({
  reason,
  locale,
}: {
  reason: 'unknown' | 'notRead';
  locale: Locale;
}) {
  const t = translator(locale);
  return (
    <span
      title={t(
        reason === 'unknown' ? 'pools.unknownAmount' : 'pools.notReadYet',
      )}
      className='text-xs font-normal text-muted'
    >
      {t(reason === 'unknown' ? 'pools.amountUnknown' : 'pools.amountNotRead')}
    </span>
  );
}

/**
 * What the marks in the list mean, above the list rather than under forty
 * rows of it. The italic in particular is invisible as a signal until
 * somebody says it is one.
 */
function Legend({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <p className='mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted'>
      <span>
        <span aria-hidden='true' className='text-grape'>
          ✓{' '}
        </span>
        {t('pools.legend.checked')}
      </span>
      <span>
        <span className='italic'>{t('pools.legend.italicSample')}</span>{' '}
        {t('pools.legend.italic')}
      </span>
      <span>
        <span aria-hidden='true' className='text-mint'>
          ⛉{' '}
        </span>
        {t('pools.legend.cap')}
      </span>
      <span>
        <span aria-hidden='true' className='text-mint'>
          ◷{' '}
        </span>
        {t('pools.legend.notice')}
      </span>
    </p>
  );
}

/** "8.12%" — one place, so the table and the phone row round alike. */
function yieldPercent(apy: number, locale: Locale): string {
  const t = translator(locale);
  return `${apy.toLocaleString(t.bundle.intlLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * The yield a staker keeps, a year. A fee that keeps the reward keeps the
 * yield too, so it is red for the same pools the fee is red for; a fee this
 * contract does not hold leaves nothing to work out.
 */
function YieldCell({ row, locale }: { row: Row; locale: Locale }) {
  const t = translator(locale);
  const { signer } = row;
  if (row.netApy === null) {
    return (
      <span
        title={
          signer.feeBips === null
            ? t('pools.feeElsewhere')
            : t('pools.yieldUnknown')
        }
        className='text-xs text-muted'
      >
        {signer.feeBips === null
          ? t('pools.feeElsewhereShort')
          : t('pools.amountUnknown')}
      </span>
    );
  }
  return (
    <span className='block'>
      <span className={`font-bold ${isHighFee(signer) ? 'text-rose' : ''}`}>
        {yieldPercent(row.netApy, locale)}
      </span>
      {isBondPool(signer) && (
        <span className='block text-xs text-muted' title={t('pools.bondHelp')}>
          {t('pools.bondPlus')}
        </span>
      )}
    </span>
  );
}

function PhoneRow({ row, locale }: { row: Row; locale: Locale }) {
  const t = translator(locale);
  const { signer } = row;
  const join = joinMode(signer);
  const currencies = rewardCurrencies(signer);
  const fee =
    signer.feeBips === null
      ? t('pools.phone.feeElsewhere')
      : t('pools.phone.fee', { fee: feePercent(signer.feeBips) ?? '' });
  const cap =
    signer.maxFeeBips !== null
      ? ` (${t('pools.cap', { percent: signer.maxFeeBips / 100 })})`
      : '';
  const meta = [
    ...(row.netApy !== null
      ? [t('pools.phone.yield', { percent: yieldPercent(row.netApy, locale) })]
      : []),
    fee + cap,
    t(`join.${join}.short`),
    currencies.map((c) => t(`currency.${c}`)).join(' + '),
  ].join(' · ');
  return (
    <li className='border-b border-hairline last:border-b-0'>
      <a
        href={signerHref(signer.contractId)}
        className='grid grid-cols-[2rem_1fr_auto] items-center gap-x-2.5 px-3 py-2.5 active:bg-card-raised'
      >
        <Identicon
          hash={signer.identiconHash}
          locale={locale}
          className='row-span-2 h-8 w-8'
        />
        <span className='min-w-0'>
          <NameBlock row={row} locale={locale} withSub={false} />
        </span>
        <span className='text-right text-sm font-extrabold whitespace-nowrap tabular-nums'>
          <Amount raw={row.nowRaw} locale={locale} />
        </span>
        <span className='min-w-0 truncate text-xs text-muted'>{meta}</span>
        <span className='text-right text-xs whitespace-nowrap text-muted tabular-nums'>
          {row.next === null
            ? ''
            : t('pools.phone.next', {
                amount:
                  stxCompact(row.next, locale) ?? t('pools.amountUnknown'),
              })}
        </span>
      </a>
    </li>
  );
}
