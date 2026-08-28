import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SnapshotProvider } from './src/data/snapshot';
import { TranslationProvider } from './src/i18n';
import Navigation from './src/navigation';
import { SettingsProvider, useSettings } from './src/settings';
import { WalletProvider } from './src/wallet/context';

/**
 * Four providers over one stack, in the order they depend on each other.
 *
 * Settings first, because the palette and the language come out of it and
 * everything below renders in both. The snapshot is a provider rather than a
 * hook per screen because the saved copy is read asynchronously on a phone:
 * five screens each starting their own read would render five different
 * answers on the way to the same one.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <TranslationProvider>
          <SnapshotProvider>
            <WalletProvider>
              <Chrome />
            </WalletProvider>
          </SnapshotProvider>
        </TranslationProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

/** The status bar has to be inside the provider to know which palette is on. */
function Chrome() {
  const { colors } = useSettings();
  return (
    <>
      <StatusBar style={colors.statusBar} />
      <Navigation />
    </>
  );
}
