/*
 * The device APIs the app touches, stubbed once.
 *
 * Only the ones with no JS implementation off a device. Everything else — the
 * navigation, the forms, the staking arithmetic — runs for real in these
 * tests, which is the point of them: a test that mocks the thing it is
 * testing proves the mock works.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { walletConnectProjectId: 'test-project' } } },
}));

/*
 * `react-native-svg` renders through native views. The identicon's own rules —
 * which seed draws, and what a missing hash means — are the part worth
 * testing, and they are decided before this is reached.
 */
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  /*
   * Every element the app draws with, stood in for by a plain view. What the
   * drawings decide — which seed an identicon uses, what a missing hash means
   * — is settled before this is reached; what is left is geometry, which a
   * test renderer cannot see anyway.
   */
  const stub =
    (name: string) =>
    (props: Record<string, unknown>) =>
      React.createElement(View, {
        ...props,
        testID: props.testID ?? name,
        children: props.children,
      });
  return {
    __esModule: true,
    default: stub('svg'),
    Svg: stub('svg'),
    SvgXml: stub('svg-xml'),
    Circle: stub('svg-circle'),
    Rect: stub('svg-rect'),
    Path: stub('svg-path'),
    G: stub('svg-g'),
    Defs: stub('svg-defs'),
    LinearGradient: stub('svg-linear-gradient'),
    Stop: stub('svg-stop'),
  };
});

// Quieter output: the animation warnings from the navigator say nothing about
// the code under test.
jest.spyOn(console, 'warn').mockImplementation(() => {});

/*
 * A fresh device for every test.
 *
 * The app remembers the address it was last shown, on purpose — somebody who
 * watched an address yesterday means to watch it today. Inside one test file
 * that memory carries between tests, so the second one starts already
 * connected and proves nothing about connecting.
 */
beforeEach(async () => {
  const store = require('@react-native-async-storage/async-storage');
  const AsyncStorage = store.default ?? store;
  await AsyncStorage.clear();
  /*
   * Past the welcome by default. It is shown once per device, so leaving it on
   * would put it in front of every test of every other screen — and the suite
   * that is actually about it clears this again in its own `beforeEach`, which
   * runs after this one.
   */
  await AsyncStorage.setItem('signer-guide:seen-welcome:v1', '1');
});
