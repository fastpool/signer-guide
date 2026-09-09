/**
 * What a protocol bond holds, and what it could hold.
 *
 * pox-5 runs bonds as *periods*: period `i` opens at reward cycle
 * `first-bond-period-cycle + i * BOND_GAP_CYCLES` and runs for
 * `BOND_LENGTH_CYCLES` after that. On mainnet the gap is 2 and the length is
 * 12, so a new period starts every other cycle and six of them overlap at any
 * moment. "The current bond" here is the period the chain is in — the newest
 * one that has opened — and "the next bond" is the one that opens after it.
 *
 * A period is nobody's until the bond admin calls `setup-bond`, which is the
 * call that carries the allowlist: a list of stakers and, for each, the most
 * sats they may lock against that bond. That list is the whole basis of the
 * estimate. It is *not* a promise — an allowlisted staker may lock nothing —
 * so everything below keeps the two apart:
 *
 *   ceiling     the allowlist added up. The most this bond can ever hold.
 *   registered  what stakers have actually locked, from pox-5's own total.
 *
 * ## Getting the allowlist back out
 *
 * pox-5 stores allowances in a map keyed by `{bond-index, staker}` and offers
 * no way to list its keys, so there is no read that answers "who is on this
 * bond's allowlist". What there is: `setup-bond` prints one
 * `add-to-allowlist` event per staker, and it can only be called once per
 * bond. So the names come from that transaction's events, and then every one
 * of them is confirmed against `get-bond-allowance` — the map itself — rather
 * than trusted. A print says what was asked for; the map says what is true.
 *
 * Finding that transaction means looking through the bond admin's own
 * transactions, which is the one soft edge here: an allowlist set up by a
 * previous admin, or further back than `SETUP_TX_PAGES` pages, will not be
 * found. When that happens the rows do not add up to pox-5's total for the
 * bond, and `allowlistComplete` says so rather than the page quietly showing
 * a ceiling that is missing people.
 */

import {
  ClarityType,
  hexToCV,
  principalCV,
  uintCV,
  type ClarityValue,
} from '@stacks/transactions';
import { mapPaced } from './node.js';
import { callReadOnly, fetchJson, readDataVar } from './read-only.js';

export const POX5 = 'SP000000000000000000002Q6VF78.pox-5';

/**
 * `BOND_LENGTH_CYCLES`, which pox-5 holds as a constant and exposes through
 * no read-only function. Used only as a fallback: for a bond that has been
 * set up, `bondLengthFromEvents` reads the real figure out of the
 * `setup-bond` print, which carries both the first cycle and the unlock one.
 */
export const BOND_LENGTH_CYCLES = 12;

/** How many pages of the admin's transactions to look through for a setup. */
const SETUP_TX_PAGES = 4;
const TX_PAGE = 50;
/** The events endpoint's own maximum page. */
const EVENT_PAGE = 100;

/**
 * A read that came back with something, with nothing, or not at all.
 *
 * Three states rather than two, for the reason the rest of `scripts/` keeps
 * repeating: a bond nobody has set up and a bond the node would not tell us
 * about are different facts, and writing either as the other puts a wrong
 * number on the page instead of an absent one.
 */
export type Answer<T> =
  | { kind: 'value'; value: T }
  | { kind: 'none' }
  | { kind: 'unread' };

/** One staker on a bond's allowlist, and the most sats they may lock. */
export interface AllowlistEntry {
  staker: string;
  maxSats: bigint;
}

/** The terms `setup-bond` fixed for a period. */
export interface BondTerms {
  targetRate: bigint;
  stxValueRatio: bigint;
  minUstxRatio: bigint;
}

/** A staker's live bond registration, as pox-5 holds it. */
export interface BondMembership {
  bondIndex: number;
  amountSats: bigint;
  amountUstx: bigint;
  isL1Lock: boolean;
  signer: string;
}

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

