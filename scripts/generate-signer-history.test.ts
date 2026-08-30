import { describe, expect, it } from 'vitest';
import {
  amountOrKept,
  amountsSettled,
  byStaleness,
  dayHasPassed,
  membersWorthWalking,
  parseArgs,
  REWALK_AFTER_MS,
  strictSum,
} from './generate-signer-history.js';
import type { SignerNode } from '../src/lib/signer-nodes.js';
import type { Signer, SignerCycleSummary } from '../src/lib/types.js';

/*
 * The decisions that make this affordable, tested without a node.
 *
 * A member walk costs one chain call per staker, so `membersWorthWalking`
 * being wrong in one direction is a refresh that cannot finish, and wrong in
 * the other is a page reporting last week's members as this cycle's. Both are
 * worth a test each.
 */

const A = 'SP1.one';
const B = 'SP1.two';

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const LONG_AGO = '2026-08-01T12:00:00.000Z';
const AN_HOUR_AGO = '2026-08-15T11:00:00.000Z';

const cycle = (over: Partial<SignerCycleSummary> = {}): SignerCycleSummary => ({
  cycle: 141,
  ustx: { [A]: '100' },
  memberCount: 3,
  membersAddUp: true,
  walks: 1,
  walkedAt: LONG_AGO,
  walkedUstx: '100',
  fileFinal: true,
  cycleFinal: true,
  ...over,
});

describe('parseArgs', () => {
  it('has no budget until it is given one', () => {
    expect(parseArgs([]).budget).toBe(Number.POSITIVE_INFINITY);
    expect(parseArgs(['--budget', '500']).budget).toBe(500);
  });

  it('starts at pox-5’s first cycle', () => {
    expect(parseArgs([]).from).toBe(141);
    expect(parseArgs(['--from', '150']).from).toBe(150);
  });

  it('refuses a budget or a cycle that is not one', () => {
    expect(() => parseArgs(['--budget', '0'])).toThrow();
    expect(() => parseArgs(['--budget', 'lots'])).toThrow();
    expect(() => parseArgs(['--from', 'soon'])).toThrow();
    expect(() => parseArgs(['--nonsense'])).toThrow();
  });
});

describe('amountsSettled', () => {
  it('is settled once the cycle is past and every contract answered', () => {
    expect(amountsSettled(cycle({ cycle: 140 }), [A], 141)).toBe(true);
  });

  it('is never settled for the current cycle or the next', () => {
    // One cycle of insurance: stacking for a cycle is locked in before it
    // begins, so the current one is almost certainly settled too — but being
    // wrong here freezes a number that later moved.
    expect(amountsSettled(cycle({ cycle: 141 }), [A], 141)).toBe(false);
    expect(amountsSettled(cycle({ cycle: 142 }), [A], 141)).toBe(false);
  });

  it('is not settled when a contract joined the signer later', () => {
    // The new contract's amount for this cycle has never been asked for, and
    // treating the cycle as done would leave it out of every total for ever.
    const onFile = cycle({ cycle: 140, ustx: { [A]: '100' } });
    expect(amountsSettled(onFile, [A, B], 141)).toBe(false);
  });

  it('is not settled when a call failed and left a null', () => {
    const onFile = cycle({ cycle: 140, ustx: { [A]: '100', [B]: null } });
    expect(amountsSettled(onFile, [A, B], 141)).toBe(false);
  });

  it('is not settled when there is nothing on file at all', () => {
    expect(amountsSettled(undefined, [A], 141)).toBe(false);
  });
});

