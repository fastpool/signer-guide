import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { embedJson, renderHtml } from './address-report-html.js';
import {
  activityAttention,
  atRisk,
  keyStatus,
  parseSections,
  parseSince,
  toJson,
  assetTotals,
  attentionFor,
  availableStx,
  cachePathProblem,
  fromCache,
  parseArgs,
  resolveToken,
  sbtcHeld,
  sbtcTotal,
  stxTotal,
  toActivityTx,
  toCache,
  unlockCycle,
  type ActivityTx,
  type Transfer,
  type Holdings,
  type Thresholds,
  type TokenMeta,
} from './address-report.js';
import { parseAddressList } from '../src/lib/principals.js';

/*
 * What the report decides, with no node in it. `attentionFor` is the whole
 * point of the script — it is the difference between a list of balances and a
 * list of things to do — and every rule in it is a claim that somebody should
 * go and act on an address.
 */

const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token';
const LOCKED_SBTC =
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token-locked';
const POOL =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';

const holdings = (over: Partial<Holdings> = {}): Holdings => ({
  address: 'SP2SCBYN5HX4WWPJ60G7SKNXD261M7WG24DSD5TQ',
  label: null,
  stxTotal: 1_000_000_000n,
  stxLocked: 0n,
  stake: null,
  fungible: {},
  nfts: {},
  ...over,
});

const thresholds = (over: Partial<Thresholds> = {}): Thresholds => ({
  minStx: 100_000_000n,
  endingIn: 2,
  minToken: null,
  token: null,
  tokenSymbol: 'sBTC',
  tokenDecimals: 8,
  activityDays: 30,
  ...over,
});

const staked = {
  signer: POOL,
  ustx: 900_000_000n,
  firstCycle: 141,
  numCycles: 6,
};

const tags = (h: Holdings, t = thresholds(), cycle = 141) =>
  attentionFor(h, t, cycle).map((reason) => reason.tag);

describe('what needs attention', () => {
  it('flags STX sitting unlocked with nothing staked', () => {
    expect(tags(holdings())).toEqual(['not staking']);
  });

  it('leaves an address alone when the idle STX is below the threshold', () => {
    expect(tags(holdings({ stxTotal: 99_000_000n }))).toEqual([]);
  });

  it('flags a stake close enough to unlocking to need a decision', () => {
    // Ends at cycle 147, and it is 145: two cycles left, which is the default.
    // Every microstack is locked, so nothing but the ending is worth saying.
    const allStaked = holdings({
      stake: staked,
      stxTotal: 900_000_000n,
      stxLocked: 900_000_000n,
    });
    expect(tags(allStaked, thresholds(), 145)).toEqual(['ending']);
    expect(tags(allStaked, thresholds(), 144)).toEqual([]);
  });

  it('flags a stake that has already ended', () => {
    const reasons = attentionFor(
      holdings({
        stake: staked,
        stxTotal: 900_000_000n,
        stxLocked: 900_000_000n,
      }),
      thresholds(),
      147,
    );
    expect(reasons[0].tag).toBe('ending');
    expect(reasons[0].detail).toMatch(/has ended/);
  });

  it('flags unlocked STX beside a stake as something to add, not as idle cash', () => {
    const reasons = attentionFor(
      holdings({ stake: staked, stxLocked: 900_000_000n }),
      thresholds(),
      141,
    );
    expect(reasons.map((r) => r.tag)).toEqual(['idle']);
    expect(reasons[0].detail).toMatch(/could be added to it/);
  });

  it('says locked STX with no pox-5 position is stacked somewhere else', () => {
    // The pox-4 changeover, and the one state that would otherwise read as
    // "not staking" — which is wrong — or as staking, which is wronger.
    const reasons = attentionFor(
      holdings({ stxLocked: 1_000_000_000n }),
      thresholds(),
      141,
    );
    expect(reasons.map((r) => r.tag)).toEqual(['not pox-5']);
    expect(reasons[0].detail).toMatch(/stacked elsewhere/);
  });

  it('never lets an unread address look like a healthy one', () => {
    const unreadBalance = tags(holdings({ stxTotal: null, stxLocked: null }));
    expect(unreadBalance[0]).toBe('unread');
    expect(tags(holdings({ stake: undefined }))[0]).toBe('unread');
  });

  it('flags an address holding none of the token asked about', () => {
    const t = thresholds({ token: SBTC });
    expect(tags(holdings({ stxTotal: 1n }), t)).toEqual(['token']);
    expect(
      tags(holdings({ stxTotal: 1n, fungible: { [SBTC]: 1n } }), t),
    ).toEqual([]);
  });

  it('flags a balance under an explicit minimum, and names both numbers', () => {
    const t = thresholds({ token: SBTC, minToken: 100_000_000n });
    const reasons = attentionFor(
      holdings({ stxTotal: 1n, fungible: { [SBTC]: 50_000_000n } }),
      t,
      141,
    );
    expect(reasons[0].detail).toBe(
      'holds 0.50000000 sBTC, under the 1.00000000 sBTC asked for',
    );
  });

  it('counts an NFT collection as a token to be missing', () => {
    const t = thresholds({ token: 'SP1.collection::thing', tokenDecimals: 0 });
    expect(tags(holdings({ stxTotal: 1n }), t)).toEqual(['token']);
    expect(
      tags(holdings({ stxTotal: 1n, nfts: { 'SP1.collection::thing': 2 } }), t),
    ).toEqual([]);
  });
});

