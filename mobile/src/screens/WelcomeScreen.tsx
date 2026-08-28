import { StyleSheet, View } from 'react-native';
import { readRate } from '../data/rate';
import { useSnapshot } from '../data/snapshot';
import { useOnboarding } from '../data/onboarding';
import { percent } from '../format';
import { useT } from '../i18n';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../settings';
import { fonts, radius, space } from '../theme';
import { Button, Row, Text } from '../ui';
import Mark from '../components/Mark';
import type { ScreenProps } from '../navigation-types';

/**
 * The first screen somebody sees, once.
 *
 * Three sentences and a number. Everything a first-time staker actually has to
 * believe before they will do this is here — what it does with their STX, what
 * comes back, and that it can be undone — and everything else waits until they
 * have asked for it.
 *
 * What is deliberately not here: the words pox-5, signer manager, reward cycle,
 * calldata, post condition. All of them are true and all of them are in this
 * app, two taps away. None of them belongs between somebody and their first
 * stake.
 */
export default function WelcomeScreen({ navigation }: ScreenProps<'Welcome'>) {
  const { snapshot } = useSnapshot();
  const { markSeen } = useOnboarding();
  const colors = useColors();
  const t = useT();
  const rate = readRate(snapshot.stxOnlyCalculations);

  /*
   * Home goes underneath either way, so back from the staking screen lands on
   * the guide rather than out of the app. `replace` alone left `Start` as the
   * only screen on the stack, which made the back gesture quit — the worst
   * possible answer for somebody who pressed it to reconsider.
   */
  const go = (to: 'Start' | 'Home') => {
    markSeen();
    navigation.reset(
      to === 'Home'
        ? { index: 0, routes: [{ name: 'Home' }] }
        : { index: 1, routes: [{ name: 'Home' }, { name: 'Start' }] },
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} testID='welcome-screen'>
      {/*
        A grape band, the steps, and a pinned footer — three bands rather than
        a scroll, so the whole argument for staking is on one screen and the
        button that acts on it is never below the fold.
      */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.stx }}>
        <View style={styles.band}>
          <Row gap={space.md}>
            <Mark size={26} onGrape />
            <Text style={[styles.eyebrow, { color: 'rgba(255,255,255,0.85)' }]}>
              {t('welcome.eyebrow')}
            </Text>
          </Row>

          <Text style={styles.headline}>{t('welcome.headline')}</Text>

          <View style={{ gap: 4 }}>
            <Text style={[styles.eyebrow, { color: 'rgba(255,255,255,0.65)' }]}>
              {t('welcome.earning').toUpperCase()}
            </Text>
            <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
              <Text style={styles.apy} testID='welcome-rate-value'>
                {rate.apy === null ? '—' : percent(rate.apy, 1)}
              </Text>
              <Text style={styles.apyUnit}>{t('welcome.aYear')}</Text>
            </Row>
            <Text style={styles.bandNote}>{t('welcome.rateNote')}</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.steps}>
        <Step n='1' title={t('welcome.step1.title')} body={t('welcome.step1.body')} />
        <Step n='2' title={t('welcome.step2.title')} body={t('welcome.step2.body')} />
        <Step n='3' title={t('welcome.step3.title')} body={t('welcome.step3.body')} />
      </View>

      <SafeAreaView edges={['bottom']}>
        <View style={styles.footer}>
          <Button
            title={t('welcome.start')}
            testID='welcome-start'
            onPress={() => go('Start')}
          />
          <Button
            title={t('welcome.skip')}
            kind='quiet'
            testID='welcome-skip'
            onPress={() => go('Home')}
            style={{ minHeight: 44 }}
          />
          <Text style={[styles.wallets, { color: colors.faint }]}>
            {t('welcome.wallets')}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  const colors = useColors();
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={[styles.numeral, { backgroundColor: colors.grapeSoft }]}>
        <Text style={[styles.numeralText, { color: colors.stx }]}>{n}</Text>
      </View>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text variant='heading'>{title}</Text>
        <Text variant='small' tone='muted' style={{ fontSize: 12.5, lineHeight: 18 }}>
          {body}
        </Text>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  band: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 20, gap: 15 },
  eyebrow: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 0.9 },
  headline: {
    fontSize: 34,
    fontFamily: fonts.extrabold,
    letterSpacing: -1.1,
    lineHeight: 36,
    color: '#ffffff',
  },
  /*
   * Amber lightened for grape. A display-only tint rather than a palette role:
   * nothing else in the app puts a figure on a grape ground, and adding a role
   * for one use would be a role the next palette has to answer for.
   */
  apy: { fontSize: 46, fontFamily: fonts.extrabold, letterSpacing: -1.8, color: '#f2c891' },
  apyUnit: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: 'rgba(255,255,255,0.8)',
    paddingBottom: 7,
  },
  bandNote: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.75)' },
  steps: { flex: 1, paddingHorizontal: 22, paddingTop: 18, gap: 14 },
  numeral: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeralText: { fontSize: 12.5, fontFamily: fonts.extrabold },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 22, gap: 9 },
  wallets: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