describe('membersWorthWalking', () => {
  /** A live cycle whose list was made when the signer held `walkedUstx`. */
  const live = (over = {}) =>
    cycle({ cycle: 142, fileFinal: false, cycleFinal: false, ...over });

  it('walks a cycle nobody has walked', () => {
    // The only case that ignores the once-a-day rule: there is nothing to
    // wait for, and no list to be stale.
    expect(membersWorthWalking(undefined, 100n, false, NOW)).toBe(true);
    expect(
      membersWorthWalking(cycle({ memberCount: null }), 100n, true, NOW),
    ).toBe(true);
  });

  it('does not re-walk a cycle nobody staked in', () => {
    // Zero members is a fact and is recorded as 0. Reading it as "not walked"
    // would walk every empty pool, every day, for ever.
    const empty = live({ memberCount: 0, ustx: { [A]: '0' }, walkedUstx: '0' });
    expect(membersWorthWalking(empty, 0n, false, NOW)).toBe(false);
  });

  it('leaves a live cycle alone when the money has not moved', () => {
    // Same total as when the list was made: nobody joined, nobody left and
    // nobody changed their stake, so the list still stands.
    expect(
      membersWorthWalking(live({ walkedUstx: '100' }), 100n, false, NOW),
    ).toBe(false);
  });

  it('walks a live cycle whose money moved, once a day has passed', () => {
    expect(
      membersWorthWalking(live({ walkedUstx: '100' }), 101n, false, NOW),
    ).toBe(true);
  });

  it('holds a moved live cycle back until a day has passed', () => {
    // The saving this exists for. The three Xverse signers are eleven hundred
    // members between them, and an hourly re-walk of the cycle being filled
    // was the whole of a thirty-minute refresh.
    const recent = live({ walkedUstx: '100', walkedAt: AN_HOUR_AGO });
    expect(membersWorthWalking(recent, 101n, false, NOW)).toBe(false);
  });

  it('measures the day against the walk, not against the last run', () => {
    /*
     * The trap. `ustx` is refreshed every hour whether or not the members are,
     * so a move noticed at one o'clock is baked into `ustx` by two — and a
     * rule that compared this run's amounts against last run's would find them
     * agreeing and never rebuild the list at all. The comparison is against
     * `walkedUstx`, which only moves when a walk happens.
     */
    const held = live({
      ustx: { [A]: '101' }, // this run's amount, already caught up
      walkedUstx: '100', // what the signer held when the list was made
      walkedAt: AN_HOUR_AGO,
    });
    expect(membersWorthWalking(held, 101n, false, NOW)).toBe(false);
    // A day later the same record still knows it is out of step.
    const aDayOn = NOW + 25 * 60 * 60 * 1000;
    expect(membersWorthWalking(held, 101n, false, aDayOn)).toBe(true);
  });

  it('walks when it cannot tell whether the money moved', () => {
    // An unreadable amount is not evidence that nothing changed, and treating
    // it as such would freeze a member list behind a failing call.
    expect(
      membersWorthWalking(live({ walkedUstx: '100' }), null, false, NOW),
    ).toBe(true);
    expect(
      membersWorthWalking(live({ walkedUstx: null }), 100n, false, NOW),
    ).toBe(true);
  });

  it('never walks a settled cycle again once its list adds up', () => {
    const onFile = cycle({
      fileFinal: true,
      cycleFinal: true,
      membersAddUp: true,
    });
    // The total it was walked against, unmoved — the list still accounts for
    // the amounts it is filed beside, so there is nothing left to do.
    expect(membersWorthWalking(onFile, 100n, true, NOW)).toBe(false);
  });

  it('walks a frozen record once more when the amounts moved after the walk', () => {
    /*
     * The hole this closes. A stake that changes in a cycle's last day is on
     * file as an amount while the list is the one walked before it moved; the
     * daily gate declines, the cycle rolls over, `fileFinal` turns true, and
     * every path after the gate says the record is as good as it will get. The
     * list would be frozen a member short for good.
     *
     * Real: fastpool-1's cycle 142, walked at 10:54 between an unstake and a
     * 99 STX increase, with the next run 21.4 hours later.
     */
    const walked = cycle({
      fileFinal: true,
      cycleFinal: true,
      membersAddUp: true,
      walkedAt: AN_HOUR_AGO,
      walkedUstx: '1173737160843',
    });

    expect(membersWorthWalking(walked, 1_173_836_160_843n, true, NOW)).toBe(
      true,
    );

    // And once that walk has happened it is done: a walk writes `walkedUstx`
    // from the amounts, and a settled cycle's amounts do not move again.
    expect(
      membersWorthWalking(
        { ...walked, walkedUstx: '1173836160843' },
        1_173_836_160_843n,
        true,
        NOW,
      ),
    ).toBe(false);
  });

  it('will not force that walk on a figure it does not have', () => {
    // `walkedUstx` null is a record written before it was kept, and a null
    // total is a contract that would not answer. Neither is evidence the list
    // is stale, and walking every historical cycle of every signer on a
    // missing field would cost more than the whole refresh.
    const frozen = cycle({ fileFinal: true, cycleFinal: true });
    expect(
      membersWorthWalking(
        { ...frozen, walkedUstx: null, walkedAt: AN_HOUR_AGO },
        999n,
        true,
        NOW,
      ),
    ).toBe(false);
    expect(
      membersWorthWalking({ ...frozen, walkedAt: AN_HOUR_AGO }, null, true, NOW),
    ).toBe(false);
  });

  it('leaves a live cycle to the daily rule, however much has moved', () => {
    // The gate is what makes an hourly refresh affordable: eleven hundred
    // members across the three Xverse signers, walked every time the money
    // moved, is the bill it exists to stop. A live list catches up tomorrow;
    // a frozen one never would, which is why only the frozen case jumps it.
    expect(
      membersWorthWalking(
        live({ walkedAt: AN_HOUR_AGO, walkedUstx: '100' }),
        999n,
        false,
        NOW,
      ),
    ).toBe(false);
  });

  it('retries a short list, but not for ever and not more than daily', () => {
    // A list that does not add up is usually a rate limit and worth another
    // go. It can also be a staker Hiro's index has never heard of, which no
    // number of retries fixes — and a big signer retried hourly is the same
    // bill this rule exists to stop.
    const short = (walks: number, walkedAt = LONG_AGO) =>
      cycle({ membersAddUp: false, walks, walkedAt });
    // Against the total it was walked at, so this is the retry rule on its
    // own rather than the frozen-record rule above.
    expect(membersWorthWalking(short(1), 100n, true, NOW)).toBe(true);
    expect(membersWorthWalking(short(2), 100n, true, NOW)).toBe(true);
    expect(membersWorthWalking(short(3), 100n, true, NOW)).toBe(false);
    expect(membersWorthWalking(short(1, AN_HOUR_AGO), 100n, true, NOW)).toBe(
      false,
    );
  });
});

