import { unlockedFromBalances } from '@guide/lib/stx-amounts';

/** Overridable so a build can be pointed at a different node. */
export const STACKS_API_URL =
  process.env.EXPO_PUBLIC_STACKS_API_URL || 'https://api.hiro.so';

export type AccountBalance = {
  /** Everything the account holds, locked STX included. */
  totalUstx: bigint;
  lockedUstx: bigint;
  /** Total less locked — what could be locked again. */
  unlockedUstx: bigint;
};

export async function fetchAccountBalance(
  address: string,
  signal?: AbortSignal,
): Promise<AccountBalance> {
  const res = await fetch(
    `${STACKS_API_URL}/extended/v1/address/${encodeURIComponent(address)}/balances`,
    { signal },
  );
  if (!res.ok) throw new Error(`Balance lookup failed (${res.status})`);
  const data = (await res.json()) as {
    stx?: { balance?: string; locked?: string };
  };
  const balance = data.stx?.balance;
  if (!balance || !/^\d+$/.test(balance)) {
    throw new Error('The node answered without a balance in it');
  }
  const locked =
    data.stx?.locked && /^\d+$/.test(data.stx.locked)
      ? BigInt(data.stx.locked)
      : 0n;
  const totalUstx = BigInt(balance);
  return {
    totalUstx,
    lockedUstx: locked,
    unlockedUstx: unlockedFromBalances(totalUstx, locked),
  };
}
