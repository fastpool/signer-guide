import { fireEvent, screen } from '@testing-library/react-native';
import { connectWallet, renderApp } from '../test/harness';
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
    // From the bundled snapshot: 408 sats per 1000 STX in cycle 142.
    expect(await screen.findByTestId('rate-value')).toHaveTextContent('408');
    expect(screen.getByTestId('rate-unit')).toHaveTextContent(
      'per 1,000 STX, each payout',
    );
    expect(screen.getByTestId('rate-cycle')).toHaveTextContent('CYCLE 142');
  });

  it('says what it is worth over a year, and what the last payout paid', async () => {
    renderApp();
    await screen.findByTestId('rate-value');
    expect(screen.getByTestId('rate-apy')).toHaveTextContent(/^\d+\.\d\d%$/);
    expect(screen.getByTestId('rate-last-payout')).toHaveTextContent('407 sats');
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
    for (const id of ['connect-xverse', 'connect-leather', 'connect-okx']) {
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
    expect(screen.getByTestId('position-address')).toHaveTextContent(/watching/i);
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
    // 100,000 STX is a hundred lots of 1000, so a hundred times 408 sats.
    expect(screen.getByTestId('position-earnings')).toHaveTextContent(/40,800 sats/);
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
    for (const id of ['more-contracts', 'more-pools', 'more-history', 'more-data']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });

  it('says how old the pool data is', async () => {
    renderApp();
    await screen.findByTestId('more-data');
    expect(screen.getByText(/Updated|saved copy/)).toBeOnTheScreen();
  });
});
