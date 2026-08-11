/**
 * Amounts as a person reads them, for the reports under `scripts/`.
 *
 * The page has `src/lib/amounts.ts`, which rounds: "8.2 million STX" is the
 * right answer to "how big is this pool" and the wrong answer to "how much
 * does this address hold", where a missing decimal is somebody's money going
 * unaccounted for. So these keep every digit the chain has and only make it
 * readable — full precision, grouped in threes.
 */

/** A base-unit amount as a decimal string: `formatUnits(1234567n, 6)` → `1.234567`. */
export function formatUnits(amount: bigint, decimals: number): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = (value / scale)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  if (decimals === 0) return `${sign}${whole}`;
  const fraction = (value % scale).toString().padStart(decimals, '0');
  return `${sign}${whole}.${fraction}`;
}

/** uSTX as STX: these are amounts people read out loud. */
export const formatStx = (ustx: bigint) => formatUnits(ustx, 6);

/**
 * A decimal string as base units, for a threshold typed on the command line.
 *
 * Throws rather than rounding. `--min-token 0.0000001` against a token with
 * six decimals is somebody expecting a precision the token does not have, and
 * quietly reading it as zero would make the whole filter a no-op.
 */
export function parseUnits(value: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.replace(/[_,]/g, ''));
  if (!match) throw new Error(`Not an amount: ${value}`);
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    throw new Error(
      `${value} is finer than this token's ${decimals} decimal(s)`,
    );
  }
  return BigInt(match[1] + fraction.padEnd(decimals, '0'));
}

/** `SP3VR0QZ…AP8T0` — an address short enough to scan down a column. */
export function shortPrincipal(principal: string): string {
  const [address, contract] = principal.split('.');
  const short =
    address.length > 20
      ? `${address.slice(0, 8)}…${address.slice(-5)}`
      : address;
  return contract ? `${short}.${contract}` : short;
}