function asUint(cv: ClarityValue | null): bigint | null {
  if (cv === null || cv.type !== ClarityType.UInt) return null;
  // The library types a uint's value loosely enough to include the string a
  // hand-built value could carry, so it is converted rather than asserted.
  return BigInt(cv.value);
}

/** A `uint` as a JS number, for the small ones — cycles and block heights. */
function asNumber(cv: ClarityValue | null): number | null {
  const value = asUint(cv);
  return value === null ? null : Number(value);
}

/** `(optional …)`, keeping "the node said none" apart from "we could not ask". */
function asOptional(cv: ClarityValue | null): Answer<ClarityValue> {
  if (cv === null) return { kind: 'unread' };
  if (cv.type === ClarityType.OptionalNone) return { kind: 'none' };
  if (cv.type === ClarityType.OptionalSome) {
    return { kind: 'value', value: cv.value };
  }
  return { kind: 'unread' };
}

function tupleFields(cv: ClarityValue): Record<string, ClarityValue> | null {
  return cv.type === ClarityType.Tuple ? cv.value : null;
}

function fieldUint(
  fields: Record<string, ClarityValue>,
  name: string,
): bigint | null {
  return asUint(fields[name] ?? null);
}

function fieldPrincipal(
  fields: Record<string, ClarityValue>,
  name: string,
): string | null {
  const value = fields[name];
  if (!value) return null;
  if (
    value.type !== ClarityType.PrincipalStandard &&
    value.type !== ClarityType.PrincipalContract
  ) {
    return null;
  }
  return value.value;
}

function fieldAscii(
  fields: Record<string, ClarityValue>,
  name: string,
): string | null {
  const value = fields[name];
  return value && value.type === ClarityType.StringASCII ? value.value : null;
}

function fieldBool(
  fields: Record<string, ClarityValue>,
  name: string,
): boolean | null {
  const value = fields[name];
  if (!value) return null;
  if (value.type === ClarityType.BoolTrue) return true;
  if (value.type === ClarityType.BoolFalse) return false;
  return null;
}

/* ------------------------------------------------------------------ *
 * Which periods are the current one and the next one
 * ------------------------------------------------------------------ */

/**
 * The period the chain is in, and the one after it.
 *
 * `current` is null before the very first period opens — the only time there
 * is no current bond at all. Everything after that has one, whether or not
 * anybody set it up, because a period exists as a slot in the schedule before
 * it exists as a bond.
 */
export function bondIndexes(
  currentCycle: number,
  firstBondPeriodCycle: number,
  gapCycles: number,
): { current: number | null; next: number } {
  if (gapCycles < 1) throw new Error(`A bond gap of ${gapCycles} cycles`);
  if (currentCycle < firstBondPeriodCycle) return { current: null, next: 0 };
  const current = Math.floor((currentCycle - firstBondPeriodCycle) / gapCycles);
  return { current, next: current + 1 };
}

/* ------------------------------------------------------------------ *
 * Reading pox-5
 * ------------------------------------------------------------------ */

export async function readCurrentCycle(): Promise<number | null> {
  return asNumber(await callReadOnly(POX5, 'current-pox-reward-cycle'));
}

export async function readFirstBondPeriodCycle(): Promise<number | null> {
  return asNumber(await readDataVar(POX5, 'first-bond-period-cycle'));
}

export async function readBondPeriodCycle(
  bondIndex: number,
): Promise<number | null> {
  return asNumber(
    await callReadOnly(POX5, 'bond-period-to-reward-cycle', [
      uintCV(bondIndex),
    ]),
  );
}

export async function readBondStartHeight(
  bondIndex: number,
): Promise<number | null> {
  return asNumber(
    await callReadOnly(POX5, 'bond-period-to-burn-height', [uintCV(bondIndex)]),
  );
}

/**
 * `BOND_GAP_CYCLES`, worked out rather than assumed.
 *
 * The constant is not readable, but the schedule it defines is: two adjacent
 * periods are exactly one gap apart, and `bond-period-to-reward-cycle` will
 * answer for any index whether or not a bond exists there.
 */
