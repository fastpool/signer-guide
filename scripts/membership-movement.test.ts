import { describe, expect, it } from 'vitest';
import {
  compare,
  parseArgs,
  standingLabel,
  sum,
  tallyStandings,
  type Roster,
  type Standing,
} from './membership-movement.js';

/*
 * The parts that decide what the report says, with no node in them.
 *
 * The one that matters most is that "the node would not say" never lands in
 * the same bucket as "stopped stacking". A rate limit reported as an exodus is
 * a claim about where somebody's money went, made on no evidence at all.
 */

const roster = (
  cycle: number,
  amounts: Record<string, bigint>,
  over: Partial<Roster> = {},
): Roster => ({
  cycle,
  amounts: new Map(Object.entries(amounts)),
  contracts: new Map(),
  source: 'file',
  complete: true,
  ...over,
});

describe('parseArgs', () => {
  it('takes a pool and two cycles positionally', () => {
    const o = parseArgs(['max500', '141', '142']);
    expect(o.query).toBe('max500');
    expect(o.from).toBe(141);
    expect(o.to).toBe(142);
  });

  it('takes the cycles as flags, in any order', () => {
    const o = parseArgs(['--to', '142', 'fast pool', '--from', '141']);
    expect(o).toMatchObject({ query: 'fast pool', from: 141, to: 142 });
  });

  it('puts the cycles the right way round when they are reversed', () => {
    // Comparing backwards would report every joiner as a leaver, which reads
    // as a plausible report rather than as an obvious mistake.
    const o = parseArgs(['max500', '142', '141']);
    expect(o).toMatchObject({ from: 141, to: 142 });
  });

  it('refuses what it cannot act on', () => {
    expect(() => parseArgs(['141', '142'])).toThrow(/Name a pool/);
    expect(() => parseArgs(['max500'])).toThrow(/two cycles/);
    expect(() => parseArgs(['max500', '141'])).toThrow(/two cycles/);
    expect(() => parseArgs(['max500', '141', '141'])).toThrow(/same one/);
    expect(() => parseArgs(['max500', '141', '142', '143'])).toThrow(/two/);
    expect(() => parseArgs(['max500', 'juice', '141', '142'])).toThrow(
      /two pools/,
    );
    expect(() => parseArgs(['max500', '141', '142', '--nope'])).toThrow(
      /Unknown/,
    );
    expect(() => parseArgs(['max500', '141', '142', '--top', '0'])).toThrow(
      /count/,
    );
  });

  it('checks lock state unless told not to', () => {
    expect(parseArgs(['max500', '141', '142']).lockCheck).toBe(true);
    expect(
      parseArgs(['max500', '141', '142', '--no-lock-check']).lockCheck,
    ).toBe(false);
  });
});

describe('compare', () => {
  const before = roster(141, { alice: 100n, bob: 50n, carol: 10n });
  const after = roster(142, { alice: 100n, bob: 80n, dave: 5n });

  it('separates who stayed, left and joined', () => {
    const m = compare(before, after);
    expect(m.stayed.sort()).toEqual(['alice', 'bob']);
    expect(m.left).toEqual(['carol']);
    expect(m.joined).toEqual(['dave']);
  });

  it('reports only the stayers whose amount actually moved', () => {
    const m = compare(before, after);
    expect(m.changed).toEqual([{ staker: 'bob', before: 50n, after: 80n }]);
  });

  it('puts the biggest movers first', () => {
    const m = compare(
      roster(141, { small: 1n, big: 1000n, mid: 50n }),
      roster(142, {}),
    );
    expect(m.left).toEqual(['big', 'mid', 'small']);
  });

  it('treats a staker at zero as present, not absent', () => {
    // pox-5 can hold a position of nothing, and dropping such a staker would
    // report them as having left a pool they are still in.
    const m = compare(roster(141, { alice: 0n }), roster(142, { alice: 0n }));
    expect(m.stayed).toEqual(['alice']);
    expect(m.left).toEqual([]);
  });

  it('handles a signer that emptied, and one that filled from nothing', () => {
    expect(compare(roster(141, { a: 1n }), roster(142, {})).left).toEqual([
      'a',
    ]);
    expect(compare(roster(141, {}), roster(142, { a: 1n })).joined).toEqual([
      'a',
    ]);
  });
});

describe('sum', () => {
  it('adds the named stakers and nothing else', () => {
    const amounts = new Map([
      ['a', 10n],
      ['b', 5n],
    ]);
    expect(sum(['a', 'b'], amounts)).toBe(15n);
    expect(sum(['a'], amounts)).toBe(10n);
    expect(sum(['nobody'], amounts)).toBe(0n);
  });
});

describe('standingLabel', () => {
  const stopped: Standing = { kind: 'stopped' };

  it('reads the same fact differently by direction', () => {
    // No position in the other cycle is "they stopped" for a leaver and "they
    // are new" for a joiner. One sentence for both is wrong in one direction.
    expect(standingLabel(stopped, 'left')).toMatch(/stopped stacking/);
    expect(standingLabel(stopped, 'joined')).toMatch(/new/);
  });

  it('names the signer somebody moved to', () => {
    expect(standingLabel({ kind: 'signer', signer: 'SP1.juice' }, 'left')).toBe(
      'SP1.juice',
    );
  });

  it('never calls an unanswered staker a leaver', () => {
    expect(standingLabel({ kind: 'unknown' }, 'left')).toMatch(/would not say/);
    expect(standingLabel({ kind: 'unknown' }, 'left')).not.toMatch(/stopped/);
  });
});

describe('tallyStandings', () => {
  it('counts each destination once, largest first', () => {
    const standings = new Map<string, Standing>([
      ['a', { kind: 'signer', signer: 'SP1.juice' }],
      ['b', { kind: 'signer', signer: 'SP1.juice' }],
      ['c', { kind: 'stopped' }],
    ]);
    const rows = tallyStandings(standings, 'left');
    expect(rows[0]).toMatchObject({ label: 'SP1.juice', count: 2 });
    expect(rows[0].stakers.sort()).toEqual(['a', 'b']);
    expect(rows[1].count).toBe(1);
  });

  it('keeps unknown apart from stopped', () => {
    // The whole point. Merging them turns a rate limit into a finding about
    // where somebody's money went.
    const rows = tallyStandings(
      new Map<string, Standing>([
        ['a', { kind: 'stopped' }],
        ['b', { kind: 'unknown' }],
      ]),
      'left',
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.count)).toEqual([1, 1]);
  });

  it('does not report a staker who never moved as a destination', () => {
    // The chain putting them with this signer in both cycles means the roster
    // that listed them as gone is short. Printed under the contract's own name
    // it would read as "they left, to here", which is the opposite of the
    // truth — so it says what it actually is.
    const label = standingLabel(
      { kind: 'stillHere', signer: 'SP1.max500' },
      'left',
    );
    expect(label).toMatch(/still with this signer/);
    expect(label).not.toContain('SP1.max500');
  });

  it('keeps a stake that starts later apart from one that stopped', () => {
    // Somebody who re-staked a few blocks after the cycle began has not left;
    // they are in the next cycle. Counting them as gone would be the headline
    // "pool loses members" written about people who are still in it.
    const rows = tallyStandings(
      new Map<string, Standing>([
        ['a', { kind: 'stopped' }],
        ['b', { kind: 'locked', unlockHeight: 1165850 }],
      ]),
      'left',
    );
    expect(rows).toHaveLength(2);
  });
});
