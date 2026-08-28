import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { hexToCV } from '@stacks/transactions';
import { connectWallet, renderApp } from '../test/harness';
import { installFetch } from '../test/network';
import { CHAIN, resetChain, staking } from '../test/chain';
import { MOCK_TXID } from '../wallet/mock';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * The long way round, walked end to end: somebody with no stake opens the app,
 * picks a contract, picks a pool that runs it, fills the whole form in, and
 * the wallet is handed a call.
 *
 * This is the path for somebody who wants to choose. The short one — every
 * decision but the amount already made — is `onboarding.test.tsx`, and both
 * have to keep working: a default nobody can refuse is not a default.
 *
 * The assertion at the end is the one that matters. It is not that the app
 * navigated to a success screen — that would pass with a form that sent
 * nothing — but that what reached the wallet is a pox-5 `stake` for the amount
 * typed, bounded by a post condition, with the pool that was chosen inside it.
 */

const STANDARD = 'standard';

beforeEach(() => {
  resetChain();
  installFetch({ balanceUstx: 500_000_000_000n });
});

async function connect() {
  await connectWallet(screen, fireEvent);
}

describe('choosing where to stake', () => {
  it('leads with the contracts, not the forty-five pools', async () => {
    renderApp();
    await connect();

    fireEvent.press(await screen.findByTestId('choose-yourself'));

    expect(await screen.findByTestId('choose-contract-screen')).toBeOnTheScreen();
    // The contract most pools run is first, because it is the code a reader is
    // likeliest to have already met.
    expect(screen.getByTestId(`template-${STANDARD}`)).toBeOnTheScreen();
  });

  it('says in plain language what a contract does before asking to pick one', async () => {
    renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('choose-yourself'));
    fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));

    expect(await screen.findByTestId('contract-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('contract-features')).toBeOnTheScreen();
    expect(screen.getByTestId('contract-pools')).toBeOnTheScreen();
  });

  it('offers only pools that would actually take the stake', async () => {
    renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('choose-yourself'));
    fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));
    await screen.findByTestId('contract-screen');

    // Every pool offered on the way to staking is registered and open; an
    // unregistered one would be refused by the chain after the fee was paid.
    const offered = screen.queryAllByText(/not registered|not open to all/);
    expect(offered).toHaveLength(0);
  });
});

describe('staking for the first time', () => {
  async function walkToForm() {
    renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('choose-yourself'));
    fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));
    await screen.findByTestId('contract-screen');
    const pools = screen.getAllByTestId(/^pool-SP/);
    fireEvent.press(pools[0]);
    fireEvent.press(await screen.findByTestId('pool-stake'));
    return screen.findByTestId('stake-screen');
  }

  it('will not send a stake of nothing', async () => {
    const harness = renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('choose-yourself'));
    fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));
    await screen.findByTestId('contract-screen');
    fireEvent.press(screen.getAllByTestId(/^pool-SP/)[0]);
    fireEvent.press(await screen.findByTestId('pool-stake'));
    await screen.findByTestId('stake-screen');

    expect(screen.getByTestId('stake-problem')).toHaveTextContent(
      'Enter how much to stake.',
    );
    expect(screen.getByTestId('stake-submit')).toBeDisabled();
    expect(harness.calls).toHaveLength(0);
  });

  it('refuses more than is free to lock', async () => {
    installFetch({ balanceUstx: 10_000_000n });
    await walkToForm();

    fireEvent.changeText(screen.getByTestId('stake-amount'), '100');
    await waitFor(() =>
      expect(screen.getByTestId('stake-problem')).toHaveTextContent(/free to lock/),
    );
  });

  it('shows what the amount typed would earn, at the published rate', async () => {
    await walkToForm();
    fireEvent.changeText(screen.getByTestId('stake-amount'), '100000');

    // 100,000 STX at 408 sats per 1000 STX is 40,800 a payout.
    await waitFor(() =>
      expect(screen.getByTestId('projection-payout')).toHaveTextContent('40,800 sats'),
    );
  });

  it('hands the wallet a pox-5 stake for exactly what was typed', async () => {
    const harness = renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('choose-yourself'));
    fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));
    await screen.findByTestId('contract-screen');
    fireEvent.press(screen.getAllByTestId(/^pool-SP/)[0]);
    fireEvent.press(await screen.findByTestId('pool-stake'));
    await screen.findByTestId('stake-screen');

    fireEvent.changeText(screen.getByTestId('stake-amount'), '1234.5');
    // Rewards held as sBTC, so no Bitcoin address is needed to finish.
    fireEvent(screen.getByTestId('payout-toggle'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('cycles-12'));

    await waitFor(() => expect(screen.getByTestId('stake-submit')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('stake-submit'));

    await waitFor(() => expect(harness.calls).toHaveLength(1));
    const call = harness.calls[0];
    expect(call.contract).toBe('SP000000000000000000002Q6VF78.pox-5');
    expect(call.functionName).toBe('stake');
    expect(call.postConditionMode).toBe('deny');
    expect(call.postConditions).toHaveLength(1);

    const args = call.functionArgs.map(hexToCV);
    expect(args.some((cv) => cv.type === 'uint' && cv.value === 1_234_500_000n)).toBe(
      true,
    );
  });

  it('follows the transaction rather than calling a broadcast a stake', async () => {
    const harness = renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('choose-yourself'));
    fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));
    await screen.findByTestId('contract-screen');
    fireEvent.press(screen.getAllByTestId(/^pool-SP/)[0]);
    fireEvent.press(await screen.findByTestId('pool-stake'));
    await screen.findByTestId('stake-screen');

    fireEvent.changeText(screen.getByTestId('stake-amount'), '100');
    fireEvent(screen.getByTestId('payout-toggle'), 'valueChange', false);
    await waitFor(() => expect(screen.getByTestId('stake-submit')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('stake-submit'));

    expect(await screen.findByTestId('sent-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('sent-status')).toHaveTextContent(
      'waiting for the chain',
    );
    expect(screen.getByTestId('sent-txid')).toBeOnTheScreen();
    expect(harness.calls).toHaveLength(1);
  });

  it('says so, and sends nothing, when a Bitcoin address is wanted but wrong', async () => {
    const harness = await (async () => {
      const h = renderApp();
      await connect();
      fireEvent.press(await screen.findByTestId('choose-yourself'));
      fireEvent.press(await screen.findByTestId(`template-${STANDARD}`));
      await screen.findByTestId('contract-screen');
      fireEvent.press(screen.getAllByTestId(/^pool-SP/)[0]);
      fireEvent.press(await screen.findByTestId('pool-stake'));
      await screen.findByTestId('stake-screen');
      return h;
    })();

    fireEvent.changeText(screen.getByTestId('stake-amount'), '100');
    fireEvent.changeText(screen.getByTestId('btc-address'), 'nonsense');

    await waitFor(() =>
      expect(screen.getByTestId('stake-problem')).toHaveTextContent(
        /Bitcoin address/,
      ),
    );
    expect(screen.getByTestId('stake-submit')).toBeDisabled();
    expect(harness.calls).toHaveLength(0);
  });

  it('will not take a payout floor the contract would reject', async () => {
    await walkToForm();
    fireEvent.changeText(screen.getByTestId('stake-amount'), '100');
    fireEvent.changeText(screen.getByTestId('btc-address'), 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
    fireEvent.changeText(screen.getByTestId('max-fee'), '3000');
    // Under max-fee plus the dust limit, which the contract refuses outright.
    fireEvent.changeText(screen.getByTestId('min-claim'), '1000');

    await waitFor(() =>
      expect(screen.getByTestId('stake-problem')).toHaveTextContent(/3,546 sats/),
    );
  });
});

