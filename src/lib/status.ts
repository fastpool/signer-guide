/**
 * What a list of addresses is staking, read one at a time.
 *
 * The page this feeds is the only one in the guide that asks a node about
 * something a reader typed. Everything else here comes from two committed
 * files; this cannot, because the question is about an address nobody knew
 * about until it was pasted in.
 *
 * That makes pacing the whole design. Anonymously Hiro allows roughly fifty
 * requests a minute per IP, and one address costs up to four of them —
 * `get-staker-info`, then a payout getter or two, then the balance. Twenty
 * addresses fired at once is eighty requests in a second, which earns a 429
 * for most of them and reports a page of people as not staking. So they are
 * read in order, spaced out, and each result is handed back the moment it
 * lands rather than at the end: a reader watches the list fill in, and a limit
 * that bites late costs the last few rows rather than all of them.
 *
 * A row that could not be read says so. It is never shown as "not staking",
 * which is a claim about somebody's money that a rate limit is no evidence for.
 */

import { fetchStakedPosition, type StakedPosition } from './staking';

const STACKS_API_URL =
  typeof import.meta.env.VITE_STACKS_API_URL === 'string' &&
  import.meta.env.VITE_STACKS_API_URL.length > 0
    ? import.meta.env.VITE_STACKS_API_URL
    : 'https://api.hiro.so';

/** Long enough to stay under the anonymous limit with a list of twenty. */
const SPACING_MS = 350;

export interface AddressStatus {
  address: string;
  label: string | null;
  /** Null when this address is not staking; undefined never occurs. */
  position: StakedPosition | null;
  /** uSTX the account holds that is not locked, or null if unread. */
  unlockedUstx: bigint | null;
  /** uSTX the chain has locked, whoever it is locked with. */
  lockedUstx: bigint | null;
  /**
   * True when the node would not answer about this address.
   *
   * Kept apart from `position: null` for the reason the rest of this repo
   * keeps unknown apart from none: one is "they are not staking" and the other
   * is "we could not find out", and printing the second as the first tells
   * somebody their stake is gone.
   */
  failed: boolean;
}

interface Balances {
  stx?: { balance?: string; locked?: string };
}

const asUstx = (value: string | undefined): bigint | null =>
  value !== undefined && /^\d+$/.test(value) ? BigInt(value) : null;

/** Balance and lock for one address; nulls when the API would not say. */
async function fetchBalances(
  address: string,
  signal?: AbortSignal,
): Promise<{ unlockedUstx: bigint | null; lockedUstx: bigint | null }> {
  const res = await fetch(
    `${STACKS_API_URL}/extended/v1/address/${address}/balances`,
    { signal },
  );
  if (!res.ok) throw new Error(`balances failed (${res.status})`);
  const body = (await res.json()) as Balances;

  const balance = asUstx(body.stx?.balance);
  const locked = asUstx(body.stx?.locked);
  if (balance === null) return { unlockedUstx: null, lockedUstx: locked };
  // `balance` is everything the account holds, locked STX included — the same
  // trap `unlockedFromBalances` exists for in the staking dialog.
  const held = locked ?? 0n;
  return {
    unlockedUstx: balance > held ? balance - held : 0n,
    lockedUstx: locked,
  };
}

/** Everything one row of the page needs, or a row marked unreadable. */
export async function readAddressStatus(
  address: string,
  label: string | null,
  signal?: AbortSignal,
): Promise<AddressStatus> {
  const row: AddressStatus = {
    address,
    label,
    position: null,
    unlockedUstx: null,
    lockedUstx: null,
    failed: false,
  };

  try {
    row.position = await fetchStakedPosition({ address });
  } catch {
    // The stake is the point of the page, so failing to read it fails the row
    // — the balance alone cannot say whether somebody is staking.
    row.failed = true;
    return row;
  }

  try {
    const balances = await fetchBalances(address, signal);
    row.unlockedUstx = balances.unlockedUstx;
    row.lockedUstx = balances.lockedUstx;
  } catch {
    // The balance is the softer half. A row with a position and no balance is
    // still worth showing, and the nulls say which part is missing.
  }

  return row;
}

/**
 * Read every address in order, calling back as each one lands.
 *
 * Sequential on purpose — see the note at the top. The callback is what lets
 * the page fill in progressively rather than sitting blank for seven seconds.
 */
export async function readAllStatuses(
  entries: { address: string; label: string | null }[],
  onRow: (row: AddressStatus, index: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (const [index, entry] of entries.entries()) {
    if (signal?.aborted) return;
    const row = await readAddressStatus(entry.address, entry.label, signal);
    if (signal?.aborted) return;
    onRow(row, index);
    if (index < entries.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SPACING_MS));
    }
  }
}

/**
 * The cycle a position runs out in — the first one it no longer covers.
 *
 * `firstRewardCycle + numCycles` is the cycle after the last one paid, which
 * is what somebody planning needs: the cycle they will not be earning in
 * unless they do something before it.
 */
export function unlocksAtCycle(position: StakedPosition): number {
  return position.firstRewardCycle + position.numCycles;
}
