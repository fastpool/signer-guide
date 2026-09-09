/**
 * What the bonds hold, when a reader asks for it.
 *
 * `src/data/bonds.json` is not shipped with the build — see `remote-json.ts`.
 * Most readers are here to pick a pool for their STX and will never open the
 * bond page, so the file is fetched by the page that wants it.
 *
 * Everything below the fetching is pure, and deliberately: the arithmetic on
 * this page is one subtraction and one percentage, and both are claims about
 * somebody's bitcoin. They are worth being able to test without a browser.
 */

import { useRemoteJson, type Remote } from './remote-json';
import type { BondPeriod, BondsData } from './types';

export function useBonds(): Remote<BondsData> {
  return useRemoteJson('bonds.json', isBondsData);
}

/**
 * Whether a fetched file is one this page can read.
 *
 * Not a trust boundary — the file is written by this repo and served from its
 * own branch. It is here so that a shape that changed under a cached build
 * reads as "nothing on file" rather than throwing on the first render. Every
 * amount is checked as a digit string because the page does BigInt arithmetic
 * on them.
 */
export function isBondsData(value: unknown): value is BondsData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<BondsData>;
  return (
    typeof data.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(data.generatedAt)) &&
    typeof data.cycle === 'number' &&
    typeof data.firstBondPeriodCycle === 'number' &&
    typeof data.gapCycles === 'number' &&
    typeof data.lengthCycles === 'number' &&
    (data.current === null || isBondPeriod(data.current)) &&
    isBondPeriod(data.next)
  );
}

function isSats(value: unknown): boolean {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isBondPeriod(value: unknown): value is BondPeriod {
  if (typeof value !== 'object' || value === null) return false;
  const period = value as Partial<BondPeriod>;
  return (
    typeof period.bondIndex === 'number' &&
    typeof period.firstRewardCycle === 'number' &&
    typeof period.unlockCycle === 'number' &&
    typeof period.setUp === 'boolean' &&
    isSats(period.allowlistedSats) &&
    (period.registeredSats === null || isSats(period.registeredSats)) &&
    Array.isArray(period.stakers) &&
    period.stakers.every(
      (staker) =>
        typeof staker === 'object' &&
        staker !== null &&
        typeof staker.staker === 'string' &&
        isSats(staker.maxSats) &&
        isSats(staker.registeredSats),
    )
  );
}

/**
 * What is still open on a bond: its ceiling less what has been locked.
 *
 * Null when the registered total could not be read — the gap is a subtraction
 * and one of the two numbers is missing, so there is no answer, which is not
 * the same as no room. Floored at zero rather than allowed to go negative:
 * with an incomplete allowlist the ceiling is a floor, and a bond holding
 * more than the names we recovered is a gap in this file, not a bond that has
 * overflowed.
 */
export function openSats(period: BondPeriod): bigint | null {
  if (period.registeredSats === null) return null;
  const open = BigInt(period.allowlistedSats) - BigInt(period.registeredSats);
  return open > 0n ? open : 0n;
}

/**
 * How full the bond is, 0 to 100, for the bar beside it.
 *
 * Null for a bond with no ceiling to measure against — a period nobody has
 * set up, or one whose allowlist could not be recovered. A bar drawn against
 * a ceiling of nothing would read as full, which is the opposite of what an
 * empty bond is.
 */
export function filledPercent(period: BondPeriod): number | null {
  if (period.registeredSats === null) return null;
  const ceiling = BigInt(period.allowlistedSats);
  if (ceiling === 0n) return null;
  const filled = (BigInt(period.registeredSats) * 100n) / ceiling;
  return Math.min(100, Number(filled));
}

/** Stakers who have locked something, and those who have not, in that order. */
export function splitByRegistered(period: BondPeriod): {
  locked: BondPeriod['stakers'];
  invited: BondPeriod['stakers'];
} {
  return {
    locked: period.stakers.filter((s) => BigInt(s.registeredSats) > 0n),
    invited: period.stakers.filter((s) => BigInt(s.registeredSats) === 0n),
  };
}

/** The last cycle the bond covers — `unlockCycle` is the first one it does not. */
export function lastCycle(period: BondPeriod): number {
  return period.unlockCycle - 1;
}
