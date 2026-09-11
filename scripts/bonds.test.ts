/**
 * The parts of the bond read that can be wrong without anything failing.
 *
 * The reads themselves either answer or do not, and `scripts/read-only.ts`
 * has the argument about that. What is testable here is the arithmetic and
 * the decoding between them: which period is the current one, what an
 * allowlist print says, and — the one that decides whether the page states a
 * ceiling as fact — whether the recovered allowlist accounts for everything
 * pox-5 says is in the bond.
 */

import {
  boolCV,
  contractPrincipalCV,
  cvToHex,
  standardPrincipalCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
} from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import committed from '../src/data/bonds.json' with { type: 'json' };
import {
  allowlistComplete,
  allowlistFromEvents,
  bondIndexes,
  bondLengthFromEvents,
  registrationClosed,
  sumMaxSats,
  sumRegisteredSats,
  type StakerRow,
} from './bonds.js';
import type { BondsData } from '../src/lib/types.js';

const ALICE = 'SP38S7KVNENN7BGKW76VN1840PFMDHMA674C0FSZY';
const BOB = 'SP2SVSZ7XBAC7AQM729MJM7JRX0RJPPN05K0C3EPE';

function allowlistPrint(bondIndex: number, staker: string, maxSats: number) {
  return cvToHex(
    tupleCV({
      'bond-index': uintCV(bondIndex),
      'max-sats': uintCV(maxSats),
      staker: standardPrincipalCV(staker),
      topic: stringAsciiCV('add-to-allowlist'),
    }),
  );
}

function setupPrint(bondIndex: number, first: number, unlock: number) {
  return cvToHex(
    tupleCV({
      'bond-index': uintCV(bondIndex),
      'first-reward-cycle': uintCV(first),
      'unlock-cycle': uintCV(unlock),
      topic: stringAsciiCV('setup-bond'),
    }),
  );
}

function row(over: Partial<StakerRow> = {}): StakerRow {
  return {
    staker: ALICE,
    maxSats: 1_000n,
    registeredSats: 0n,
    amountUstx: null,
    isL1Lock: null,
    signer: null,
    ...over,
  };
}

describe('which period is current and which is next', () => {
  it('counts periods off the first one, a gap apart', () => {
    // Mainnet: period 0 opens at cycle 141 and a new one every 2 cycles.
    expect(bondIndexes(141, 141, 2)).toEqual({ current: 0, next: 1 });
    expect(bondIndexes(142, 141, 2)).toEqual({ current: 0, next: 1 });
    expect(bondIndexes(143, 141, 2)).toEqual({ current: 1, next: 2 });
    expect(bondIndexes(152, 141, 2)).toEqual({ current: 5, next: 6 });
  });

  it('has no current period before the first one opens', () => {
    // The one moment there is no current bond at all, and the page says so
    // rather than showing the first one under the wrong heading.
    expect(bondIndexes(140, 141, 2)).toEqual({ current: null, next: 0 });
  });

  it('refuses a gap that would divide by nothing', () => {
    expect(() => bondIndexes(150, 141, 0)).toThrow();
  });
});

describe('reading an allowlist back out of the setup transaction', () => {
  it('takes the stakers and their ceilings, in order', () => {
    const events = [
      setupPrint(1, 143, 155),
      allowlistPrint(1, ALICE, 500_000_000),
      allowlistPrint(1, BOB, 1_000_000_000),
    ];
    expect(allowlistFromEvents(events, 1)).toEqual([
      { staker: ALICE, maxSats: 500_000_000n },
      { staker: BOB, maxSats: 1_000_000_000n },
    ]);
  });

  it('leaves another bond’s allowlist alone', () => {
    const events = [allowlistPrint(2, ALICE, 500_000_000)];
    expect(allowlistFromEvents(events, 1)).toEqual([]);
  });

  it('ignores prints that are not an allowlist entry', () => {
    const events = [
      setupPrint(1, 143, 155),
      cvToHex(tupleCV({ topic: stringAsciiCV('something-else') })),
      cvToHex(uintCV(7)),
      'not hex at all',
    ];
    expect(allowlistFromEvents(events, 1)).toEqual([]);
  });

  it('takes a contract as a staker, which several of the largest are', () => {
    const contract = cvToHex(
      tupleCV({
        'bond-index': uintCV(1),
        'max-sats': uintCV(15_000_000_000),
        staker: contractPrincipalCV(
          'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
          'stbtc-staker-bond-1-v2',
        ),
        topic: stringAsciiCV('add-to-allowlist'),
      }),
    );
    expect(allowlistFromEvents([contract], 1)).toEqual([
      {
        staker:
          'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-staker-bond-1-v2',
        maxSats: 15_000_000_000n,
      },
    ]);
  });
});