export async function readGapCycles(): Promise<number | null> {
  const [first, second] = await Promise.all([
    readBondPeriodCycle(0),
    readBondPeriodCycle(1),
  ]);
  if (first === null || second === null) return null;
  const gap = second - first;
  return gap > 0 ? gap : null;
}

export async function readBondAdmin(): Promise<string | null> {
  const cv = await readDataVar(POX5, 'bond-admin');
  if (cv === null) return null;
  if (
    cv.type !== ClarityType.PrincipalStandard &&
    cv.type !== ClarityType.PrincipalContract
  ) {
    return null;
  }
  return cv.value;
}

export async function readProtocolBond(
  bondIndex: number,
): Promise<Answer<BondTerms>> {
  const answer = asOptional(
    await callReadOnly(POX5, 'get-protocol-bond', [uintCV(bondIndex)]),
  );
  if (answer.kind !== 'value') return answer;

  const fields = tupleFields(answer.value);
  if (!fields) return { kind: 'unread' };
  const targetRate = fieldUint(fields, 'target-rate');
  const stxValueRatio = fieldUint(fields, 'stx-value-ratio');
  const minUstxRatio = fieldUint(fields, 'min-ustx-ratio');
  if (targetRate === null || stxValueRatio === null || minUstxRatio === null) {
    return { kind: 'unread' };
  }
  return {
    kind: 'value',
    value: { targetRate, stxValueRatio, minUstxRatio },
  };
}

/** pox-5's own total for a bond. Null when it could not be read, never zero. */
export async function readRegisteredSats(
  bondIndex: number,
): Promise<bigint | null> {
  return asUint(
    await callReadOnly(POX5, 'get-total-sbtc-staked-for-bond', [
      uintCV(bondIndex),
    ]),
  );
}

/** The allowance map itself, which is what an allowlist print is checked against. */
export async function readAllowance(
  bondIndex: number,
  staker: string,
): Promise<Answer<bigint>> {
  const answer = asOptional(
    await callReadOnly(POX5, 'get-bond-allowance', [
      uintCV(bondIndex),
      principalCV(staker),
    ]),
  );
  if (answer.kind !== 'value') return answer;
  const sats = asUint(answer.value);
  return sats === null ? { kind: 'unread' } : { kind: 'value', value: sats };
}

/**
 * A staker's live bond, or none.
 *
 * pox-5 keeps one membership per staker, not one per bond: registering for a
 * later period replaces the earlier one, and `get-bond-membership` answers
 * `none` once the term is over. So this says which bond a staker is in *now*,
 * and a row for bond `i` counts only when the membership names `i`.
 */
export async function readMembership(
  staker: string,
): Promise<Answer<BondMembership>> {
  const answer = asOptional(
    await callReadOnly(POX5, 'get-bond-membership', [principalCV(staker)]),
  );
  if (answer.kind !== 'value') return answer;

  const fields = tupleFields(answer.value);
  if (!fields) return { kind: 'unread' };
  const bondIndex = fieldUint(fields, 'bond-index');
  const amountSats = fieldUint(fields, 'amount-sats');
  const amountUstx = fieldUint(fields, 'amount-ustx');
  const isL1Lock = fieldBool(fields, 'is-l1-lock');
  const signer = fieldPrincipal(fields, 'signer');
  if (
    bondIndex === null ||
    amountSats === null ||
    amountUstx === null ||
    isL1Lock === null ||
    signer === null
  ) {
    return { kind: 'unread' };
  }
  return {
    kind: 'value',
    value: {
      bondIndex: Number(bondIndex),
      amountSats,
      amountUstx,
      isL1Lock,
      signer,
    },
  };
}

/* ------------------------------------------------------------------ *
 * The setup transaction, and the allowlist inside it
 * ------------------------------------------------------------------ */

