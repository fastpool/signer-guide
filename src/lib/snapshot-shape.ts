/**
 * What a published data file has to look like before anything reads it.
 *
 * Split out of `data-source.ts` so that the mobile app can hold the same
 * opinion. That file is a browser file — it reaches for `import.meta.env` and
 * for `localStorage`, neither of which exists under React Native — and a
 * second copy of these checks would mean two answers to "is this snapshot
 * usable", drifting apart at whichever end changed last.
 *
 * These are not a trust boundary. The files are written by a script in this
 * repo and served from its own branch. What they are for is a shape that
 * changed under a build still sitting in somebody's cache: that should read as
 * "nothing on file" rather than white-screen the app on launch.
 */
import type {
  LockedTotals,
  SignerData,
  StxOnlyCalculations,
} from './types';

export function isSignerData(value: unknown): value is SignerData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<SignerData>;
  return (
    typeof data.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(data.generatedAt)) &&
    Array.isArray(data.signers) &&
    data.signers.every(
      (signer) =>
        typeof signer === 'object' &&
        signer !== null &&
        typeof signer.contractId === 'string',
    )
  );
}

// The page does BigInt arithmetic on these, so anything that is not a plain
// uSTX count or an honest null has to be rejected here rather than thrown at
// the first render.
function isCycleAmounts(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).every(
    (amount) =>
      amount === null || (typeof amount === 'string' && /^\d+$/.test(amount)),
  );
}

function isCycleBlock(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const block = value as { cycle?: unknown; ustx?: unknown };
  return typeof block.cycle === 'number' && isCycleAmounts(block.ustx);
}

export function isLockedTotals(value: unknown): value is LockedTotals {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<LockedTotals>;
  if (typeof data.cycle !== 'number') return false;
  if (!isCycleAmounts(data.ustx)) return false;
  // A file written before these existed has neither, which is not a reason to
  // throw away everything else in it.
  return isCycleBlock(data.next) && isCycleBlock(data.previous);
}

function isBigintStringOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d+$/.test(value));
}

export function isStxOnlyCalculations(
  value: unknown,
): value is StxOnlyCalculations {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<StxOnlyCalculations>;

  const blocksIntoValid =
    data.blocksIntoCycle === null || typeof data.blocksIntoCycle === 'number';
  const blocksLeftValid =
    data.blocksLeftInCycle === null ||
    typeof data.blocksLeftInCycle === 'number';
  const currentBurnHeightValid =
    data.currentBurnHeight === null ||
    typeof data.currentBurnHeight === 'number';
  const lastRewardBurnHeightValid =
    data.lastRewardBurnHeight === null ||
    typeof data.lastRewardBurnHeight === 'number';
  const lastPayoutCycleValid =
    data.lastPayoutCycle === null || typeof data.lastPayoutCycle === 'number';
  const nextRewardBurnHeightValid =
    data.nextRewardBurnHeight === null ||
    typeof data.nextRewardBurnHeight === 'number';

  return (
    typeof data.cycle === 'number' &&
    typeof data.distributionBlocks === 'number' &&
    blocksIntoValid &&
    blocksLeftValid &&
    currentBurnHeightValid &&
    lastRewardBurnHeightValid &&
    nextRewardBurnHeightValid &&
    typeof data.totalStakedUstx === 'string' &&
    /^\d+$/.test(data.totalStakedUstx) &&
    typeof data.bondStakedUstx === 'string' &&
    /^\d+$/.test(data.bondStakedUstx) &&
    typeof data.stxOnlyStakedUstx === 'string' &&
    /^\d+$/.test(data.stxOnlyStakedUstx) &&
    isBigintStringOrNull(data.stxPriceSats) &&
    isBigintStringOrNull(data.sbtcBalanceSats) &&
    isBigintStringOrNull(data.accruedRewardsSats) &&
    isBigintStringOrNull(data.bondShareSats) &&
    isBigintStringOrNull(data.foundationShareSats) &&
    isBigintStringOrNull(data.stxOnlySoFarSats) &&
    isBigintStringOrNull(data.projectedCycleSats) &&
    isBigintStringOrNull(data.projectedRateSatsPer1000Stx) &&
    lastPayoutCycleValid &&
    isBigintStringOrNull(data.lastPayoutRateSatsPer1000Stx) &&
    isBigintStringOrNull(data.cumulativeRewardsPerUstx) &&
    isBigintStringOrNull(data.rateSatsPer1000Stx)
  );
}
