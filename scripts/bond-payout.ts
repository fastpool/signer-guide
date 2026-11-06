/**
 * What the bonds take out of a payout, the way pox-5's `calculate-rewards`
 * takes it.
 *
 * Bonds are paid first. Every bond active at the payout gets a set yield on
 * the sBTC staked in it for the cycle — `shares × target-rate / 10000 / 50`,
 * fifty payouts a year — for as long as there is anything left. Only then does
 * the foundation take its 15%, and the STX-only stakers get the rest. So the
 * bond share does not follow the STX behind the bonds at all: a large bond in
 * a quiet half-cycle can take most of a payout.
 *
 * A bond is active from its first reward cycle for six bond periods
 * (`is-bond-active-at-height`: start < height <= start of index + 6). Payouts
 * are computed at a cycle boundary minus one, so in cycles that is
 * `first + index·gap <= cycle < first + (index + 6)·gap`.
 */

/** pox-5's window: a bond runs for six bond periods. */
const ACTIVE_PERIODS = 6;
const PAYOUTS_PER_YEAR = 50n;

/** The bond periods pox-5 counts as active for a payout in `cycle`. */
export function activeBondIndexes(
  cycle: number,
  firstBondPeriodCycle: number,
  gapCycles: number,
): number[] {
  if (gapCycles < 1 || cycle < firstBondPeriodCycle) return [];
  const latest = Math.floor((cycle - firstBondPeriodCycle) / gapCycles);
  const indexes: number[] = [];
  for (
    let index = Math.max(0, latest - ACTIVE_PERIODS + 1);
    index <= latest;
    index++
  ) {
    const start = firstBondPeriodCycle + index * gapCycles;
    const end = firstBondPeriodCycle + (index + ACTIVE_PERIODS) * gapCycles;
    if (start <= cycle && cycle < end) indexes.push(index);
  }
  return indexes;
}

/** One bond's yield for a single payout, in sats. */
export function bondTargetYield(
  sharesSats: bigint,
  targetRateBips: bigint,
): bigint {
  return (sharesSats * targetRateBips) / 10_000n / PAYOUTS_PER_YEAR;
}

/**
 * A payout of `grossSats`, split as pox-5 splits it. The bonds' order only
 * decides which of them runs short when there is not enough for all; their
 * total is the smaller of what they are owed and what there is.
 */
export function splitPayout(
  grossSats: bigint,
  bondTargetSats: bigint,
  foundationBips: bigint,
): { bond: bigint; foundation: bigint; stxOnly: bigint } {
  const bond = bondTargetSats < grossSats ? bondTargetSats : grossSats;
  const remaining = grossSats - bond;
  const foundation = (remaining * foundationBips) / 10_000n;
  return { bond, foundation, stxOnly: remaining - foundation };
}
