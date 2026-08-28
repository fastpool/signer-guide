/*
 * Polyfills first, and in this order.
 *
 * `react-native-get-random-values` installs `crypto.getRandomValues`, which
 * the WalletConnect stack and the Stacks packages both reach for and React
 * Native does not provide. `@walletconnect/react-native-compat` wants it
 * already there when it loads, so it comes second — and it has to come before
 * anything that imports a WalletConnect package, which is why both are here
 * rather than beside the code that needs them.
 */
import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