describe('dayHasPassed', () => {
  it('waits a full day', () => {
    expect(dayHasPassed(AN_HOUR_AGO, NOW)).toBe(false);
    expect(dayHasPassed(LONG_AGO, NOW)).toBe(true);
    expect(
      dayHasPassed(new Date(NOW - REWALK_AFTER_MS).toISOString(), NOW),
    ).toBe(true);
    expect(
      dayHasPassed(new Date(NOW - REWALK_AFTER_MS + 1000).toISOString(), NOW),
    ).toBe(false);
  });

  it('treats a stamp it cannot read as long ago', () => {
    // A file written before this was recorded, or one somebody edited. Not
    // knowing is not evidence the list is fresh, and the cost of being wrong
    // is one walk rather than a list that is never rebuilt.
    expect(dayHasPassed(null, NOW)).toBe(true);
    expect(dayHasPassed(undefined, NOW)).toBe(true);
    expect(dayHasPassed('not a date', NOW)).toBe(true);
  });
});

describe('amountOrKept', () => {
  it('takes the node’s answer when there is one', () => {
    expect(amountOrKept(123n, '100')).toEqual({ ustx: '123', kept: false });
    // Zero is an answer, not an absence: a signer really can hold nothing.
    expect(amountOrKept(0n, '100')).toEqual({ ustx: '0', kept: false });
  });

  it('keeps what it had when the node would not answer', () => {
    // Otherwise a rate limit blanks an amount the page was showing — the same
    // failure `preserveKnownTotals` exists to prevent for totals.json.
    expect(amountOrKept(null, '100')).toEqual({ ustx: '100', kept: true });
  });

  it('says nothing when it has nothing to keep', () => {
    expect(amountOrKept(null, undefined)).toEqual({ ustx: null, kept: false });
    expect(amountOrKept(null, null)).toEqual({ ustx: null, kept: false });
  });

  it('leaves the cycle total unmoved when a read fails', () => {
    // The consequence that matters. A failed read that wrote null would drop
    // the total to unknown, and `membersWorthWalking` would read that as the
    // signer's money moving and re-walk every member for nothing.
    const known = { 'SP1.one': '100', 'SP1.two': '23' };
    const after = Object.fromEntries(
      Object.entries(known).map(([id, was]) => [
        id,
        amountOrKept(null, was).ustx,
      ]),
    );
    expect(strictSum(after)).toBe(strictSum(known));
    expect(
      membersWorthWalking(
        // The list was made when the signer held exactly this, so a run that
        // carries the amounts forward leaves it still matching.
        cycle({
          ustx: known,
          walkedUstx: '123',
          fileFinal: false,
          cycleFinal: false,
        }),
        strictSum(after),
        false,
        NOW,
      ),
    ).toBe(false);
  });
});

describe('strictSum', () => {
  it('refuses to add up a cycle it could not read in full', () => {
    // This total decides whether a walk runs. A sum that quietly dropped an
    // unreadable contract would compare equal to a complete one and skip a
    // walk that was needed.
    expect(strictSum({ [A]: '100', [B]: null })).toBeNull();
    expect(strictSum({ [A]: '100', [B]: '23' })).toBe(123n);
  });
});

describe('byStaleness', () => {
  const node = (id: string): SignerNode => ({
    signerKey: id,
    contracts: [{ contractId: id } as Signer],
  });

  it('puts a signer with nothing on file first', () => {
    const [fresh, never] = [node('fresh'), node('never')];
    const order = byStaleness([fresh, never], (g) =>
      g.signerKey === 'never' ? null : 1000,
    );
    expect(order[0]).toBe(never);
  });

  it('works round the rest, longest-waiting first', () => {
    // So an hourly run that cannot afford everything makes progress on
    // something different each time rather than the same three signers.
    const at: Record<string, number> = { a: 300, b: 100, c: 200 };
    const order = byStaleness(
      [node('a'), node('b'), node('c')],
      (g) => at[g.signerKey as string],
    );
    expect(order.map((g) => g.signerKey)).toEqual(['b', 'c', 'a']);
  });

  it('leaves the list it was given alone', () => {
    const nodes = [node('a'), node('b')];
    byStaleness(nodes, () => null);
    expect(nodes.map((g) => g.signerKey)).toEqual(['a', 'b']);
  });
});
