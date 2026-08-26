import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enumerateStakers,
  mergeMembers,
  parseClaimEvent,
  parseMembershipEvent,
  totals,
  type PoolHoldings,
  type Report,
} from './unclaimed-rewards';

/*
 * The arithmetic is the whole product here: a report that adds the operator's
 * fees into what stakers are owed, or that quietly treats an unreadable pool
 * as an empty one, is worse than no report — it reads as a fact.
 */

const pool = (over: Partial<PoolHoldings>): PoolHoldings => ({
  pool: 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager',
  unattributedSats: 0n,
  pendingSats: 0n,
  inFlightSats: 0n,
  feesSats: 0n,
  owedByPox5Sats: 0n,
  kind: 'holds',
  ...over,
});

const report = (pools: PoolHoldings[]): Report => ({
  cycles: [141],
  pools,
  stakers: null,
  sbtcStakedSats: 0n,
});

describe('totals', () => {
  it('counts both piles a staker is owed, and neither of the two they are not', () => {
    // Unattributed and pending are theirs and still in the contract. In-flight
    // has left the balance; fees are the operator's. Adding either would
    // overstate what claiming could actually return.
    const t = totals(
      report([
        pool({
          unattributedSats: 59n,
          pendingSats: 13_494n,
          inFlightSats: 7_900_335n,
          feesSats: 70_177n,
        }),
      ]),
    );
    expect(t.owedToStakersSats).toBe(13_553n);
    expect(t.inFlightSats).toBe(7_900_335n);
    expect(t.feesSats).toBe(70_177n);
  });

  it('adds across pools', () => {
    const t = totals(
      report([
        pool({ unattributedSats: 7_079n, owedByPox5Sats: 12_282_008n }),
        pool({ unattributedSats: 5_105_825n, owedByPox5Sats: 126_333n }),
      ]),
    );
    expect(t.owedToStakersSats).toBe(5_112_904n);
    expect(t.inPox5Sats).toBe(12_408_341n);
  });

  it('refuses to total pox-5 when a pool could not be read', () => {
    // Null is "we could not read it". Folding it in as zero would turn a gap
    // into a number, which is the one thing a report about somebody's rewards
    // must not do.
    const t = totals(
      report([
        pool({ owedByPox5Sats: 12_282_008n }),
        pool({ owedByPox5Sats: null }),
      ]),
    );
    expect(t.inPox5Sats).toBeNull();
  });

  it('still totals what stakers are owed when pox-5 is unreadable', () => {
    // The two piles come from different contracts. Losing one does not make
    // the other unknowable, and pretending otherwise hides real money.
    const t = totals(
      report([pool({ unattributedSats: 500n, owedByPox5Sats: null })]),
    );
    expect(t.inPox5Sats).toBeNull();
    expect(t.owedToStakersSats).toBe(500n);
  });

  it('reads an empty set as zero, not as unknown', () => {
    expect(totals(report([]))).toMatchObject({
      inPox5Sats: 0n,
      owedToStakersSats: 0n,
      unreadable: [],
    });
  });

  it('will not total anything once a pool could not be read', () => {
    // The failure that prompted this: under a rate limit the interface read
    // fails, and a pool holding five million sats printed as though it keeps
    // none by design. Unread is not empty, and a total missing it is not low
    // — it is wrong.
    const t = totals(
      report([
        pool({ unattributedSats: 5_105_825n }),
        pool({ pool: 'SP3RX8RME63CY63G5WZ8XQWZNTYNETYJESQKE071E.stacks-labs', kind: 'unreadable' }),
      ]),
    );
    expect(t.owedToStakersSats).toBeNull();
    expect(t.feesSats).toBeNull();
    expect(t.unreadable).toEqual([
      'SP3RX8RME63CY63G5WZ8XQWZNTYNETYJESQKE071E.stacks-labs',
    ]);
  });

  it('still totals when a pool keeps none of it by design', () => {
    // The bond managers are read fine and genuinely hold nothing for anybody.
    // That is an answer, so the totals stand.
    const t = totals(
      report([pool({ unattributedSats: 7_079n }), pool({ kind: 'keeps-none' })]),
    );
    expect(t.owedToStakersSats).toBe(7_079n);
    expect(t.unreadable).toEqual([]);
  });

  it('counts a pox5-direct pool, which holds without keeping books', () => {
    // Native Pool exposes no getters, so it once printed as keeping nothing
    // and its sBTC balance was left out of the total entirely. It is stakers'
    // money sitting in a contract, and it counts like anybody else's.
    const t = totals(
      report([
        pool({ unattributedSats: 7_079n }),
        pool({ kind: 'pox5-direct', unattributedSats: 15_245_009n }),
      ]),
    );
    expect(t.owedToStakersSats).toBe(15_252_088n);
    expect(t.unreadable).toEqual([]);
  });
});