interface Tx {
  tx_id?: string;
  tx_status?: string;
  contract_call?: {
    contract_id?: string;
    function_name?: string;
    function_args?: { repr?: string }[];
  };
}

/**
 * A row of the address transactions endpoint.
 *
 * It has answered both shapes over the API's life — the transaction itself,
 * and the transaction under a `tx` key beside the transfers it made — so both
 * are unwrapped rather than one being assumed. Reading the wrong one finds no
 * setup at all, which shows up as an empty allowlist and a bond whose ceiling
 * is silently zero.
 */
type AddressTx = Tx & { tx?: Tx };

/**
 * The `setup-bond` that created this bond, by transaction id.
 *
 * Only a successful one counts: a `setup-bond` that aborted printed nothing
 * and set up nothing, and there are aborted ones on mainnet — the first
 * attempt at bond 0 among them.
 */
export async function findSetupBondTxid(
  admin: string,
  bondIndex: number,
  pages = SETUP_TX_PAGES,
): Promise<string | null> {
  for (let page = 0; page < pages; page += 1) {
    const body = await fetchJson<{ results?: AddressTx[] }>(
      `/extended/v1/address/${admin}/transactions` +
        `?limit=${TX_PAGE}&offset=${page * TX_PAGE}`,
    );
    if (!body?.results) return null;

    for (const row of body.results) {
      const tx = row.tx ?? row;
      const call = tx.contract_call;
      if (
        tx.tx_status === 'success' &&
        call?.contract_id === POX5 &&
        call.function_name === 'setup-bond' &&
        call.function_args?.[0]?.repr === `u${bondIndex}`
      ) {
        if (tx.tx_id) return tx.tx_id;
      }
    }

    if (body.results.length < TX_PAGE) return null;
  }
  return null;
}

/**
 * Every `print` a transaction emitted, as hex-encoded Clarity.
 *
 * Hex rather than the `repr` beside it: these are decoded with the same
 * library that encodes the arguments, so a field this misreads is a field the
 * chain would have misread too. Null when a page could not be read, because
 * half an allowlist is worse than none — it would read as a smaller ceiling
 * rather than as a missing one.
 */
export async function fetchPrintEvents(
  txid: string,
): Promise<string[] | null> {
  const hexes: string[] = [];

  for (let offset = 0; ; offset += EVENT_PAGE) {
    const body = await fetchJson<{
      event_count?: number;
      events?: { contract_log?: { value?: { hex?: string } } }[];
    }>(`/extended/v1/tx/${txid}?event_limit=${EVENT_PAGE}&event_offset=${offset}`);
    if (!body?.events) return null;

    for (const event of body.events) {
      const hex = event.contract_log?.value?.hex;
      if (hex) hexes.push(hex);
    }

    const total = body.event_count ?? 0;
    if (offset + EVENT_PAGE >= total || body.events.length === 0) return hexes;
  }
}

/** One decoded print, or null for anything that is not a tuple. */
function printFields(hex: string): Record<string, ClarityValue> | null {
  try {
    return tupleFields(hexToCV(hex));
  } catch {
    return null;
  }
}

/**
 * The allowlist `setup-bond` was given, in the order it was given in.
 *
 * The bond index is checked on every print rather than assumed from the
 * transaction: one call sets up one bond, but reading it off the event costs
 * nothing and means a mis-picked transaction produces an empty allowlist
 * instead of somebody else's.
 */
export function allowlistFromEvents(
  hexes: readonly string[],
  bondIndex: number,
): AllowlistEntry[] {
  const entries: AllowlistEntry[] = [];

  for (const hex of hexes) {
    const fields = printFields(hex);
    if (!fields) continue;
    if (fieldAscii(fields, 'topic') !== 'add-to-allowlist') continue;
    if (Number(fieldUint(fields, 'bond-index') ?? -1) !== bondIndex) continue;

    const staker = fieldPrincipal(fields, 'staker');
    const maxSats = fieldUint(fields, 'max-sats');
    if (staker === null || maxSats === null) continue;
    entries.push({ staker, maxSats });
  }

  return entries;
}

