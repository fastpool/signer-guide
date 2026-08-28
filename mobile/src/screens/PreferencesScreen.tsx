import { Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { LOCALES, languageName, useT } from '../i18n';
import { useSettings, type Appearance } from '../settings';
import { shortAddress } from '../format';
import { space } from '../theme';
import { Button, Card, Choice, Field, Note, Row, Screen, Section } from '../ui';
import { useWallet } from '../wallet/context';
import { walletLabel } from '../wallet/labels';
import type { ScreenProps } from '../navigation-types';

/**
 * The three things a reader is allowed to decide, and nothing else.
 *
 * There is no notifications row, no currency row and no "advanced" section,
 * because this app has nothing to put in them: it sends no notifications, it
 * quotes in sats because that is what pox-5 pays, and everything an advanced
 * reader might want to change is an environment variable at build time and is
 * written down in the README rather than hidden behind a switch here.
 *
 * The wallet row is first because it is the one somebody comes here to check
 * — appearance and language are set once and then left alone. It is a
 * shortcut, not a second place to change it: connecting and watching live on
 * one screen, and this points at that screen and shows what it currently
 * says, so that "which address am I looking at" is answerable from settings
 * without being answerable in two places.
 */
const APPEARANCES: Appearance[] = ['light', 'dark', 'system'];

export default function PreferencesScreen({
  navigation,
}: ScreenProps<'Preferences'>) {
  const t = useT();
  const { appearance, setAppearance, locale, setLocale } = useSettings();
  const wallet = useWallet();

  return (
    <Screen testID='preferences-screen'>
      <Section title={t('prefs.wallet')} testID='prefs-wallet'>
        <Card>
          <Field
            /*
             * "Connected" or "Watching" — never "Wallet", which is what the
             * heading above it already says. A label that repeats its own
             * section says nothing and takes a line to say it.
             */
            label={
              wallet.account
                ? wallet.canSign
                  ? t('wallet.connected')
                  : t('wallet.watching')
                : t('prefs.wallet.nothing')
            }
            testID='prefs-wallet-value'
            value={
              wallet.account
                ? shortAddress(wallet.account.stxAddress, 10, 8)
                : t('prefs.wallet.none')
            }
            hint={
              wallet.account && wallet.canSign
                ? walletLabel(wallet.account.walletId, t)
                : undefined
            }
          />
          <Button
            title={t('prefs.wallet.manage')}
            kind='secondary'
            onPress={() => navigation.navigate('Wallet')}
            testID='prefs-wallet-open'
          />
        </Card>
      </Section>

      <Section title={t('prefs.appearance')} testID='prefs-appearance'>
        <Card>
          <Row gap={space.sm} wrap>
            {APPEARANCES.map((option) => (
              <Choice
                key={option}
                label={t(`prefs.appearance.${option}` as const)}
                selected={appearance === option}
                onPress={() => setAppearance(option)}
                testID={`appearance-${option}`}
                style={{ flexGrow: 1 }}
              />
            ))}
          </Row>
          <Note tone='faint'>{t('prefs.appearance.hint')}</Note>
        </Card>
      </Section>

      <Section title={t('prefs.language')} testID='prefs-language'>
        <Card>
          <Row gap={space.sm} wrap>
            {LOCALES.map((option) => (
              <Choice
                key={option}
                // Never translated: a language is named in itself, or somebody
                // who cannot read the current one cannot find their way out.
                label={languageName(option)}
                selected={locale === option}
                onPress={() => setLocale(option)}
                testID={`language-${option}`}
                style={{ flexGrow: 1 }}
              />
            ))}
          </Row>
          <Note tone='faint'>{t('prefs.language.hint')}</Note>
        </Card>
      </Section>

      <Section title={t('prefs.about')} testID='prefs-about'>
        <Card>
          <Button
            title={t('prefs.about.data')}
            kind='secondary'
            onPress={() => navigation.navigate('DataStatus')}
            testID='prefs-data'
          />
          <Button
            title={t('prefs.about.source')}
            kind='quiet'
            onPress={() =>
              void Linking.openURL('https://github.com/fastpool/signer-guide')
            }
            testID='prefs-source'
          />
          <View>
            <Note tone='faint'>
              {t('prefs.version', {
                version: Constants.expoConfig?.version ?? '—',
              })}
            </Note>
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