describe('parseClaimEvent', () => {
  /*
   * Native Pool keeps no ledger: `claim-staker-rewards` transfers the sBTC and
   * prints, and that print is the only record that it happened. So this regex
   * is what stands between a log line and a claim about somebody's money —
   * worth pinning against events taken off mainnet verbatim.
   */

  const REAL =
    '(tuple (action "claim-staker-rewards") (data (tuple (block-height u8833302) ' +
    "(earned u114644) (reward-cycle u141) (staker 'SP21EKNCBB37VESYJAZ8MF6XTJ52E62X58J7N4K7G))))";

  it('reads a real claim off the log', () => {
    expect(parseClaimEvent(REAL)).toEqual({
      staker: 'SP21EKNCBB37VESYJAZ8MF6XTJ52E62X58J7N4K7G',
      earnedSats: 114_644n,
      cycle: 141,
    });
  });

  it('ignores the pool contract’s other prints', () => {
    // The same log carries `claim-rewards` (the pool pulling a whole cycle in
    // from pox-5) and `register-self`. Counting either as somebody's claim
    // would invent a staker and a payment.
    expect(
      parseClaimEvent(
        '(tuple (action "claim-rewards") (data (tuple (block-height u8800000) ' +
          '(reward-cycle u141) (total-rewards u15552470))))',
      ),
    ).toBeNull();
    expect(
      parseClaimEvent('(tuple (action "register-self") (data (tuple)))'),
    ).toBeNull();
  });

  it('refuses a claim event missing any of the three fields', () => {
    // Half a claim is not a smaller claim. Better to drop the line and have
    // the staker read as unclaimed than to report an amount nobody received.
    expect(
      parseClaimEvent(
        '(tuple (action "claim-staker-rewards") (data (tuple (earned u1) (reward-cycle u141))))',
      ),
    ).toBeNull();
  });
});

describe('parseMembershipEvent', () => {
  /*
   * Native Pool's members never call pox-5 themselves — `native-pool-v1
   * delegate` does it for them inside the same transaction — so pox-5's
   * transaction results never name them. This roll is the only list of who is
   * in the pool, which makes it the difference between "17 have claimed" and
   * "17 of 161 have claimed".
   */

  const DELEGATE =
    '(tuple (action "delegate") (data (tuple (amount-ustx u326700000000) ' +
    "(block-height u8691930) (num-cycles u96) (user 'SP21EKNCBB37VESYJAZ8MF6XTJ52E62X58J7N4K7G))))";

  it('reads a real delegate off the roll', () => {
    expect(parseMembershipEvent(DELEGATE)).toEqual({
      user: 'SP21EKNCBB37VESYJAZ8MF6XTJ52E62X58J7N4K7G',
      joined: true,
    });
  });

  it('treats an update as staying in, and an undelegate as leaving', () => {
    const of = (action: string) =>
      parseMembershipEvent(
        `(tuple (action "${action}") (data (tuple (user 'SP21EKNCBB37VESYJAZ8MF6XTJ52E62X58J7N4K7G))))`,
      );
    expect(of('delegate-update')?.joined).toBe(true);
    expect(of('undelegate')?.joined).toBe(false);
  });

  it('ignores initialize, which names no user', () => {
    expect(
      parseMembershipEvent('(tuple (action "initialize") (data (tuple)))'),
    ).toBeNull();
  });
});

describe('mergeMembers', () => {
  it('adds members the pox-5 walk could not see', () => {
    const stakers = new Map([['SP1AAA', new Set(['SP0.other-pool'])]]);
    const added = mergeMembers(stakers, 'SP0.native', ['SP1AAA', 'SP2BBB']);
    // SP1AAA was already known, but not as a member of this pool.
    expect(added).toBe(1);
    expect(stakers.get('SP1AAA')).toEqual(
      new Set(['SP0.other-pool', 'SP0.native']),
    );
    expect(stakers.get('SP2BBB')).toEqual(new Set(['SP0.native']));
  });

  it('is idempotent, so a re-run does not inflate the head count', () => {
    const stakers = new Map<string, Set<string>>();
    mergeMembers(stakers, 'SP0.native', ['SP1AAA']);
    expect(mergeMembers(stakers, 'SP0.native', ['SP1AAA'])).toBe(0);
    expect(stakers.size).toBe(1);
  });
});

/*
 * No single list has everyone. The committed rosters remember who was in a
 * pool in a cycle, the staking index knows who is in it now — wrapper joins
 * included, which pox-5's transaction results never name — and only the slow
 * walk through those transactions is independent of both. So what is worth
 * pinning down is that a staker keeps the pool they have left (it still owes
 * them for the cycles they were there), and that a list which would not come
 * back fails the count rather than shrinking it.
 */