describe('how long a bond runs', () => {
  it('subtracts the term out of the bond’s own setup print', () => {
    expect(bondLengthFromEvents([setupPrint(1, 143, 155)], 1)).toBe(12);
  });

  it('says nothing when the setup print is not there', () => {
    // The caller falls back to the constant. Answering 12 from here would be
    // this file's opinion dressed as the chain's.
    expect(bondLengthFromEvents([allowlistPrint(1, ALICE, 1)], 1)).toBeNull();
    expect(bondLengthFromEvents([setupPrint(2, 145, 157)], 1)).toBeNull();
  });
});

describe('whether the ceiling is the whole story', () => {
  it('is complete when the rows add up to what pox-5 holds', () => {
    const rows = [
      row({ registeredSats: 400n }),
      row({ staker: BOB, registeredSats: 600n }),
    ];
    expect(sumRegisteredSats(rows)).toBe(1_000n);
    expect(allowlistComplete(rows, 1_000n)).toBe(true);
  });

  it('is incomplete when the bond holds more than the rows account for', () => {
    // A setup by a previous admin, or one further back than the pages
    // searched: the page then reads its ceiling as a floor.
    expect(allowlistComplete([row({ registeredSats: 400n })], 1_000n)).toBe(
      false,
    );
  });

  it('is incomplete when pox-5’s own total could not be read', () => {
    // Nothing was checked, so nothing is claimed — never "it all adds up".
    expect(allowlistComplete([row({ registeredSats: 400n })], null)).toBe(
      false,
    );
  });

  it('adds the ceilings up as the file states them', () => {
    expect(sumMaxSats([row({ maxSats: 1n }), row({ maxSats: 2n })])).toBe(3n);
    expect(sumMaxSats([])).toBe(0n);
  });
});

describe('when a bond stops taking registrations', () => {
  /*
   * Mainnet: bond 1 opens at burn height 966,350 and the prepare phase is 100
   * blocks, so registration shut at 966,250 — a hundred blocks before the
   * bond itself opened. `register-for-bond` asserts on both, and the prepare
   * phase is the one that bites first.
   */
  const OPENS = 966_350;
  const PREPARE = 100;

  it('is open right up to the prepare phase', () => {
    expect(registrationClosed(966_249, OPENS, PREPARE)).toBe(false);
  });

  it('shuts when the prepare phase starts, not when the bond opens', () => {
    // The whole point: 966,250 is a hundred blocks early, and a page saying
    // "still open" here invites a call the chain will refuse.
    expect(registrationClosed(966_250, OPENS, PREPARE)).toBe(true);
    expect(registrationClosed(966_300, OPENS, PREPARE)).toBe(true);
  });

  it('stays shut once the bond is running', () => {
    expect(registrationClosed(966_400, OPENS, PREPARE)).toBe(true);
  });

  it('says nothing when a height could not be read', () => {
    // "Closed" and "open" are both claims about whether somebody can still
    // act, and neither may be guessed.
    expect(registrationClosed(null, OPENS, PREPARE)).toBeNull();
    expect(registrationClosed(966_300, null, PREPARE)).toBeNull();
  });

  it('still settles a running bond with no prepare length to hand', () => {
    // The start alone is enough once the bond has opened; before that, the
    // prepare phase is unknowable and the answer is no answer.
    expect(registrationClosed(966_400, OPENS, null)).toBe(true);
    expect(registrationClosed(966_300, OPENS, null)).toBeNull();
  });
});

describe('the committed file', () => {
  const data = committed as BondsData;

  it('describes two consecutive periods a gap apart', () => {
    expect(data.next.bondIndex).toBe((data.current?.bondIndex ?? -1) + 1);
    expect(data.next.firstRewardCycle - data.gapCycles).toBe(
      data.current?.firstRewardCycle,
    );
  });

  it('never states a ceiling a bond has already passed', () => {
    // The only way a bond holds sats is an allowlisted staker locking them,
    // so a bond over its own ceiling means the allowlist came back short —
    // and the file has to admit it rather than print the smaller number.
    for (const period of [data.current, data.next]) {
      if (!period?.registeredSats) continue;
      if (BigInt(period.registeredSats) > BigInt(period.allowlistedSats)) {
        expect(period.allowlistComplete).toBe(false);
      }
    }
  });

  it('leaves a period nobody set up with no terms rather than zeroes', () => {
    for (const period of [data.current, data.next]) {
      if (!period || period.setUp) continue;
      expect(period.targetRate).toBeNull();
      expect(period.stxValueRatio).toBeNull();
      expect(period.stakers).toEqual([]);
    }
  });
});