describe('reading the numbers off an address', () => {
  it('is the unlocked part that can be staked today', () => {
    expect(availableStx(holdings({ stxTotal: 10n, stxLocked: 4n }))).toBe(6n);
  });

  it('does not guess when the API said nothing', () => {
    expect(availableStx(holdings({ stxTotal: null }))).toBeNull();
  });

  it('ends a stake in the cycle after its last', () => {
    expect(unlockCycle(staked)).toBe(147);
  });
});

describe('what the whole list holds', () => {
  const list = [
    holdings({
      stxTotal: 100n,
      stxLocked: 60n,
      fungible: { [SBTC]: 5n, [LOCKED_SBTC]: 0n },
      nfts: { 'SP1.c::art': 2 },
    }),
    holdings({
      stxTotal: 50n,
      stxLocked: 0n,
      fungible: { [SBTC]: 7n },
      nfts: {},
    }),
  ];

  it('adds STX up as the two amounts the decisions are about', () => {
    expect(stxTotal(list)).toEqual({
      total: 150n,
      locked: 60n,
      unlocked: 90n,
      holders: 2,
      unread: 0,
    });
  });

  it('counts an unreadable address rather than adding it in as zero', () => {
    const withGap = [...list, holdings({ stxTotal: null, stxLocked: null })];
    const sum = stxTotal(withGap);
    expect(sum.total).toBe(150n);
    expect(sum.unread).toBe(1);
  });

  it('adds each asset up and says how many addresses hold it', () => {
    expect(assetTotals(list)).toEqual([
      { asset: SBTC, kind: 'ft', total: 12n, holders: 2 },
      { asset: 'SP1.c::art', kind: 'nft', total: 2n, holders: 1 },
    ]);
  });

  it('leaves out an asset everybody holds none of', () => {
    // An address keeps its entry for a token long after sending the last of
    // it, and a row of noughts is not something anybody holds.
    expect(assetTotals(list).map((entry) => entry.asset)).not.toContain(
      LOCKED_SBTC,
    );
  });

  it('puts tokens before NFTs, then whatever the most addresses hold', () => {
    const many = [
      holdings({ fungible: { 'SP1.a::one': 1n }, nfts: { 'SP1.c::art': 1 } }),
      holdings({ fungible: { 'SP1.b::two': 1n, 'SP1.a::one': 1n } }),
    ];
    expect(assetTotals(many).map((entry) => entry.asset)).toEqual([
      'SP1.a::one',
      'SP1.b::two',
      'SP1.c::art',
    ]);
  });
});

