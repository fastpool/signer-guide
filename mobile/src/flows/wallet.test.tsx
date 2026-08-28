import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderApp } from '../test/harness';
import { installFetch } from '../test/network';
import { resetChain, staking } from '../test/chain';
import { en } from '../i18n/en';
import { MOCK_ADDRESS } from '../wallet/mock';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * The one screen that answers "whose stake is this".
 *
 * It used to be a card wedged under the stake, which made it compete with the
 * stake for somebody who had already answered the question — and there are two
 * answers, connected and watching, which a card had no room to keep apart.
 * What these tests hold to is that the difference between them stays visible:
 * a watched address can be read and cannot be signed for, and the app never
 * offers otherwise.
 */

const WATCHED = 'SMEVJTEWM9AE521B8E3HWQTHQR0WAPASHATZTA6Y';

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('signer-guide:seen-welcome:v1', '1');
  resetChain();
  installFetch();
});

async function openWallet() {
  renderApp();
  fireEvent.press(await screen.findByTestId('home-connect'));
  return screen.findByTestId('wallet-screen');
}

describe('connecting', () => {
  it('offers every wallet this app can reach', async () => {
    await openWallet();
    for (const id of ['connect-xverse', 'connect-leather', 'connect-okx', 'connect-any']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });

  it('closes itself once there is a session, so nobody has to find their way back', async () => {
    staking();
    await openWallet();
    fireEvent.press(screen.getByTestId('connect-xverse'));

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(await screen.findByTestId('position-card')).toBeOnTheScreen();
  });

  it('stays put, and says nothing, when somebody presses reject', async () => {
    renderApp({ failWith: new Error('User rejected the request') });
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-xverse'));

    // A rejection is a decision, not a fault.
    await waitFor(() => expect(screen.queryByTestId('wallet-error')).toBeNull());
    expect(screen.getByTestId('wallet-screen')).toBeOnTheScreen();
  });

  it('reports a wallet that broke, without closing on it', async () => {
    renderApp({ failWith: new Error('relay unreachable') });
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-xverse'));

    expect(await screen.findByTestId('wallet-error')).toHaveTextContent(
      /relay unreachable/,
    );
    expect(screen.getByTestId('wallet-screen')).toBeOnTheScreen();
  });
});

describe('watching', () => {
  it('is a heading of its own, not a link at the bottom of a card', async () => {
    await openWallet();
    expect(screen.getByTestId('wallet-watch')).toBeOnTheScreen();
    expect(screen.getByTestId('watch-input')).toBeOnTheScreen();
  });

  it('will not take something that is not a Stacks address', async () => {
    await openWallet();
    fireEvent.changeText(screen.getByTestId('watch-input'), 'nonsense');
    expect(screen.getByTestId('watch-submit')).toBeDisabled();
  });

  it('takes a contract principal, since a contract can stake', async () => {
    await openWallet();
    fireEvent.changeText(screen.getByTestId('watch-input'), WATCHED);
    expect(screen.getByTestId('watch-submit')).not.toBeDisabled();
  });

  it('cannot sign, and the app says so rather than offering to', async () => {
    staking();
    await openWallet();
    fireEvent.changeText(screen.getByTestId('watch-input'), WATCHED);
    fireEvent.press(screen.getByTestId('watch-submit'));

    expect(await screen.findByTestId('position-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('position-change')).toBeNull();
    expect(screen.getByTestId('position-address')).toHaveTextContent(
      new RegExp(en.messages['wallet.watching']),
    );
  });
});

describe('the account it is showing', () => {
  it('is reached from the stake card, which is where the address lives now', async () => {
    staking();
    renderApp();
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-xverse'));
    await screen.findByTestId('position-card');

    // The address is in the stake card, and it is also the way back here.
    expect(screen.getByTestId('position-address')).toHaveTextContent(
      new RegExp(MOCK_ADDRESS.slice(0, 6)),
    );
    fireEvent.press(screen.getByTestId('position-wallet'));
    expect(await screen.findByTestId('wallet-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('wallet-account')).toBeOnTheScreen();
  });

  it('can be forgotten, which puts the app back to knowing nobody', async () => {
    staking();
    renderApp();
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-xverse'));
    await screen.findByTestId('position-card');

    fireEvent.press(screen.getByTestId('position-wallet'));
    fireEvent.press(await screen.findByTestId('wallet-forget'));

    await waitFor(() =>
      expect(screen.queryByTestId('wallet-account')).toBeNull(),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('signer-guide:address:v1')).toBeNull(),
    );
  });
});
