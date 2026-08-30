/**
 * Does the total this guide shows agree with pox-5's own?
 *
 * The number comes out of an addition, not a read: `generate:totals` asks
 * pox-5 what each registered signer is holding for the cycle, and everything
 * that says "staked" afterwards is those answers added up — the line under the
 * heading, the phone's "Staked against pox-5", the denominator the STX-only
 * rate is divided by. pox-5 publishes the same figure in one piece, as
 * `current_cycle.stacked_ustx` on `/v2/pox`, so the addition can be checked
 * against it.
 *
 * Worth checking because the ways it can be wrong are all quiet ones. A signer
 * registered and not picked up, a read that landed on the wrong cycle, a
 * contract type archived while pools were still using it: each leaves a
 * number that still looks like a total, still renders, and is short. The last
 * of those had taken 80.5 million STX off the line under the heading — see
 * `src/lib/profiles.test.ts`, which holds the other end of it.
 *
 * Short matters most in the rate: the sats are divided by this, so a total
 * missing a pool publishes a reward rate higher than the one people are paid.
 *
 * The current cycle is the one to compare. It was settled when the cycle
 * locked and cannot move again, so the committed file and a node asked an hour
 * later are talking about the same fixed number. `next_cycle` is still filling
 * and differs by whatever was staked in between, which is not a disagreement.
 *
 * Anything that is not a disagreement skips rather than fails: a node that
 * will not answer, a pool the refresh could not read, a file written for a
 * cycle that has since rolled over. This runs in the hourly refresh before it
 * commits, and failing there should mean the guide is about to state a wrong
 * number — never that Hiro was busy.
 */

import { describe, expect, it } from 'vitest';
import calculationsData from '../src/data/stx-only-calculations.json';
import signersData from '../src/data/signers.json';
import totalsData from '../src/data/totals.json';
import { isArchived } from '../src/lib/profiles.js';
import type {
  LockedTotals,
  SignerData,
  StxOnlyCalculations,
} from '../src/lib/types.js';
import { API_URL, nodeHeaders } from './node.js';

const totals = totalsData as LockedTotals;
const signers = (signersData as SignerData).signers;
const calculations = calculationsData as StxOnlyCalculations;

/** The pools the line under the heading adds up: everything the page lists. */
const listed = signers.filter((signer) => !isArchived(signer));

/** Everything registered, which is what the STX-only estimate divides by. */
const everything = signers;

const unread = (group: typeof signers) =>
  group
    .map((signer) => signer.contractId)
    .filter((id) => (totals.ustx[id] ?? null) === null);

const sum = (group: typeof signers) =>
  group.reduce<bigint>((total, signer) => {
    const amount = totals.ustx[signer.contractId] ?? null;
    return amount === null ? total : total + BigInt(amount);
  }, 0n);

/**
 * pox-5's own figure for one cycle, or null if the node would not say it.
 *
 * Null covers a cycle that is not the one asked about as well as a node that
 * did not answer: both mean there is nothing here to compare, which is not the
 * same as a number that disagrees.
 */
async function fetchStakedUstx(cycle: number): Promise<bigint | null> {
  try {
    const response = await fetch(`${API_URL}/v2/pox`, {
      headers: nodeHeaders(),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      current_cycle?: { id?: number; stacked_ustx?: number | string };
    };
    const id = body.current_cycle?.id;
    const stacked = body.current_cycle?.stacked_ustx;
    if (typeof id !== 'number' || stacked === undefined) return null;
    if (id !== cycle) return null;

    return BigInt(stacked);
  } catch {
    return null;
  }
}

describe('the total staked against pox-5', () => {
  it(
    'is what the line under the heading adds up',
    async (ctx) => {
      const missing = unread(listed);
      if (missing.length > 0) {
        ctx.skip(
          `the refresh could not read ${missing.length} pool(s): ${missing.join(', ')}`,
        );
        return;
      }

      const staked = await fetchStakedUstx(totals.cycle);
      if (staked === null) {
        ctx.skip(
          `${API_URL} would not say what is staked for cycle ${totals.cycle}`,
        );
        return;
      }

      // "Between them they are looking after …" — the pools it says that of
      // are these, so the two figures are the same figure or the sentence is
      // wrong. Strings, so a mismatch reads as two uSTX counts rather than as
      // two BigInts printed without their digits lining up.
      expect(sum(listed).toString()).toBe(staked.toString());
    },
    30_000,
  );

  it('leaves nothing out of the guide that pox-5 counts in', () => {
    // The page lists every pool that runs a contract type still in use, and a
    // type is archived only once nothing using it is left — which means every
    // pool left out is empty in every cycle on file, this one included. So the
    // two sums are the same one, and the check above is a check on the whole
    // of pox-5 rather than on the part the page happens to be showing.
    expect(sum(listed)).toBe(sum(everything));
  });

  it('is the figure the STX-only estimate divides by', () => {
    // `generate:stx-only` runs after `generate:totals` and is allowed to fail,
    // so a file left behind on an older cycle is that failure rather than a
    // disagreement — and the two are committed separately. For the same cycle
    // there is no room for them to differ: it is one addition over one file.
    if (calculations.cycle !== totals.cycle) return;

    expect(calculations.totalStakedUstx).toBe(sum(everything).toString());
  });
});