describe('naming a token', () => {
  it('takes an asset identifier as itself, held or not', () => {
    expect(resolveToken(SBTC, [])).toEqual({ asset: SBTC });
  });

  it('finds one held asset from part of its name', () => {
    expect(resolveToken('tardlex', [SBTC, 'SP1.a::TardlexLabs'])).toEqual({
      asset: 'SP1.a::TardlexLabs',
    });
  });

  it('prefers the asset a query names in full over one containing it', () => {
    // `sbtc-token::sbtc-token` is inside `…::sbtc-token-locked` as well, and
    // calling that ambiguous would make the exact answer unusable.
    expect(resolveToken('sbtc-token::sbtc-token', [SBTC, LOCKED_SBTC])).toEqual(
      {
        asset: SBTC,
      },
    );
    expect(resolveToken('sbtc-token-locked', [SBTC, LOCKED_SBTC])).toEqual({
      asset: LOCKED_SBTC,
    });
  });

  it('refuses to choose between two matches', () => {
    // "sbtc" is the token and the locked token. Picking either would be a
    // guess about which of somebody's balances they meant.
    expect(resolveToken('sbtc', [SBTC, LOCKED_SBTC, SBTC])).toEqual({
      candidates: [SBTC, LOCKED_SBTC],
    });
  });

  it('reports no match rather than an empty answer', () => {
    expect(resolveToken('welsh', [SBTC])).toEqual({ candidates: [] });
  });
});

