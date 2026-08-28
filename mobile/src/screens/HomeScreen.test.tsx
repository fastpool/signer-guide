import { fireEvent, screen } from '@testing-library/react-native';
import { connectWallet, renderApp } from '../test/harness';
import { BUNDLED_RATE, expectedEarnings, expectedRateText } from '../test/rate';
import { installFetch } from '../test/network';
import { resetChain, staking, SIGNER } from '../test/chain';
import { MOCK_ADDRESS } from '../wallet/mock';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * The screen the app opens on. Two things have to be right about it: the rate
 * is there before anybody has connected anything, and what somebody has staked
 * takes the place of the invitation to stake once they have.
 */

beforeEach(() => {
  resetChain();
  installFetch();
});

describe('the rate', () => {
  it('is on the screen before any wallet is connected', async () => {
    renderApp();
    /*
     * Whatever the bundled snapshot currently says, not a number typed in
     * here: that file is rewritten hourly by a scheduled job and committed, so
     * a hard-coded figure is a test that goes red on its own.
     */
    expect(await screen.findByTestId('rate-value')).toHaveTextContent(
      expectedRateText(),
    );
    expect(screen.getByTestId('rate-unit')).toHaveTextContent(
      'per 1,000 STX, each payout',
    );
    expect(screen.getByTestId('rate-cycle')).toHaveTextContent(
      `CYCLE ${BUNDLED_RATE.cycle}`,
    );
  });

  it('says what it is worth over a year, and what the last payout paid', async () => {
    renderApp();
    await screen.findByTestId('rate-value');
    expect(screen.getByTestId('rate-apy')).toHaveTextContent(/^\d+\.\d\d%$/);
    expect(screen.getByTestId('rate-last-payout')).toHaveTextContent(/sats$/);
  });
});

describe('with nobody connected', () => {
  it('offers the way to a wallet rather than an empty position', async () => {
    renderApp();
    expect(await screen.findByTestId('not-connected')).toBeOnTheScreen();
    expect(screen.getByTestId('home-connect')).toBeOnTheScreen();
    expect(screen.getByTestId('home-watch')).toBeOnTheScreen();
  });

  it('puts the wallets on a screen of their own, one tap away', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('home-connect'));
    expect(await screen.findByTestId('wallet-screen')).toBeOnTheScreen();
    // Watching, the wallet browsers, then WalletConnect — in that order.
    for (const id of ['wallet-watch', 'wallet-browser', 'wallet-connect']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });

  it('lets somebody watch an address without a wallet at all', async () => {
    staking();
    renderApp();
    fireEvent.press(await screen.findByTestId('home-watch'));
    fireEvent.changeText(await screen.findByTestId('watch-input'), MOCK_ADDRESS);
    fireEvent.press(screen.getByTestId('watch-submit'));

    // Back on the home screen, showing that address's position — and saying
    // it is being watched rather than offering to sign for it.
    expect(await screen.findByTestId('position-card')).toBeOnTheScreen();
    // The word sits beside the address rather than inside it, so that the
    // address itself stays a plain address somebody can read back.
    expect(screen.getByTestId('position-watching')).toBeOnTheScreen();
    expect(screen.queryByTestId('position-change')).toBeNull();
  });

  it('will not watch something that is not a Stacks address', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('home-watch'));
    fireEvent.changeText(await screen.findByTestId('watch-input'), 'not-an-address');
    expect(screen.getByTestId('watch-submit')).toBeDisabled();
  });
});

describe('with a wallet connected', () => {
  it('shows the position and what it earns', async () => {
    staking({ amountUstx: 100_000_000_000n, signer: SIGNER });
    renderApp();
    await connectWallet(screen, fireEvent);

    expect(await screen.findByTestId('position-card')).toBeOnTheScreen();
    expect(screen.getByTestId('position-amount')).toHaveTextContent('100,000 STX');
    // Whose stake it is, in the card rather than in one of its own.
    expect(screen.getByTestId('position-address')).toBeOnTheScreen();
    // A hundred lots of 1,000 STX, so a hundred times the published rate.
    expect(screen.getByTestId('position-earnings')).toHaveTextContent(
      new RegExp(expectedEarnings(100_000_000_000n).perPayout),
    );
  });

  it('names the pool the stake is with', async () => {
    staking();
    renderApp();
    await connectWallet(screen, fireEvent);
    expect(await screen.findByTestId('position-pool')).toBeOnTheScreen();
  });

  it('invites a first stake when there is no position', async () => {
    resetChain({ staked: false });
    renderApp();
    await connectWallet(screen, fireEvent);

    expect(await screen.findByTestId('not-staking')).toBeOnTheScreen();
    expect(screen.getByTestId('start-staking')).toBeOnTheScreen();
  });
});

describe('everything else the guide knows', () => {
  it('is reachable, and under its own heading rather than beside the stake', async () => {
    renderApp();
    expect(await screen.findByTestId('more-section')).toBeOnTheScreen();
    for (const id of ['more-contracts', 'more-pools', 'more-data']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    /*
     * The payout history is deliberately not among them: the rate card's own
     * footer link goes there, and two routes to one screen on one screen is
     * one too many.
     */
    expect(screen.queryByTestId('more-history')).toBeNull();
    expect(screen.getByTestId('rate-history-link')).toBeOnTheScreen();
  });

  it('says how old the pool data is', async () => {
    renderApp();
    await screen.findByTestId('more-data');
    expect(screen.getByText(/Updated|saved copy/)).toBeOnTheScreen();
  });
});
