import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useOnboarding } from './data/onboarding';
import { useT } from './i18n';
import { useSettings } from './settings';
import ChooseContractScreen from './screens/ChooseContractScreen';
import ContractScreen from './screens/ContractScreen';
import DataStatusScreen from './screens/DataStatusScreen';
import GroupScreen from './screens/GroupScreen';
import GroupsScreen from './screens/GroupsScreen';
import HistoryScreen from './screens/HistoryScreen';
import HomeScreen from './screens/HomeScreen';
import PoolScreen from './screens/PoolScreen';
import PoolsScreen from './screens/PoolsScreen';
import PreferencesScreen from './screens/PreferencesScreen';
import SentScreen from './screens/SentScreen';
import StakeScreen from './screens/StakeScreen';
import StartScreen from './screens/StartScreen';
import WalletScreen from './screens/WalletScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import type { RootStackParamList } from './navigation-types';

/**
 * One stack, and no tab bar.
 *
 * A tab bar would put "everything else the guide knows" beside "your stake" at
 * equal weight, and they are not of equal weight: one is checked twice a week
 * and the other is read once. So the rest of the guide is a section at the
 * bottom of the first screen — one tap away from anywhere, and never
 * competing with the number somebody opened the app for.
 */
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { seen } = useOnboarding();
  const { colors, scheme } = useSettings();
  const t = useT();

  /*
   * Nothing is drawn until the device has been asked whether it has seen the
   * welcome. It is one read of local storage and it is over in a frame; the
   * alternative is showing the home screen and then replacing it, which is
   * worse than a frame of nothing.
   */
  if (seen === null) return null;

  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        initialRouteName={seen ? 'Home' : 'Welcome'}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 16, fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name='Welcome'
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name='Home'
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name='Start'
          component={StartScreen}
          options={{ title: t('start.title') }}
        />
        <Stack.Screen
          name='Wallet'
          component={WalletScreen}
          options={{ title: t('wallet.title') }}
        />
        <Stack.Screen
          name='Preferences'
          component={PreferencesScreen}
          options={{ title: t('prefs.title') }}
        />
        <Stack.Screen
          name='ChooseContract'
          component={ChooseContractScreen}
          options={{ title: t('home.more.contracts') }}
        />
        <Stack.Screen
          name='Contract'
          component={ContractScreen}
          options={{ title: t('pool.contractId') }}
        />
        <Stack.Screen
          name='Pool'
          component={PoolScreen}
          options={{ title: t('prefs.wallet') }}
        />
        <Stack.Screen
          name='Stake'
          component={StakeScreen}
          options={{ title: t('stake.stakeWith') }}
        />
        <Stack.Screen
          name='Sent'
          component={SentScreen}
          options={{ title: t('sent.transaction'), headerBackVisible: false }}
        />
        <Stack.Screen
          name='Pools'
          component={PoolsScreen}
          options={{ title: t('pools.title') }}
        />
        <Stack.Screen
          name='Groups'
          component={GroupsScreen}
          options={{ title: t('groups.title') }}
        />
        <Stack.Screen
          name='Group'
          component={GroupScreen}
          options={{ title: t('groups.one') }}
        />
        <Stack.Screen
          name='History'
          component={HistoryScreen}
          options={{ title: t('history.title') }}
        />
        <Stack.Screen
          name='DataStatus'
          component={DataStatusScreen}
          options={{ title: t('data.title') }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