describe('a file of addresses', () => {
  it('takes labels, comments and blank lines the way people write them', () => {
    const { entries, rejected } = parseAddressList(
      [
        '# my addresses',
        'SP2SCBYN5HX4WWPJ60G7SKNXD261M7WG24DSD5TQ   treasury',
        '',
        'SM2AD8YHZACVGG9R5VY3H6R9NJ5E6P12ABJQR4ZW1 # the big one',
        'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-v1',
      ].join('\n'),
    );
    expect(entries).toEqual([
      {
        address: 'SP2SCBYN5HX4WWPJ60G7SKNXD261M7WG24DSD5TQ',
        label: 'treasury',
      },
      {
        address: 'SM2AD8YHZACVGG9R5VY3H6R9NJ5E6P12ABJQR4ZW1',
        label: 'the big one',
      },
      {
        address: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-v1',
        label: null,
      },
    ]);
    expect(rejected).toEqual([]);
  });

  it('takes a list pasted out of a JSON array, quotes and all', () => {
    // The format somebody actually has to hand, `//` labels included.
    const { entries, rejected } = parseAddressList(
      [
        '[',
        '  "SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9",',
        '  "SP1Y6ZAD2ZZFKNWN58V8EA42R3VRWFJSGWFAD9C36", // friedgerpool.btc',
        '  "SP2ZNPXGZ8S4GE568QSCF66PT02BZ63Y4W3Y7BHNZ" // Fast Pool Reserve',
        ']',
      ].join('\n'),
    );
    expect(entries).toEqual([
      { address: 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9', label: null },
      {
        address: 'SP1Y6ZAD2ZZFKNWN58V8EA42R3VRWFJSGWFAD9C36',
        label: 'friedgerpool.btc',
      },
      {
        address: 'SP2ZNPXGZ8S4GE568QSCF66PT02BZ63Y4W3Y7BHNZ',
        label: 'Fast Pool Reserve',
      },
    ]);
    expect(rejected).toEqual([]);
  });

  it('hands back what it could not read instead of dropping it', () => {
    // A typo silently skipped is an address nobody hears about again.
    const { entries, rejected } = parseAddressList('SP2SCB\nnonsense here');
    expect(entries).toEqual([]);
    expect(rejected).toEqual(['SP2SCB', 'nonsense here']);
  });
});

describe('the command line', () => {
  it('collects addresses alongside the options', () => {
    expect(parseArgs(['SP1', '--token', 'sbtc', 'SP2', '--json'])).toEqual({
      addresses: ['SP1', 'SP2'],
      file: null,
      token: 'sbtc',
      minToken: null,
      minStx: '100',
      endingIn: 2,
      activityDays: 30,
      since: null,
      activity: true,
      activityOnly: false,
      nfts: false,
      html: null,
      cache: null,
      fromCache: null,
      json: true,
    });
  });

  it('refuses a minimum for a token nobody named', () => {
    expect(() => parseArgs(['--min-token', '1'])).toThrow(/needs a --token/);
    expect(() => parseArgs(['--ending-in', 'soon'])).toThrow(/cycles/);
    expect(() => parseArgs(['--tpo'])).toThrow(/Unknown option/);
  });

  it('refuses a cache flag given without a path', () => {
    // The older flags read a missing value as "not given". For these it would
    // mean asking for everything, keeping none of it, and saying nothing.
    expect(() => parseArgs(['--cache'])).toThrow(/takes the path/);
    expect(() => parseArgs(['--from-cache'])).toThrow(/takes the path/);
    expect(() => parseArgs(['--cache', '--json'])).toThrow(/takes the path/);
  });

  it('takes the two cache paths', () => {
    expect(parseArgs(['--file', 'a.txt', '--cache', 'held.json']).cache).toBe(
      'held.json',
    );
    expect(parseArgs(['--from-cache', 'held.json']).fromCache).toBe(
      'held.json',
    );
  });

  it('refuses to read a capture and write one in the same run', () => {
    // Otherwise a narrowed run rewrites the capture with a subset of itself,
    // and the slow part has to be paid for twice.
    expect(() =>
      parseArgs(['--cache', 'held.json', '--from-cache', 'held.json']),
    ).toThrow(/one or the other/);
  });
});

describe('the sBTC column', () => {
  it('reads the balance off the address', () => {
    expect(sbtcHeld(holdings({ fungible: { [SBTC]: 80_873_915_755n } }))).toBe(
      80_873_915_755n,
    );
  });

  it('is zero for an address that holds none', () => {
    // A real zero: the balance read, and there was none of it.
    expect(sbtcHeld(holdings())).toBe(0n);
    expect(sbtcHeld(holdings({ fungible: { [LOCKED_SBTC]: 5n } }))).toBe(0n);
  });

  it('is not known for an address that would not read', () => {
    // `fungible` is empty on a failed call exactly as on an empty address,
    // so the balance failing is what tells the two apart.
    expect(sbtcHeld(holdings({ stxTotal: null }))).toBeNull();
  });

  it('adds up what it could read and counts what it could not', () => {
    expect(
      sbtcTotal([
        holdings({ fungible: { [SBTC]: 100n } }),
        holdings({ fungible: { [SBTC]: 23n } }),
        holdings({ stxTotal: null }),
      ]),
    ).toEqual({ total: 123n, unread: 1 });
  });
});

describe('keeping what the API said', () => {
  const meta: TokenMeta = {
    asset: SBTC,
    symbol: 'sBTC',
    decimals: 8,
    nft: false,
    known: true,
  };

  const captured = [
    holdings({
      address: 'SP1',
      label: 'one',
      fungible: { [SBTC]: 5n },
      nfts: { 'SP9.thing::thing': 2 },
    }),
    // pox-5 answered "no position".
    holdings({ address: 'SP2', stake: null }),
    // pox-5 would not answer at all, which is a different fact.
    holdings({ address: 'SP3', stake: undefined, stxTotal: null, stxLocked: null }),
    holdings({ address: 'SP4', stake: staked }),
  ];

  const roundTrip = () => {
    const file = toCache(
      captured,
      142,
      new Map([[SBTC, meta]]),
      'https://api.hiro.so',
      '2026-09-09T13:20:10.437Z',
    );
    // Through JSON, which is where a bigint or an undefined would be lost.
    return fromCache(JSON.parse(JSON.stringify(file)));
  };

  it('brings back every amount as the bigint it was', () => {
    const back = roundTrip();
    expect(back.holdings[0].fungible[SBTC]).toBe(5n);
    expect(back.holdings[0].stxTotal).toBe(1_000_000_000n);
    expect(back.holdings[0].nfts).toEqual({ 'SP9.thing::thing': 2 });
    expect(back.holdings[3].stake).toEqual(staked);
  });

  it('keeps "no position" apart from "pox-5 would not say"', () => {
    // Both are falsy and JSON has one word for them, so this is the pair the
    // cache is most able to get wrong — and the report reads them as
    // different flags.
    const back = roundTrip();
    expect(back.holdings[1].stake).toBeNull();
    expect(back.holdings[2].stake).toBeUndefined();
  });

  it('keeps an unread balance unread rather than zero', () => {
    expect(roundTrip().holdings[2].stxTotal).toBeNull();
  });

  it('carries the cycle and the capture time, not today’s', () => {
    const back = roundTrip();
    expect(back.cycle).toBe(142);
    expect(back.capturedAt).toBe('2026-09-09T13:20:10.437Z');
    expect(back.node).toBe('https://api.hiro.so');
    expect(back.tokenMeta.get(SBTC)?.decimals).toBe(8);
  });

  it('refuses a file that is not a capture', () => {
    // Pointing at the wrong file must say so — a report of no addresses
    // would read as a list where nothing needs attention.
    expect(() => fromCache(null)).toThrow(/not an address-report cache/i);
    expect(() => fromCache({ addresses: [] })).toThrow(/cache/i);
    expect(() => fromCache({ capturedAt: 'now', cycle: 1 })).toThrow(/cache/i);
  });
});


describe('where a capture may be written', () => {
  /*
   * Checked before a single request, because the write happens after minutes
   * of paced asking: a path that cannot be written throws away the answers,
   * the report and the retry round with them. `--cache addr` against an
   * existing directory did exactly that.
   */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'address-report-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('is happy with a file that does not exist yet in a directory that does', () => {
    expect(cachePathProblem(path.join(tmp, 'held.json'))).toBeNull();
  });

  it('is happy with an existing file it can overwrite', () => {
    const target = path.join(tmp, 'again.json');
    fs.writeFileSync(target, '{}');
    expect(cachePathProblem(target)).toBeNull();
  });

  it('refuses a directory, rather than naming a file inside it', () => {
    const dir = path.join(tmp, 'addr');
    fs.mkdirSync(dir);
    expect(cachePathProblem(dir)).toMatch(/is a directory/);
  });

  it('refuses a path whose directory is not there', () => {
    expect(cachePathProblem(path.join(tmp, 'nope', 'held.json'))).toMatch(
      /does not exist/,
    );
  });

  it('refuses an empty path', () => {
    expect(cachePathProblem('')).toMatch(/empty path/);
  });

  it('refuses a file it cannot write to', () => {
    const target = path.join(tmp, 'readonly.json');
    fs.writeFileSync(target, '{}');
    fs.chmodSync(target, 0o444);
    // Root ignores the mode, so this asserts nothing when tests run as root.
    if (process.getuid?.() === 0) return;
    expect(cachePathProblem(target)).toMatch(/cannot be written/);
  });
});

