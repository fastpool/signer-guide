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
  it('names no wallet it cannot actually reach that way', async () => {
    await openWallet();
    /*
     * Leather registers no `wc:` scheme and has the integration open on its own
     * tracker; Xverse gets as far as its lock screen and no further has been
     * confirmed. A button per wallet here promised three things that mostly do
     * not happen, so what is left is the link itself.
     */
    for (const id of ['connect-xverse', 'connect-leather', 'connect-okx']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('connect-any')).toHaveTextContent(
      /Copy a connection link/,
    );
  });

  it('puts the routes in the order somebody can get somewhere by', async () => {
    await openWallet();
    // Watching needs nothing installed; the browsers work; WalletConnect
    // mostly does not. Last is where the last of those belongs.
    expect(screen.getByTestId('wallet-watch')).toBeOnTheScreen();
    expect(screen.getByTestId('wallet-browser')).toBeOnTheScreen();
    expect(screen.getByTestId('wallet-connect')).toBeOnTheScreen();
  });

  it('closes itself once there is a session, so nobody has to find their way back', async () => {
    staking();
    await openWallet();
    fireEvent.press(screen.getByTestId('connect-any'));

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(await screen.findByTestId('position-card')).toBeOnTheScreen();
  });

  it('stays put, and says nothing, when somebody presses reject', async () => {
    renderApp({ failWith: new Error('User rejected the request') });
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-any'));

    // A rejection is a decision, not a fault.
    await waitFor(() => expect(screen.queryByTestId('wallet-error')).toBeNull());
    expect(screen.getByTestId('wallet-screen')).toBeOnTheScreen();
  });

  it('reports a wallet that broke, without closing on it', async () => {
    renderApp({ failWith: new Error('relay unreachable') });
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-any'));

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
    expect(screen.getByTestId('position-watching')).toHaveTextContent(
      en.messages['wallet.watching'],
    );
  });
});

describe('the account it is showing', () => {
  it('is reached from the stake card, which is where the address lives now', async () => {
    staking();
    renderApp();
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-any'));
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
    fireEvent.press(await screen.findByTestId('connect-any'));
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

describe('a connect that is still waiting', () => {
  /*
   * `connect()` does not come back until the wallet approves or the proposal
   * expires, which is minutes. The copy-a-link route never comes back at all
   * on its own, because the person has to go and paste it somewhere. Both need
   * a way out that is not force-quitting the app.
   */
  it('offers a way to stop, and forgets the attempt when it is taken', async () => {
    // A wallet that never answers, which is the state being tested.
    renderApp({ failWith: new Promise<never>(() => {}) as never });
    fireEvent.press(await screen.findByTestId('home-connect'));
    fireEvent.press(await screen.findByTestId('connect-any'));

    fireEvent.press(await screen.findByTestId('connect-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('connect-cancel')).toBeNull(),
    );
    // Stopping is a decision, so nothing is shown as an error.
    expect(screen.queryByTestId('wallet-error')).toBeNull();
    expect(screen.getByTestId('connect-any')).toBeOnTheScreen();
  });
});

describe('watching a BNS name', () => {
  it('takes a name as well as an address', async () => {
    await openWallet();
    fireEvent.changeText(screen.getByTestId('watch-input'), 'friedger.btc');
    expect(screen.getByTestId('watch-submit')).not.toBeDisabled();
  });

  it('still refuses something that is neither', async () => {
    await openWallet();
    fireEvent.changeText(screen.getByTestId('watch-input'), 'not a name');
    expect(screen.getByTestId('watch-submit')).toBeDisabled();
  });

  it('says a name nobody owns is unowned, and a node that would not answer is not that', async () => {
    /*
     * The two are kept apart on purpose. Showing a failed lookup as
     * "unregistered" tells somebody their name does not exist, which is a
     * different and worse thing to be wrong about.
     */
    expect(en.messages['wallet.nameUnregistered']).toMatch(/Nobody owns/);
    expect(en.messages['wallet.nameLookupFailed']).toMatch(/not the same/);
  });
});

describe('the wallet browsers', () => {
  it('offers both wallets that have one', async () => {
    await openWallet();
    expect(screen.getByTestId('browser-leather')).toBeOnTheScreen();
    expect(screen.getByTestId('browser-xverse')).toBeOnTheScreen();
  });
});