/**
 * How many cycles this bond runs for, from its own setup print.
 *
 * `BOND_LENGTH_CYCLES` is a constant nobody can read off the contract, and
 * hard-coding 12 into a page that states an unlock cycle as fact would be the
 * page believing this file rather than the chain. The print carries both ends
 * of the term, so for a bond that exists the length is a subtraction.
 */
export function bondLengthFromEvents(
  hexes: readonly string[],
  bondIndex: number,
): number | null {
  for (const hex of hexes) {
    const fields = printFields(hex);
    if (!fields) continue;
    if (fieldAscii(fields, 'topic') !== 'setup-bond') continue;
    if (Number(fieldUint(fields, 'bond-index') ?? -1) !== bondIndex) continue;

    const first = fieldUint(fields, 'first-reward-cycle');
    const unlock = fieldUint(fields, 'unlock-cycle');
    if (first === null || unlock === null) continue;
    const length = Number(unlock - first);
    if (length > 0) return length;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Putting one period together
 * ------------------------------------------------------------------ */

/** A row as the file holds it, before it is turned into strings. */
export interface StakerRow {
  staker: string;
  maxSats: bigint;
  registeredSats: bigint;
  amountUstx: bigint | null;
  isL1Lock: boolean | null;
  signer: string | null;
}

/**
 * The allowlist confirmed against the chain, biggest ceiling first.
 *
 * Each name costs two reads: what pox-5 will let them lock, and what they
 * have locked. A staker whose allowance the node would not confirm is dropped
 * — the print alone is a record of what was submitted, and this file is meant
 * to be a record of what is true.
 */
export async function buildStakerRows(
  bondIndex: number,
  allowlist: readonly AllowlistEntry[],
): Promise<StakerRow[]> {
  const rows = await mapPaced(allowlist, async (entry) => {
    const [allowance, membership] = await Promise.all([
      readAllowance(bondIndex, entry.staker),
      readMembership(entry.staker),
    ]);
    if (allowance.kind !== 'value') return null;

    const inThisBond =
      membership.kind === 'value' && membership.value.bondIndex === bondIndex
        ? membership.value
        : null;

    return {
      staker: entry.staker,
      maxSats: allowance.value,
      registeredSats: inThisBond?.amountSats ?? 0n,
      amountUstx: inThisBond?.amountUstx ?? null,
      isL1Lock: inThisBond?.isL1Lock ?? null,
      signer: inThisBond?.signer ?? null,
    } satisfies StakerRow;
  });

  return rows
    .filter((row): row is StakerRow => row !== null)
    .sort((a, b) => {
      if (a.maxSats !== b.maxSats) return a.maxSats > b.maxSats ? -1 : 1;
      return a.staker.localeCompare(b.staker);
    });
}

export function sumMaxSats(rows: readonly StakerRow[]): bigint {
  return rows.reduce((total, row) => total + row.maxSats, 0n);
}

export function sumRegisteredSats(rows: readonly StakerRow[]): bigint {
  return rows.reduce((total, row) => total + row.registeredSats, 0n);
}

/**
 * Whether the rows account for everything pox-5 says is in the bond.
 *
 * The only way a bond holds sats is a staker on its allowlist registering
 * them, so the rows and pox-5's own total have to agree. When they do not,
 * this reconstruction of the allowlist is missing somebody — a setup by a
 * previous admin, or one further back than the pages searched — and the page
 * says the ceiling is a floor rather than showing it as the whole story.
 *
 * A total we could not read is not a disagreement: nothing has been checked,
 * so nothing is claimed either way, and `false` is the honest answer.
 */
export function allowlistComplete(
  rows: readonly StakerRow[],
  registeredSats: bigint | null,
): boolean {
  if (registeredSats === null) return false;
  return sumRegisteredSats(rows) === registeredSats;
}