describe('who else is signing', () => {
  const ME = 'SP2SCBYN5HX4WWPJ60G7SKNXD261M7WG24DSD5TQ';
  const FRIEND = 'SP2ZNPXGZ8S4GE568QSCF66PT02BZ63Y4W3Y7BHNZ';
  const STRANGER = 'SP3KE3EV3CYP2NZJ0TSP34VPA3XSK82YED38TB97X';
  const DAY = 86_400;
  const NOW = 1_790_800_000;

  const tx = (over: Partial<ActivityTx> = {}): ActivityTx => ({
    txId: '0xa844885245759164aa415068a1183a98440a9aa17ea5c8cb2e35df35db9816b1',
    sender: ME,
    time: NOW - DAY,
    type: 'contract_call',
    status: 'success',
    sponsored: false,
    fee: 1000n,
    call: `${POOL}.delegate-stx`,
    transfers: [],
    ...over,
  });
  const move = (over: Partial<Transfer> = {}): Transfer => ({
    kind: 'stx',
    asset: 'STX',
    amount: 107_131_368n,
    item: null,
    sender: ME,
    recipient: STRANGER,
    ...over,
  });
  const sbtcMeta: TokenMeta = {
    asset: SBTC,
    symbol: 'sBTC',
    decimals: 8,
    nft: false,
    known: true,
  };
  const context = {
    now: NOW,
    listed: new Map<string, string | null>([
      [ME, null],
      [FRIEND, 'reserve'],
    ]),
    tokenMeta: new Map([[SBTC, sbtcMeta]]),
    safe: null as ReadonlySet<string> | null,
  };
  const read = (confirmed: ActivityTx[] | null, pending: ActivityTx[] | null = []) =>
    activityAttention(
      holdings({ activity: { confirmed, pending } }),
      thresholds(),
      context,
    );
  // Signed forty days ago: outside the window, recent enough to be no news.
  // Without it every test below would also be an address's first signature.
  const usual = tx({ time: NOW - 40 * DAY });
  const flags = (confirmed: ActivityTx[], pending: ActivityTx[] = []) =>
    read([...confirmed, usual], pending);

  it('says nothing about an address whose activity was never asked for', () => {
    expect(activityAttention(holdings(), thresholds(), context)).toEqual([]);
  });

  it('ignores what other people sent in — airdrops say nothing about this key', () => {
    expect(
      flags([tx({ sender: STRANGER, transfers: [move({ sender: STRANGER, recipient: ME })] })]),
    ).toEqual([]);
  });

  it('flags an STX transfer out to an address not on the list, naming both', () => {
    const reasons = flags([
      tx({ type: 'token_transfer', call: null, transfers: [move()] }),
    ]);
    expect(reasons.map((r) => r.tag)).toEqual(['outflow']);
    expect(reasons[0].detail).toMatch(
      /sent 107\.131368 STX to SP3KE3EV3CYP2NZJ0TSP34VPA3XSK82YED38TB97X \(not on the list\)/,
    );
  });

  it('gives a token transfer its amount, symbol and recipient', () => {
    const [reason] = flags([
      tx({
        call: `${POOL}.transfer-many`,
        transfers: [move({ kind: 'ft', asset: SBTC, amount: 42_487n, recipient: FRIEND })],
      }),
    ]);
    expect(reason.tag).toBe('outflow');
    expect(reason.detail).toMatch(/transfer-many: sent 0\.00042487 sBTC to .*\(reserve\)/);
  });

  it('prints a token with no metadata in base units, and says so', () => {
    const [reason] = flags([
      tx({ transfers: [move({ kind: 'ft', asset: 'SP1.x::alex', amount: 5n })] }),
    ]);
    expect(reason.detail).toMatch(/sent 5 alex \(base units\)/);
  });

  it('names an NFT by its collection and id', () => {
    const [reason] = flags([
      tx({ transfers: [move({ kind: 'nft', asset: 'SP1.punks::punk', amount: 1n, item: 'u42' })] }),
    ]);
    expect(reason.detail).toMatch(/sent punk u42 to SP3KE3/);
  });

  it('flags a call that moved nothing as signed, and leaves old ones alone', () => {
    expect(flags([tx()]).map((r) => r.tag)).toEqual(['signed']);
    expect(flags([tx({ time: NOW - 31 * DAY })])).toEqual([]);
  });

  it('flags a pending transaction this address signed', () => {
    const reasons = flags([], [tx({ status: 'pending' }), tx({ sender: STRANGER })]);
    expect(reasons.map((r) => r.tag)).toEqual(['pending']);
  });

  it('flags a key that wakes up after months of nothing', () => {
    expect(read([tx(), tx({ time: NOW - 200 * DAY })]).map((r) => r.tag)).toEqual([
      'woke up',
      'signed',
    ]);
    expect(flags([tx(), tx({ time: NOW - 10 * DAY })]).map((r) => r.tag)).toEqual([
      'signed',
      'signed',
    ]);
  });

  it('flags the first signature an address ever made', () => {
    const reasons = read([tx()]);
    expect(reasons[0].tag).toBe('woke up');
    expect(reasons[0].detail).toMatch(/first transaction this address ever signed/);
  });

  it('never lets an unread history look like a quiet one', () => {
    expect(read(null)[0].tag).toBe('unread');
    expect(read([], null)[0].tag).toBe('unread');
  });

  it('reads every kind of transfer off the API, and a pending STX transfer too', () => {
    const confirmed = toActivityTx(
      { tx_id: '0x1', sender_address: ME, tx_type: 'contract_call', tx_status: 'success' },
      {
        stx_transfers: [{ amount: '7', sender: ME, recipient: STRANGER }],
        ft_transfers: [{ amount: '42487', asset_identifier: SBTC, sender: ME, recipient: FRIEND }],
        nft_transfers: [
          { value: { repr: 'u1' }, asset_identifier: 'SP1.punks::punk', sender: '', recipient: ME },
        ],
      },
    );
    expect(confirmed.transfers.map((t) => [t.kind, t.amount, t.recipient])).toEqual([
      ['stx', 7n, STRANGER],
      ['ft', 42_487n, FRIEND],
      ['nft', 1n, ME],
    ]);
    const pending = toActivityTx({
      tx_id: '0x2',
      sender_address: ME,
      tx_type: 'token_transfer',
      tx_status: 'pending',
      token_transfer: { recipient_address: STRANGER, amount: '9' },
    });
    expect(pending.transfers).toEqual([move({ amount: 9n })]);
  });

  it('survives a round trip through the cache', () => {
    const h = holdings({
      activity: { confirmed: [tx({ transfers: [move()] })], pending: null },
    });
    const json = JSON.parse(JSON.stringify(toCache([h], 141, new Map(), 'node')));
    expect(fromCache(json).holdings[0].activity).toEqual(h.activity);
  });
});

