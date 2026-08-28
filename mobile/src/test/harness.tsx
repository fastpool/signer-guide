import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';
import App from '../../App';
import { SnapshotProvider } from '../data/snapshot';
import { TranslationProvider } from '../i18n';
import { SettingsProvider, type Appearance } from '../settings';
import type { Locale } from '@guide/lib/i18n';
import { WalletProvider } from '../wallet/context';
import { mockWallet, type MockWalletOptions } from '../wallet/mock';
import type { ContractCallRequest, WalletId } from '../wallet/types';

/**
 * The whole app, rendered, with a chain and a wallet that answer.
 *
 * Nothing about the app itself is replaced: the real navigator, the real
 * screens, the real forms, the real staking package building the real call.
 * Only the two things that are genuinely outside — the network, and a wallet
 * that is another application — are stood in for.
 *
 * `calls` is the reason the stake tests are worth anything: whatever the
 * wallet was asked to sign ends up in it, so a test can assert on the call the
 * form produced rather than on the form having navigated somewhere.
 */

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export type Harness = RenderResult & {
  /** Every contract call the wallet was handed, in order. */
  calls: ContractCallRequest[];
};

export type HarnessOptions = MockWalletOptions & {
  /**
   * The preferences the app starts on.
   *
   * Passing them makes the settings provider skip its read of the device,
   * which is what lets a test assert on Korean or on the light palette without
   * racing an effect it did not start.
   */
  locale?: Locale;
  appearance?: Appearance;
};

export function renderApp(options: HarnessOptions = {}): Harness {
  const { locale = 'en', appearance = 'dark', ...walletOptions } = options;
  const calls: ContractCallRequest[] = [];
  const factory = (_walletId: WalletId) => mockWallet({ ...walletOptions, calls });

  const result = render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <SettingsProvider initial={{ locale, appearance }}>
        <TranslationProvider>
          <SnapshotProvider>
            <WalletProvider factory={factory}>
              <AppBody />
            </WalletProvider>
          </SnapshotProvider>
        </TranslationProvider>
      </SettingsProvider>
    </SafeAreaProvider>,
  );
  return Object.assign(result, { calls });
}

/*
 * `App` brings its own providers, which would nest a second wallet inside the
 * one the test controls. The navigator underneath it is what these tests want,
 * so it is reached directly.
 */
function AppBody(): ReactElement {
  const Navigation = require('../navigation').default;
  return <Navigation />;
}

export { App };

/**
 * Connect the test wallet, the way somebody would.
 *
 * Through the wallet screen rather than by calling the context directly: the
 * route from the home screen to a connected wallet is itself a thing that can
 * break, and a test that reached past it would not notice.
 */
export async function connectWallet(
  screen: typeof import('@testing-library/react-native').screen,
  fireEvent: typeof import('@testing-library/react-native').fireEvent,
  entry: 'home-connect' | 'home-wallet' | 'position-wallet' = 'home-connect',
): Promise<void> {
  fireEvent.press(await screen.findByTestId(entry));
  /*
   * The pairing-link entry, which is the only WalletConnect button the screen
   * offers now — the named wallets went when it became clear that Leather does
   * not support it and Xverse is unconfirmed. The harness's factory answers for
   * whichever id is asked, so this is the route with no build flag behind it.
   */
  fireEvent.press(await screen.findByTestId('connect-any'));
  // The wallet screen closes itself once a session exists — see the note in
  // `WalletScreen`. Waiting for the home screen is waiting for that.
  await screen.findByTestId('home-screen');
}