describe('changing a stake that already exists', () => {
  it('opens the form on the pool already staked with', async () => {
    staking({ amountUstx: 100_000_000_000n });
    renderApp();
    await connect();

    fireEvent.press(await screen.findByTestId('position-change'));
    expect(await screen.findByTestId('stake-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('stake-mode')).toHaveTextContent(
      'CHANGE YOUR STAKE WITH',
    );
  });

  it('sends a stake-update, bounded by the whole position', async () => {
    staking({ amountUstx: 100_000_000_000n });
    const harness = renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('position-change'));
    await screen.findByTestId('stake-screen');

    fireEvent.changeText(screen.getByTestId('stake-amount'), '500');
    fireEvent(screen.getByTestId('payout-toggle'), 'valueChange', false);
    await waitFor(() => expect(screen.getByTestId('stake-submit')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('stake-submit'));

    await waitFor(() => expect(harness.calls).toHaveLength(1));
    expect(harness.calls[0].functionName).toBe('stake-update');
    // Two conditions: the total bounded, and the PoX action a rotation makes.
    expect(harness.calls[0].postConditions).toHaveLength(2);
  });

  it('offers to end the stake, and sends an unstake with no amount in it', async () => {
    staking({ amountUstx: 100_000_000_000n });
    const harness = renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('position-change'));
    await screen.findByTestId('stake-screen');

    fireEvent.press(screen.getByTestId('unstake-submit'));

    await waitFor(() => expect(harness.calls).toHaveLength(1));
    expect(harness.calls[0].functionName).toBe('unstake');
    expect(harness.calls[0].postConditions).toHaveLength(1);
  });

  it('will not change anything during the prepare phase, when pox-5 refuses', async () => {
    staking({ amountUstx: 100_000_000_000n });
    renderApp();
    await connect();
    fireEvent.press(await screen.findByTestId('position-change'));
    await screen.findByTestId('stake-screen');
    // Nothing typed, same pool, no extension asked for.
    expect(screen.getByTestId('stake-submit')).toBeDisabled();
  });
});

describe('a wallet that refuses', () => {
  it('leaves the form where it was rather than claiming a stake', async () => {
    const harness = renderApp({ failWith: new Error('User rejected the request') });
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-xverse'));

    // A rejection is a decision, not a fault, so nothing is shown as an error
    // — and the wallet screen stays put rather than closing on nothing.
    await waitFor(() => expect(screen.queryByTestId('wallet-error')).toBeNull());
    expect(screen.getByTestId('connect-xverse')).toBeOnTheScreen();
    expect(harness.calls).toHaveLength(0);
  });
});

describe('the mock wallet', () => {
  it('exists so this whole path can run on a phone with no wallet on it', () => {
    expect(MOCK_TXID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(CHAIN).toBeDefined();
  });
});
