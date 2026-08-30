import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cycleStanding } from './signer-nodes';
import { isCycleMembers, isSignerHistory } from './signer-history';
import type { SignerCycleMembers, SignerHistory } from './types';

const GENERATED = 'src/data/signers';

/**
 * Whatever the generator has actually written, found rather than named.
 *
 * The refresh fills this directory in a signer at a time, so which files are
 * there depends on how far it has got — naming one would be a test that fails
 * the day a signer rotates its key. Empty is a state too: these run before the
 * generator has ever been run, and having nothing to check is not a failure.
 */
function generated(kind: 'summaries' | 'members'): unknown[] {
  let entries: string[];
  try {
    entries = readdirSync(GENERATED);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = join(GENERATED, entry);
    if (kind === 'summaries') {
      if (entry.endsWith('.json')) files.push(full);
    } else if (statSync(full).isDirectory()) {
      for (const cycle of readdirSync(full)) files.push(join(full, cycle));
    }
  }
  return files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
}

/*
 * The guards on the two fetched files.
 *
 * These are not a trust boundary — the files come from this repo's own branch
 * — but they are a version boundary, which is the thing that actually goes
 * wrong here. The page is installable, so a build from last month can be sitting
 * on a phone asking for a file whose shape has since moved, and the answer to
 * that has to be "nothing on file" rather than a white screen half way down a
 * member list.
 */

describe('isSignerHistory', () => {
  it('takes every summary the generator has written', () => {
    // The real files, so a change to the generator that the page cannot read
    // fails here rather than on somebody's phone.
    for (const file of generated('summaries')) {
      expect(isSignerHistory(file)).toBe(true);
    }
  });

  it('takes a signer with no cycles yet', () => {
    expect(
      isSignerHistory({ signerKey: null, contractIds: [], cycles: [] }),
    ).toBe(true);
  });

  it('refuses anything that is not it', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'signers',
      {},
      { contractIds: [], cycles: 'lots' },
      { contractIds: [], cycles: [{ cycle: 'one', ustx: {} }] },
      { contractIds: [], cycles: [{ cycle: 141, ustx: null }] },
    ]) {
      expect(isSignerHistory(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('isCycleMembers', () => {
  it('takes every member list the generator has written', () => {
    for (const file of generated('members')) {
      expect(isCycleMembers(file)).toBe(true);
    }
  });

  it('refuses an amount the page would do BigInt arithmetic on', () => {
    // `BigInt('1.5')` throws, and it would throw inside a render. Better to
    // report the file as unreadable than to take the page down with it.
    const member = (ustx: unknown) => ({
      cycle: 141,
      members: [{ staker: 'SP1', contractId: 'SP1.one', ustx }],
    });
    expect(isCycleMembers(member('100'))).toBe(true);
    expect(isCycleMembers(member('1.5'))).toBe(false);
    expect(isCycleMembers(member('-1'))).toBe(false);
    expect(isCycleMembers(member(100))).toBe(false);
    expect(isCycleMembers(member(null))).toBe(false);
    expect(isCycleMembers(member('1e6'))).toBe(false);
  });

  it('refuses anything that is not it', () => {
    for (const bad of [null, 42, {}, { cycle: 141 }, { members: [] }]) {
      expect(isCycleMembers(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('what the committed files say each cycle is', () => {
  /*
   * The bug this guards, twice over.
   *
   * The page once read `fileFinal` — whether the generator will look again —
   * as though it said whether a cycle was still filling. It is false for the
   * current cycle, so the cycle a reader was standing in was advertised as one
   * they could still join, when stacking for it had locked in before it began.
   *
   * Run against the data actually committed rather than a fixture, because the
   * failure was never in the arithmetic — it was in which flag the page
   * believed, and only real files can show that.
   */
  const summaries = () =>
    readdirSync(GENERATED)
      .filter((f) => f.endsWith('.json'))
      .map(
        (f) =>
          [f, JSON.parse(readFileSync(join(GENERATED, f), 'utf8'))] as [
            string,
            SignerHistory,
          ],
      );

  it('never offers the current cycle as one to join', () => {
    for (const [file, history] of summaries()) {
      if (typeof history.currentCycle !== 'number') continue;
      for (const cycle of history.cycles) {
        if (cycle.cycle !== history.currentCycle) continue;
        expect(cycleStanding(cycle, history.currentCycle), file).toBe('active');
      }
    }
  });

  it('offers exactly the next cycle, and only it', () => {
    for (const [file, history] of summaries()) {
      if (typeof history.currentCycle !== 'number') continue;
      const open = history.cycles.filter(
        (c) => cycleStanding(c, history.currentCycle) === 'filling',
      );
      expect(
        open.map((c) => c.cycle),
        file,
      ).toEqual(
        history.cycles
          .filter((c) => c.cycle > (history.currentCycle as number))
          .map((c) => c.cycle),
      );
    }
  });

  it('keeps the two flags apart on the cycle where they differ', () => {
    // The current cycle is the only one that should carry a closed cycle and
    // an unfinished record at once. If they ever agree everywhere, one of them
    // has stopped earning its keep.
    let differed = 0;
    for (const [file, history] of summaries()) {
      for (const cycle of history.cycles) {
        if (cycle.fileFinal === cycle.cycleFinal) continue;
        expect(cycle.cycle, file).toBe(history.currentCycle);
        expect(cycle.fileFinal, file).toBe(false);
        expect(cycle.cycleFinal, file).toBe(true);
        differed += 1;
      }
    }
    expect(differed).toBeGreaterThan(0);
  });
});

describe('the generated files, checked against each other', () => {
  /*
   * `membersAddUp` is the one claim on the signer page a reader cannot check
   * for themselves, and the page prints a warning when it is false. So it is
   * worth proving that it means what it says on the data actually committed:
   * where the generator claims a cycle adds up, the members in the file really
   * do come to what the signer holds.
   */
  it('means it when it says a cycle adds up', () => {
    // Nothing to check before the generator has ever run, which is a state
    // this repo is allowed to be in — the refresh fills the directory in.
    for (const entry of readdirSync(GENERATED)) {
      if (!entry.endsWith('.json')) continue;
      const slug = entry.replace(/\.json$/, '');
      const summary = JSON.parse(
        readFileSync(join(GENERATED, entry), 'utf8'),
      ) as SignerHistory;

      for (const cycle of summary.cycles) {
        if (!cycle.membersAddUp) continue;

        const file = join(GENERATED, slug, `${cycle.cycle}.json`);
        // A cycle nobody staked in gets no file — `memberCount: 0` says it.
        const members = existsSync(file)
          ? (JSON.parse(readFileSync(file, 'utf8')) as SignerCycleMembers)
              .members
          : [];

        expect(members.length, `${slug} cycle ${cycle.cycle}`).toBe(
          cycle.memberCount,
        );

        const staked = members.reduce((sum, m) => sum + BigInt(m.ustx), 0n);
        const heldNow = Object.values(cycle.ustx).reduce(
          (sum, amount) => sum + BigInt(amount ?? 0),
          0n,
        );
        // `membersAddUp` is true at walk time; live-cycle totals may move
        // before the next walk, so prefer the recorded walk total when present.
        const heldAtWalk =
          typeof cycle.walkedUstx === 'string' ? BigInt(cycle.walkedUstx) : null;
        expect(staked, `${slug} cycle ${cycle.cycle}`).toBe(
          heldAtWalk ?? heldNow,
        );
      }
    }
  });
});
