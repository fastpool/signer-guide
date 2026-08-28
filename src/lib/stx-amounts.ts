/**
 * Reading and writing an amount of STX the way a person types it.
 *
 * Split out of `StakeModal` so the phone app can use the same rules. These are
 * the arithmetic the stake form is made of, and a form that rounds differently
 * from the one on the site is a form that will one day disagree with it about
 * whether somebody can afford what they asked for.
 */

const ONE_STX_USTX = 1_000_000n;

/** Null for anything that is not a plain amount — six decimals at most. */
export function parseStxToUstx(amount: string): bigint | null {
  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '000000').slice(0, 6);
  return BigInt(whole) * ONE_STX_USTX + BigInt(fracPadded);
}

export function formatUstxAsStx(ustx: bigint): string {
  const whole = ustx / ONE_STX_USTX;
  const frac = (ustx % ONE_STX_USTX)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
}

/**
 * What to offer as the most somebody can stake: their unlocked balance, less
 * one STX kept back for the transaction fee.
 */
export function spendableFromBalance(
  balanceUstx: bigint | null,
): bigint | null {
  if (balanceUstx === null) return null;
  return balanceUstx > ONE_STX_USTX ? balanceUstx - ONE_STX_USTX : 0n;
}

/**
 * What is actually free to lock: the balance less whatever is locked already.
 *
 * `balance` in the balances endpoint is everything the account holds, locked
 * STX included, and locked STX cannot be locked again. Offering it as
 * available is how somebody who has just unstaked is shown their whole
 * position as spendable and told by the chain that they do not have it.
 */
export function unlockedFromBalances(
  balanceUstx: bigint,
  lockedUstx: bigint,
): bigint {
  return balanceUstx > lockedUstx ? balanceUstx - lockedUstx : 0n;
}

/** "fastpool-1-signer-manager" → "Fastpool 1 Signer Manager". */
export function signerNameFromContractId(contractId: string): string {
  const [, contractName = contractId] = contractId.split('.');
  return contractName
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