describe('asking for activity alone', () => {
  it('takes --activity-only, and refuses what it would make meaningless', () => {
    expect(parseArgs(['--activity-only']).activityOnly).toBe(true);
    expect(() => parseArgs(['--activity-only', '--no-activity'])).toThrow();
    expect(() => parseArgs(['--activity-only', '--cache', 'x.json'])).toThrow();
    expect(() => parseArgs(['--activity-only', '--token', 'alex'])).toThrow();
    expect(parseArgs(['--activity-only', '--from-cache', 'x.json']).fromCache).toBe('x.json');
  });
});

describe('safe and possibly compromised keys', () => {
  const OLD = 'SP2SCBYN5HX4WWPJ60G7SKNXD261M7WG24DSD5TQ';
  const NEW = 'SP2PJ5J86KSPKYXSWZ7VX21P66M53V96DZ2JW5J8K';
  const STRANGER = 'SP3KE3EV3CYP2NZJ0TSP34VPA3XSK82YED38TB97X';
  const NOW = 1_790_800_000;

  it('reads the safe section off the file, and only with the heading', () => {
    const text = [
      `"${OLD}", // old`,
      '// --- safe ---',
      `"${NEW}", // #1 2026`,
    ].join('\n');
    const parsed = parseSections(text);
    expect(parsed.marked).toBe(true);
    expect(parsed.entries).toEqual([
      { address: OLD, label: 'old', safe: false },
      { address: NEW, label: '#1 2026', safe: true },
    ]);
    expect(parseSections(`${OLD}\n${NEW}`).marked).toBe(false);
    // Another heading ends the section.
    const back = parseSections(`// --- safe ---\n${NEW}\n# --- old ---\n${OLD}`);
    expect(back.entries.map((e) => e.safe)).toEqual([true, false]);
  });

  it('calls nothing compromised on a list that never said what is safe', () => {
    expect(keyStatus(OLD, null)).toBe('unmarked');
    expect(keyStatus(OLD, new Set([NEW]))).toBe('compromised');
    expect(keyStatus(NEW, new Set([NEW]))).toBe('safe');
  });

  const send = (from: string, to: string, time = NOW - 86_400): ActivityTx => ({
    txId: '0x7eebdd028e00000000000000000000000000000000000000000000000000009d42',
    sender: from,
    time,
    type: 'token_transfer',
    status: 'success',
    sponsored: false,
    fee: 300n,
    call: null,
    transfers: [
      { kind: 'stx', asset: 'STX', amount: 5n, item: null, sender: from, recipient: to },
    ],
  });
  const context = {
    now: NOW,
    listed: new Map<string, string | null>([
      [OLD, 'old'],
      [NEW, '#1 2026'],
    ]),
    tokenMeta: new Map(),
    safe: new Set([NEW]) as ReadonlySet<string>,
  };
  const tagsOf = (address: string, txs: ActivityTx[]) =>
    activityAttention(
      holdings({ address, activity: { confirmed: txs, pending: [] } }),
      thresholds(),
      context,
    ).map((r) => r.tag);

  it('leaves the rescue out, and flags the theft', () => {
    const earlier = send(OLD, NEW, NOW - 40 * 86_400);
    expect(tagsOf(OLD, [send(OLD, NEW), earlier])).toEqual([]);
    expect(tagsOf(OLD, [send(OLD, STRANGER), earlier])).toEqual(['outflow']);
  });

  it('does not count a move to another old key as a rescue', () => {
    const OTHER_OLD = 'SP3AQDW78BWS2AZMBZWD7XWGH5HQS3HHVS2MC9NBD';
    expect(tagsOf(OLD, [send(OLD, OTHER_OLD), send(OLD, NEW, NOW - 40 * 86_400)])).toEqual([
      'outflow',
    ]);
  });

  it('lets a safe key sign, and flags it only sending outside the safe set', () => {
    expect(tagsOf(NEW, [send(NEW, NEW)])).toEqual([]);
    expect(tagsOf(NEW, [{ ...send(NEW, NEW), transfers: [] }])).toEqual([]);
    expect(tagsOf(NEW, [send(NEW, STRANGER)])).toEqual(['outflow']);
  });

  it('lists what is still on the old keys, and nothing on the safe ones', () => {
    const risks = atRisk(
      [
        holdings({ address: OLD, stxTotal: 10n, stxLocked: 4n, fungible: { [SBTC]: 3n, 'SP1.x::alex': 0n } }),
        holdings({ address: NEW, stxTotal: 99n }),
        holdings({ address: 'SP3NF0PJA5SZQCA29BAQDGFF40ZR03VQ4D5WW8AY4', stxTotal: 0n }),
      ],
      new Set([NEW]),
    );
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ address: OLD, unlocked: 6n, locked: 4n, sbtc: 3n, tokens: {} });
    expect(atRisk([holdings()], null)).toEqual([]);
  });
});

