import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BondsData, Signer } from '../lib/types';

/*
 * The file the page reads is fetched, not bundled, so the fetch is replaced
 * here and the page is read the way a visitor would read it: a current period
 * nobody made a bond of, and a next one that is most of the way full.
 *
 * The numbers are mainnet's own, from bond 1 — a ceiling of 250.005 BTC with
 * 220.0045 locked against it.
 */
const BONDS: BondsData = {
  generatedAt: '2026-09-09T10:36:04.088Z',
  cycle: 142,
  burnHeight: 966_190,
  firstBondPeriodCycle: 141,
  gapCycles: 2,
  lengthCycles: 12,
  current: {
    bondIndex: 0,
    firstRewardCycle: 141,
    unlockCycle: 153,
    startBurnHeight: 962_150,
    started: true,
    setUp: false,
    targetRate: null,
    stxValueRatio: null,
    minUstxRatio: null,
    allowlistedSats: '0',
    registeredSats: '0',
    allowlistComplete: true,
    stakers: [],
  },
  next: {
    bondIndex: 1,
    firstRewardCycle: 143,
    unlockCycle: 155,
    startBurnHeight: 966_350,
    started: false,
    setUp: true,
    targetRate: 300,
    stxValueRatio: '310237',
    minUstxRatio: 500,
    allowlistedSats: '25000500000',
    registeredSats: '22000450000',
    allowlistComplete: true,
    stakers: [
      {
        staker: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-staker-bond-1-v2',
        maxSats: '15000000000',
        registeredSats: '15000000000',
        amountUstx: '2326777500000',
        isL1Lock: false,
        signer: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.signer-manager-bond-1-v2',
      },
      {
        staker: 'SP349Q3BGARPT0V1T4H938PY9WK787PHPRFS3YAG',
        maxSats: '2500000000',
        registeredSats: '2500000000',
        amountUstx: '387796250000',
        isL1Lock: true,
        signer: 'SP3RX8RME63CY63G5WZ8XQWZNTYNETYJESQKE071E.stacks-labs',
      },
      {
        staker: 'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-1',
        maxSats: '2500000000',
        registeredSats: '0',
        amountUstx: null,
        isL1Lock: null,
        signer: null,
      },
    ],
  },
};

const SIGNERS = [
  {
    contractId: 'SP3RX8RME63CY63G5WZ8XQWZNTYNETYJESQKE071E.stacks-labs',
    displayName: 'Stacks Labs',
    displayNameSource: 'manual',
  },
] as unknown as Signer[];

const useBonds = vi.fn(() => ({ state: 'ready', value: BONDS }));

vi.mock('../lib/bonds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/bonds')>()),
  useBonds: () => useBonds(),
}));

const { default: BondsPage } = await import('./BondsPage');

describe('the bonds as a reader sees them', () => {
  const html = () =>
    renderToStaticMarkup(
      <BondsPage signers={SIGNERS} locale='en' onLocaleChange={() => {}} />,
    );

  it('names both periods and the cycles they cover', () => {
    const page = html();
    expect(page).toContain('The bond period now');
    expect(page).toContain('The next bond period');
    expect(page).toContain('Bond 1 · cycles 143 to 154');
  });

  it('says a period nobody set up has no bond, rather than an empty one', () => {
    // The alternative is three zeroes under "Locked so far", which reads as a
    // bond that nobody joined instead of a bond that never existed. Only the
    // next period has figures, so the labels appear once each.
    const page = html();
    expect(page).toContain('Nobody made a bond of this period');
    expect(page.match(/Locked so far/g)).toHaveLength(1);
    expect(page.match(/Ceiling/g)).toHaveLength(1);
  });

  it('keeps what is locked apart from what the allowlist permits', () => {
    const page = html();
    expect(page).toContain('Locked so far');
    expect(page).toContain('220.0045 BTC');
    expect(page).toContain('Ceiling');
    expect(page).toContain('250.005 BTC');
    // Named, rather than left as a subtraction for the reader.
    expect(page).toContain('Still open');
    expect(page).toContain('30.0005 BTC');
  });

  it('counts everyone who was invited, not everyone who turned up', () => {
    const page = html();
    expect(page).toContain('3 invited stakers');
  });

  it('says an invited staker has locked nothing, and still shows their ceiling', () => {
    const page = html();
    expect(page).toContain('nothing locked yet');
    expect(page).toContain('of 25 BTC');
  });

  it('says which chain the bitcoin is on, and which pool it went through', () => {
    const page = html();
    expect(page).toContain('on Bitcoin');
    expect(page).toContain('as sBTC');
    expect(page).toContain('Stacks Labs');
  });

  it('warns when the ceiling is only a floor', () => {
    useBonds.mockReturnValueOnce({
      state: 'ready',
      value: {
        ...BONDS,
        next: { ...BONDS.next, allowlistComplete: false },
      },
    });
    expect(html()).toContain('The allowlist below is short');
  });

  it('says nothing is on file rather than showing an empty bond', () => {
    useBonds.mockReturnValueOnce({ state: 'missing' } as never);
    const page = html();
    expect(page).toContain('Nothing on file for the bonds yet');
    expect(page).not.toContain('Locked so far');
  });
});
