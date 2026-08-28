import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hexToCV } from '@stacks/transactions';
import { connectWallet, renderApp } from '../test/harness';
import { installFetch } from '../test/network';
import { resetChain, staking } from '../test/chain';
import { defaultPool } from '../data/default-pool';
import { BUNDLED } from '../data/snapshot';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * The short way in.
 *
 * The long way — read the contracts, compare the pools, set an address, a fee
 * cap and a floor — is six screens and about eleven decisions. This is two
 * screens and one: how much. What the tests hold to is that the four decisions
 * made on somebody's behalf are the ones stated on screen, and that the call
 * that reaches the wallet is exactly those decisions and nothing else.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  resetChain();
  installFetch({ balanceUstx: 500_000_000_000n });
});

describe('the first launch', () => {
  it('opens on the welcome rather than the guide', async () => {
    renderApp();
    expect(await screen.findByTestId('welcome-screen')).toBeOnTheScreen();
  });

  it('leads with what somebody earns, not with what pox-5 is', async () => {
    renderApp();
    await screen.findByTestId('welcome-screen');
    expect(screen.getByTestId('welcome-rate-value')).toHaveTextContent(/%$/);
    // None of the machinery belongs between somebody and their first stake.
    for (const word of ['pox-5', 'signer manager', 'calldata', 'post condition']) {
      expect(screen.queryByText(new RegExp(word, 'i'))).toBeNull();
    }
  });

  it('happens once', async () => {
    const first = renderApp();
    fireEvent.press(await screen.findByTestId('welcome-skip'));
    await screen.findByTestId('home-screen');
    first.unmount();

    renderApp();
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('welcome-screen')).toBeNull();
  });

  it('can be skipped straight to the guide', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('welcome-skip'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });
});

describe('starting to stake', () => {
  async function reachStart() {
    renderApp();
    fireEvent.press(await screen.findByTestId('welcome-start'));
    return screen.findByTestId('start-screen');
  }

  it('asks for a wallet first, and for nothing else yet', async () => {
    await reachStart();
    expect(screen.getByTestId('start-connect')).toBeOnTheScreen();
    expect(screen.getByTestId('start-connect-xverse')).toBeOnTheScreen();
    expect(screen.getByTestId('start-connect-leather')).toBeOnTheScreen();
    expect(screen.getByTestId('start-connect-okx')).toBeOnTheScreen();
    // Nothing to fill in until there is somebody to fill it in for.
    expect(screen.queryByTestId('start-amount')).toBeNull();
  });

  it('shows the four decisions it made, and offers to change each', async () => {
    await reachStart();
    expect(screen.getByTestId('start-pool')).toBeOnTheScreen();
    expect(screen.getByTestId('start-payout')).toHaveTextContent('Held as sBTC');
    expect(screen.getByTestId('start-period')).toHaveTextContent('2 weeks');
    expect(screen.getByTestId('start-change-pool')).toBeOnTheScreen();
    expect(screen.getByTestId('start-full-form')).toBeOnTheScreen();
  });

  it('names the pool it chose, and says why', async () => {
    await reachStart();
    const chosen = defaultPool(BUNDLED)!;
    expect(screen.getByTestId('start-pool')).toHaveTextContent(
      chosen.signer.displayName,
    );
    expect(screen.getByText(/takes a stake from anyone/)).toBeOnTheScreen();
  });

  it('asks only how much, once a wallet is connected', async () => {
    await reachStart();
    fireEvent.press(screen.getByTestId('start-connect-xverse'));

    expect(await screen.findByTestId('start-amount')).toBeOnTheScreen();
    // No Bitcoin address, no fee cap, no floor, no lock period to pick.
    expect(screen.queryByTestId('btc-address')).toBeNull();
    expect(screen.queryByTestId('max-fee')).toBeNull();
    expect(screen.queryByTestId('min-claim')).toBeNull();
    expect(screen.queryByTestId('cycles-12')).toBeNull();
  });

  it('says what the amount typed would earn', async () => {
    await reachStart();
    fireEvent.press(screen.getByTestId('start-connect-xverse'));
    fireEvent.changeText(await screen.findByTestId('start-amount'), '100000');
    // 100,000 STX at 408 sats per 1000 STX.
    await waitFor(() =>
      expect(screen.getByTestId('start-earnings')).toHaveTextContent(/40,800 sats/),
    );
  });

  it('will not send a stake of nothing', async () => {
    const harness = renderApp();
    fireEvent.press(await screen.findByTestId('welcome-start'));
    await screen.findByTestId('start-screen');
    fireEvent.press(screen.getByTestId('start-connect-xverse'));
    await screen.findByTestId('start-amount');

    expect(screen.getByTestId('start-problem')).toHaveTextContent(
      'Enter how much to stake.',
    );
    expect(screen.getByTestId('start-submit')).toBeDisabled();
    expect(harness.calls).toHaveLength(0);
  });

  it('hands the wallet a stake with sBTC rewards and a one-cycle lock', async () => {
    const harness = renderApp();
    fireEvent.press(await screen.findByTestId('welcome-start'));
    await screen.findByTestId('start-screen');
    fireEvent.press(screen.getByTestId('start-connect-xverse'));
    fireEvent.changeText(await screen.findByTestId('start-amount'), '250');

    await waitFor(() => expect(screen.getByTestId('start-submit')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('start-submit'));

    await waitFor(() => expect(harness.calls).toHaveLength(1));
    const call = harness.calls[0];
    expect(call.contract).toBe('SP000000000000000000002Q6VF78.pox-5');
    expect(call.functionName).toBe('stake');

    const args = call.functionArgs.map(hexToCV);
    // The amount typed, to the microSTX.
    expect(args.some((cv) => cv.type === 'uint' && cv.value === 250_000_000n)).toBe(
      true,
    );
    // One cycle.
    expect(args.some((cv) => cv.type === 'uint' && cv.value === 1n)).toBe(true);
    // No calldata at all: rewards are held as sBTC, so there is no Bitcoin
    // address on chain to be mistyped.
    expect(args[args.length - 1].type).toBe('none');
  });

  it('lands on the transaction, not on a claim that it worked', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('welcome-start'));
    await screen.findByTestId('start-screen');
    fireEvent.press(screen.getByTestId('start-connect-xverse'));
    fireEvent.changeText(await screen.findByTestId('start-amount'), '250');
    await waitFor(() => expect(screen.getByTestId('start-submit')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('start-submit'));

    expect(await screen.findByTestId('sent-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('sent-status')).toHaveTextContent('waiting for the chain');
  });

  it('sends somebody who already stakes to the form that can change it', async () => {
    staking({ amountUstx: 100_000_000_000n });
    renderApp();
    fireEvent.press(await screen.findByTestId('welcome-start'));
    await screen.findByTestId('start-screen');
    fireEvent.press(screen.getByTestId('start-connect-xverse'));

    expect(await screen.findByTestId('start-change')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('start-change'));
    expect(await screen.findByTestId('stake-screen')).toBeOnTheScreen();
  });
});

describe('the long way round', () => {
  it('is still on the home screen, under the short one', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('welcome-skip'));
    await screen.findByTestId('home-screen');
    await connectWallet(screen, fireEvent);

    expect(await screen.findByTestId('start-staking')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('choose-yourself'));
    expect(await screen.findByTestId('choose-contract-screen')).toBeOnTheScreen();
  });
});
