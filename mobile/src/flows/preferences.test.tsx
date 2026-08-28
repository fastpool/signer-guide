import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectWallet, renderApp } from '../test/harness';
import { installFetch } from '../test/network';
import { resetChain, staking } from '../test/chain';
import { en } from '../i18n/en';
import { ko } from '../i18n/ko';
import { LOCALES, translate } from '../i18n';
import { PALETTES } from '../theme';
import { WALLET_NAMES } from '../wallet/walletconnect';
import { MOCK_ADDRESS } from '../wallet/mock';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * The three things a reader is allowed to decide.
 *
 * The catalogue tests below are the ones that will still be earning their keep
 * in a year: a language switch is only worth having if every screen actually
 * has something to switch to, and a key added in English and forgotten in
 * Korean is the way that stops being true one string at a time.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('signer-guide:seen-welcome:v1', '1');
  resetChain();
  installFetch();
});

describe('the catalogue', () => {
  it('says everything in both languages', () => {
    const missing = (Object.keys(en.messages) as (keyof typeof en.messages)[])
      .filter((key) => !ko.messages[key]);
    expect(missing).toEqual([]);
  });

  it('has no key in one language that is not in the other', () => {
    expect(Object.keys(ko.messages).sort()).toEqual(
      Object.keys(en.messages).sort(),
    );
  });

  it('actually translates — no key is left as its English', () => {
    /*
     * Three exceptions, each for a reason:
     *
     *   stake.extendBy   is `+{count}`, which is the same in any language
     *   rate.sats        is the unit, and the guide's own Korean bundle keeps
     *                    `sats` untranslated — `amount.sats` is '{value} sats'.
     *                    The rate card puts this label directly beside a figure
     *                    formatted by that, so translating one and not the
     *                    other put two words for one unit six millimetres apart
     *
     * Everything else has to differ, or it has not been translated at all.
     */
    const sameOnPurpose = new Set([
      'stake.extendBy',
      'rate.sats',
      // A stand-in used only in a build with the test wallet compiled in; it
      // is never in front of anybody who reads Korean.
      'wallet.testWallet',
    ]);
    const untranslated = (Object.keys(en.messages) as (keyof typeof en.messages)[])
      .filter((key) => !sameOnPurpose.has(key))
      .filter((key) => ko.messages[key] === en.messages[key]);
    expect(untranslated).toEqual([]);
  });

  /*
   * `satsLabel` returns "3,000 sats" — the unit included. A message that then
   * appends its own read "3,000 sats sats of fee" on the position card, in
   * both languages, and no test noticed because both languages were equally
   * wrong.
   */
  it('never appends a unit to a placeholder that already carries one', () => {
    const filled = { fee: '3,000 sats', payout: '408 sats', year: '1.2 sBTC' };
    for (const locale of LOCALES) {
      const t = translate(locale);
      for (const key of ['position.btcHint', 'position.earnings'] as const) {
        expect({ locale, key, text: t(key, filled) }).not.toMatchObject({
          text: expect.stringMatching(/sats\s+sats|sBTC\s+sBTC/),
        });
      }
    }
  });

  it('keeps every placeholder a message declares', () => {
    const placeholders = (value: string) =>
      (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
    for (const key of Object.keys(en.messages) as (keyof typeof en.messages)[]) {
      expect({ key, has: placeholders(ko.messages[key]) }).toEqual({
        key,
        has: placeholders(en.messages[key]),
      });
    }
  });
});

describe('the preferences screen', () => {
  async function open() {
    renderApp();
    fireEvent.press(await screen.findByTestId('open-preferences'));
    return screen.findByTestId('preferences-screen');
  }

  it('offers light, dark and following the phone', async () => {
    await open();
    expect(screen.getByTestId('appearance-light')).toBeOnTheScreen();
    expect(screen.getByTestId('appearance-dark')).toBeOnTheScreen();
    expect(screen.getByTestId('appearance-system')).toBeOnTheScreen();
  });

  it('translates the wallet list’s sentences but not its proper nouns', () => {
    /*
     * "Copy a connection link" is a sentence and was sitting in `WALLET_NAMES`
     * among Xverse, Leather and OKX, which are names — so it shipped
     * untranslated. Names stay put; sentences moved to the catalogue.
     */
    expect(ko.messages['wallet.copyLink']).not.toBe(en.messages['wallet.copyLink']);
    expect(Object.values(WALLET_NAMES)).toEqual(['Xverse', 'Leather', 'OKX Wallet']);
  });

  it('offers both languages, each named in itself', async () => {
    await open();
    // Never translated: somebody who cannot read the current language has to
    // be able to find their way out.
    expect(screen.getByText('English')).toBeOnTheScreen();
    expect(screen.getByText('한국어')).toBeOnTheScreen();
  });

  it('changes the language of the app, not only of this screen', async () => {
    await open();
    fireEvent.press(screen.getByTestId('language-ko'));

    await waitFor(() =>
      expect(screen.getByTestId('prefs-language')).toHaveTextContent(
        new RegExp(ko.messages['prefs.language']),
      ),
    );

    fireEvent.press(screen.getByLabelText(ko.messages['prefs.about.data']));
    expect(await screen.findByTestId('data-status-screen')).toBeOnTheScreen();
    expect(screen.getByText(ko.messages['data.title'])).toBeOnTheScreen();
  });

  it('writes both to the device, so they survive a restart', async () => {
    await open();
    fireEvent.press(screen.getByTestId('language-ko'));
    fireEvent.press(screen.getByTestId('appearance-light'));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem('signer-guide:locale:v1')).toBe('ko');
      expect(await AsyncStorage.getItem('signer-guide:appearance:v1')).toBe(
        'light',
      );
    });
  });

  it('says which address the app is looking at, without being a second place to change it', async () => {
    staking();
    renderApp();
    await connectWallet(screen, fireEvent);
    fireEvent.press(await screen.findByTestId('open-preferences'));

    expect(await screen.findByTestId('prefs-wallet-value')).toHaveTextContent(
      new RegExp(MOCK_ADDRESS.slice(0, 10)),
    );
    // The button goes to the wallet screen rather than offering a second set
    // of connect buttons here.
    fireEvent.press(screen.getByTestId('prefs-wallet-open'));
    expect(await screen.findByTestId('wallet-screen')).toBeOnTheScreen();
  });

  it('says so plainly when nothing is connected', async () => {
    await open();
    expect(screen.getByTestId('prefs-wallet-value')).toHaveTextContent(
      en.messages['prefs.wallet.none'],
    );
  });
});

describe('the palettes', () => {
  it('answer every role, so a palette cannot half-exist', () => {
    expect(Object.keys(PALETTES.light).sort()).toEqual(
      Object.keys(PALETTES.dark).sort(),
    );
  });

  it('are not each other', () => {
    expect(PALETTES.light.bg).not.toBe(PALETTES.dark.bg);
    expect(PALETTES.light.text).not.toBe(PALETTES.dark.text);
  });

  it('darken the accent for light, because it is body text as well as a figure', () => {
    // #F7931A is legible as a 44-point number on white and not as 13-point
    // body text on white, and this app puts the accent colour on both.
    expect(PALETTES.light.accent).not.toBe(PALETTES.dark.accent);
    expect(luminance(PALETTES.light.accent)).toBeLessThan(
      luminance(PALETTES.dark.accent),
    );
  });

  it('tell the status bar which way round it is', () => {
    expect(PALETTES.dark.statusBar).toBe('light');
    expect(PALETTES.light.statusBar).toBe('dark');
  });
});

/** Rough relative luminance — enough to say "darker than". */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
