import { describe, expect, it } from 'vitest';
import {
  assetTotals,
  attentionFor,
  availableStx,
  parseAddressList,
  parseArgs,
  resolveToken,
  stxTotal,
  unlockCycle,
  type Holdings,
  type Thresholds,
} from './address-report.js';

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
      json: true,
    });
  });

  it('refuses a minimum for a token nobody named', () => {
    expect(() => parseArgs(['--min-token', '1'])).toThrow(/needs a --token/);
    expect(() => parseArgs(['--ending-in', 'soon'])).toThrow(/cycles/);
    expect(() => parseArgs(['--tpo'])).toThrow(/Unknown option/);
  });
});
