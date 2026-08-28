import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
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

/**
 * The status bar has to be inside the provider to know which palette is on,
 * and nothing is drawn until the type has loaded.
 *
 * The guide's letterforms are rounded, and Android has no rounded system face
 * — so Nunito ships with the app. Drawing a frame in the system font first
 * would reflow every screen the moment the real one arrived, which is worse
 * than the frame of nothing that `Navigation` already renders while it reads
 * the welcome flag.
 */
function Chrome() {
  const { colors } = useSettings();
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  return (
    <>
      <StatusBar style={colors.statusBar} />
      {fontsLoaded ? <Navigation /> : null}
    </>
  );
}
