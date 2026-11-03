import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addEvents,
  emptyIndex,
  signersOf,
  stakersFromEvents,
  type Pox5Event,
} from './pox5-events.js';

const MAX500 = 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';
const OTHER = 'SP3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SH15ZP2H.signer-manager-stillearly';

const event = (over: Partial<Pox5Event>): Pox5Event => ({
  cursor: '1:0',
  block_height: 1,
  topic: 'stake',
  staker: 'SP1',
  signer: MAX500,
  data: null,
  ...over,
});

describe('signersOf', () => {
  it('ties a staker to the signer they joined', () => {
    expect(signersOf(event({}))).toEqual([MAX500]);
  });

  it('ties a mover to the signer they left as well', () => {
    // The whole point: Hiro's index drops them from the old signer, and a
    // past cycle of the old signer is where they are missed.
    const moved = event({
      topic: 'stake-update',
      signer: OTHER,
      data: { 'old-signer': MAX500 },
    });
    expect(signersOf(moved).sort()).toEqual([MAX500, OTHER].sort());
  });

  it('ignores events with no staker', () => {
    expect(signersOf(event({ topic: 'register-signer', staker: null }))).toEqual(
      [],
    );
  });
});

describe('addEvents', () => {
  it('keeps everyone once, sorted, and counts only new pairs', () => {
    const index = emptyIndex();
    expect(
      addEvents(index, [
        event({ staker: 'SP2', block_height: 5 }),
        event({ staker: 'SP1', block_height: 7 }),
        event({ staker: 'SP2', topic: 'unstake', block_height: 9 }),
      ]),
    ).toBe(2);
    expect(index.stakers[MAX500]).toEqual(['SP1', 'SP2']);
    expect(index.blockHeight).toBe(9);
    expect(index.events).toBe(3);

    // An unstake does not take anyone off: a past cycle still had them.
    expect(addEvents(index, [event({ staker: 'SP1' })])).toBe(0);
    expect(index.stakers[MAX500]).toEqual(['SP1', 'SP2']);
  });
});

describe('stakersFromEvents', () => {
  const write = (value: unknown) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pox5-stakers-'));
    const file = path.join(dir, 'pox5-stakers.json');
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
  };

  it('unions the stakers of every contract asked about', () => {
    const index = emptyIndex();
    addEvents(index, [
      event({ staker: 'SP1' }),
      event({ staker: 'SP2', signer: OTHER }),
    ]);
    index.cursor = '1:0';
    const file = write(index);
    expect([...(stakersFromEvents([MAX500, OTHER], file) ?? [])].sort()).toEqual(
      ['SP1', 'SP2'],
    );
  });

  it('says there is no index, rather than nobody, without a file', () => {
    // Null and an empty set are different statements: one turns off the
    // events walk, the other would claim a contract nobody staked with.
    expect(stakersFromEvents([MAX500], '/nonexistent/pox5-stakers.json')).toBe(
      null,
    );
    expect(stakersFromEvents([MAX500], write(emptyIndex()))).toBe(null);
  });
});
