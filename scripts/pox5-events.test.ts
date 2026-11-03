import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  readEventLog,
  stakersFromEvents,
  toLogEntry,
  type LogEntry,
  type Pox5Event,
} from './pox5-events.js';

const MAX500 =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';
const OTHER =
  'SP3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SH15ZP2H.signer-manager-stillearly';

const row = (over: Partial<Pox5Event>): Pox5Event => ({
  cursor: '1:0',
  block_height: 1,
  tx_id: '0xabc',
  topic: 'stake',
  data: {
    topic: 'stake',
    staker: 'SP1',
    signer: MAX500,
    'amount-ustx': '5',
    'first-reward-cycle': '141',
    'unlock-cycle': '143',
    'num-cycles': '2',
    'unlock-burn-height': '962150',
  },
  ...over,
});

/** A copy on disk, as `generate:events` leaves it. */
const writeCopy = (entries: LogEntry[], claimed = entries.length) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pox5-events-'));
  fs.writeFileSync(
    path.join(dir, 'membership.jsonl'),
    entries.map((e) => `${JSON.stringify(e)}\n`).join(''),
  );
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify({
      source: 'test',
      cursor: '9:9',
      blockHeight: 9,
      entries: claimed,
    }),
  );
  return dir;
};

describe('toLogEntry', () => {
  it('keeps the fields the membership rules read, and drops the rest', () => {
    expect(toLogEntry(row({}))).toEqual({
      cursor: '1:0',
      block: 1,
      tx: '0xabc',
      topic: 'stake',
      data: {
        staker: 'SP1',
        signer: MAX500,
        'amount-ustx': '5',
        'first-reward-cycle': '141',
        'unlock-cycle': '143',
        'num-cycles': '2',
      },
    });
  });

  it('keeps nothing of a print that moves nobody', () => {
    // Reward claims are most of pox-5's prints, and none of them change who
    // is with which signer.
    expect(toLogEntry(row({ topic: 'claim-staker-rewards-for-signer' }))).toBe(
      null,
    );
  });
});

describe('stakersFromEvents', () => {
  it('names the stakers of a contract, and those who left it', () => {
    const moved = toLogEntry(
      row({
        cursor: '2:0',
        topic: 'stake-update',
        data: { staker: 'SP2', signer: OTHER, 'old-signer': MAX500 },
      }),
    ) as LogEntry;
    const dir = writeCopy([toLogEntry(row({})) as LogEntry, moved]);
    expect([...(stakersFromEvents([MAX500], dir) ?? [])].sort()).toEqual([
      'SP1',
      'SP2',
    ]);
    expect([...(stakersFromEvents([OTHER], dir) ?? [])]).toEqual(['SP2']);
  });

  it('says there is no copy, rather than nobody, without one', () => {
    // Null turns the event path off. An empty set would claim a contract
    // nobody ever staked with.
    expect(stakersFromEvents([MAX500], '/nonexistent/pox5-events')).toBe(null);
  });
});

describe('readEventLog', () => {
  it('refuses a copy whose line count is not the one state.json records', () => {
    // A file cut short replays as a map quietly missing rows, and every
    // member list built from it would be short. No copy is the safer answer.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const dir = writeCopy([toLogEntry(row({})) as LogEntry], 2);
      expect(readEventLog(dir)).toBe(null);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