describe('enumerateStakers', () => {
  const POOL_A = 'SP0.pool-a';
  const POOL_B = 'SP0.pool-b';
  const GATED = 'SP0.gated';

  let rosterDir = '';

  const writeRoster = (cycle: number, members: [string, string][]) => {
    const dir = path.join(rosterDir, `key-${cycle}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${cycle}.json`),
      JSON.stringify({
        signerKey: null,
        cycle,
        members: members.map(([staker, contractId]) => ({
          staker,
          ustx: '1',
          contractId,
        })),
      }),
    );
  };

  const stakeTx = (staker: string, signer: string) => ({
    tx: {
      tx_status: 'success',
      tx_result: {
        repr: `(ok (tuple (amount-ustx u100) (signer '${signer}) (staker '${staker})))`,
      },
      contract_call: {
        contract_id: 'SP000000000000000000002Q6VF78.pox-5',
        function_name: 'stake',
      },
    },
  });

  /**
   * Stands in for both endpoints: the staking index, one page per contract,
   * and pox-5's transaction history, fifty to a page. `null` for either is
   * "the API would not answer" — 400 rather than 429 or 500, because those
   * are worth waiting out and these tests are about what happens once the
   * waiting is over.
   */
  const serving = (opts: {
    index?: Record<string, string[] | null>;
    transactions?: ReturnType<typeof stakeTx>[] | null;
  }) =>
    vi.fn(async (url: string) => {
      const refused = { ok: false, status: 400, json: async () => ({}) };
      const answer = (body: unknown) => ({
        ok: true,
        status: 200,
        json: async () => body,
      });

      if (url.includes('/transactions')) {
        if (!opts.transactions) return refused;
        const offset = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0);
        return answer({
          total: opts.transactions.length,
          results: opts.transactions.slice(offset, offset + 50),
        });
      }

      const contract = /signers\/([^/]+)\/stakers/.exec(url)?.[1] ?? '';
      const stakers = opts.index?.[contract];
      if (!stakers) return refused;
      return answer({
        total: stakers.length,
        results: stakers.map((staker) => ({ staker, types: ['stx'] })),
        cursor: { next: null },
      });
    });

  beforeEach(() => {
    rosterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rosters-'));
  });

  afterEach(() => {
    fs.rmSync(rosterDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('keeps the pool somebody has left, and has the one who joined through a wrapper', async () => {
    // SP2BBB was with A in 141 and is with B now; SP3CCC joined the gated
    // pool through its wrapper, so no pox-5 transaction ever named them.
    writeRoster(141, [
      ['SP1AAA', POOL_A],
      ['SP2BBB', POOL_A],
    ]);
    vi.stubGlobal(
      'fetch',
      serving({
        index: {
          [POOL_A]: ['SP1AAA'],
          [POOL_B]: ['SP2BBB'],
          [GATED]: ['SP3CCC'],
        },
      }),
    );

    const found = await enumerateStakers({
      contractIds: [POOL_A, POOL_B, GATED],
      rosterDir,
    });

    expect(found?.stakers.size).toBe(3);
    expect([...(found?.stakers.get('SP1AAA') ?? [])]).toEqual([POOL_A]);
    // A owes them for the cycles they were there, whatever the index says now.
    expect([...(found?.stakers.get('SP2BBB') ?? [])]).toEqual([POOL_A, POOL_B]);
    expect([...(found?.stakers.get('SP3CCC') ?? [])]).toEqual([GATED]);
    expect(found?.rosterCycles).toEqual([141]);
    expect(found?.walked).toBe(false);
  });

  it('says which cycles it read, so a count can say what it stands on', async () => {
    writeRoster(141, [['SP1AAA', POOL_A]]);
    writeRoster(142, [['SP1AAA', POOL_A]]);
    vi.stubGlobal('fetch', serving({ index: { [POOL_A]: [] } }));

    const found = await enumerateStakers({
      contractIds: [POOL_A],
      rosterDir,
    });

    expect(found?.rosterCycles).toEqual([141, 142]);
  });

  it('reads pox-5 itself when asked, for a witness of its own', async () => {
    vi.stubGlobal(
      'fetch',
      serving({
        index: { [POOL_A]: [] },
        // Staked and gone: no roster, and the index has moved on.
        transactions: [stakeTx('SP9ZZZ', POOL_A)],
      }),
    );

    const found = await enumerateStakers({
      contractIds: [POOL_A],
      rosterDir,
      deep: true,
    });

    expect([...(found?.stakers.get('SP9ZZZ') ?? [])]).toEqual([POOL_A]);
    expect(found?.walked).toBe(true);
  });

  it('gives up rather than reporting fewer people than there are', async () => {
    vi.stubGlobal(
      'fetch',
      serving({ index: { [POOL_A]: ['SP1AAA'], [POOL_B]: null } }),
    );
    expect(
      await enumerateStakers({ contractIds: [POOL_A, POOL_B], rosterDir }),
    ).toBeNull();

    vi.stubGlobal(
      'fetch',
      serving({ index: { [POOL_A]: ['SP1AAA'] }, transactions: null }),
    );
    expect(
      await enumerateStakers({ contractIds: [POOL_A], rosterDir, deep: true }),
    ).toBeNull();
  });
});