describe('the page', () => {
  it('cannot be broken out of by a label', () => {
    const embedded = embedJson({ label: '</script><script>alert(1)</script>' });
    expect(embedded).not.toContain('</script>');
    expect(JSON.parse(embedded)).toEqual({ label: '</script><script>alert(1)</script>' });
  });

  it('carries the whole report, and fetches nothing', () => {
    const row = { holdings: holdings({ label: 'a </script> label' }), reasons: [], poolName: null };
    const report = toJson([row], null, 141, new Map(), null, { safe: null, now: 1 }, { since: 0, label: 'since 1970-01-01 00:00 UTC' });
    const html = renderHtml(report);
    const json = /<script type="application\/json" id="report">(.*?)<\/script>/s.exec(html)?.[1];
    expect(JSON.parse(json ?? 'null').addresses[0].label).toBe('a </script> label');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/);
  });
});

describe('a window from a date', () => {
  const ME = 'SP2SCBYN5HX4WWPJ60G7SKNXD261M7WG24DSD5TQ';
  const SEP_29 = Date.parse('2026-09-29T00:00:00Z') / 1000;

  it('reads a bare date as midnight UTC, and refuses anything else', () => {
    expect(parseSince('2026-09-29')).toBe(SEP_29);
    expect(parseArgs(['--since', '2026-09-29']).since).toBe(SEP_29);
    expect(() => parseArgs(['--since', 'last tuesday'])).toThrow(/--since/);
    expect(() => parseArgs(['--since'])).toThrow(/--since/);
  });

  it('flags from the date on, however long ago the window would have been', () => {
    const signedAt = (time: number) => ({
      txId: '0x1',
      sender: ME,
      time,
      type: 'contract_call',
      status: 'success',
      sponsored: false,
      fee: 1n,
      call: 'SP1.x.y',
      transfers: [],
    });
    const now = SEP_29 + 3 * 86_400;
    const reasons = activityAttention(
      holdings({
        activity: {
          // The day before the date, inside 30 days: not flagged.
          confirmed: [signedAt(SEP_29 + 3600), signedAt(SEP_29 - 3600), signedAt(SEP_29 - 20 * 86_400)],
          pending: [],
        },
      }),
      thresholds({ activitySince: SEP_29 }),
      { now, listed: new Map(), tokenMeta: new Map(), safe: null },
    );
    expect(reasons.map((r) => r.tag)).toEqual(['signed']);
  });
});
