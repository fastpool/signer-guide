import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { readRate } from '../data/rate';
import { useSnapshot } from '../data/snapshot';
import { useChainView } from '../stacks/position';
import { useWallet } from '../wallet/context';
import { utcLabel } from '../format';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { fonts, radius, space } from '../theme';
import {
  Button,
  Card,
  Label,
  ListRow,
  Loading,
  Note,
  Row,
  Screen,
  Text,
} from '../ui';
import Mark, { GearGlyph } from '../components/Mark';
import PositionCard from '../components/PositionCard';
import RateCard from '../components/RateCard';
import type { ScreenProps } from '../navigation-types';

/**
 * The screen the app opens on, and the only one most people will look at.
 *
 * Two things are on it above everything else: what a staked STX is currently
 * earning, and what this person has staked. Everything else the guide knows —
 * forty-five pools, six contracts, the history of every payout — is a tap
 * away under "the rest of the guide" at the bottom, and deliberately not here.
 *
 * The address is inside the stake card rather than in one of its own. It is
 * the answer to "whose stake is this", which only matters when it is the wrong
 * one, so it is small, quiet, and doubles as the way to the wallet screen.
 */
export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const { snapshot, refreshing, stale, refresh } = useSnapshot();
  const { locale } = useSettings();
  const colors = useColors();
  const t = useT();
  const wallet = useWallet();
  const address = wallet.account?.stxAddress ?? null;
  const chain = useChainView(address);

  const rate = readRate(snapshot.stxOnlyCalculations);

  return (
    <Screen
      testID='home-screen'
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            refresh();
            chain.reload();
          }}
          tintColor={colors.muted}
        />
      }
    >
      <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
        <Row gap={space.md} style={{ flexShrink: 1 }}>
          <Mark size={30} />
          <View style={{ flexShrink: 1, gap: 1 }}>
            <Text accessibilityRole='header' style={styles.wordmark}>
              {t('home.title')}
            </Text>
            <Text variant='small' tone='muted' numberOfLines={1}>
              {t('home.tagline')}
            </Text>
          </View>
        </Row>
        {/*
          A 44×44 card rather than a text button: `⚙` in a text run is not a
          hit target, and this is the only way to the preferences.
        */}
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={t('prefs.title')}
          onPress={() => navigation.navigate('Preferences')}
          testID='open-preferences'
          style={({ pressed }) => [
            styles.gear,
            { backgroundColor: colors.card },
            pressed && { opacity: 0.6 },
          ]}
        >
          <GearGlyph />
        </Pressable>
      </Row>

      <RateCard rate={rate} onPress={() => navigation.navigate('History')} />

      {!address ? (
        <Card testID='not-connected'>
          <Label>{t('home.connect.label')}</Label>
          <Text variant='title'>{t('home.connect.title')}</Text>
          <Note>{t('home.connect.body')}</Note>
          <Button
            title={t('home.connect.button')}
            onPress={() => navigation.navigate('Wallet')}
            testID='home-connect'
          />
          <Button
            title={t('home.connect.watch')}
            kind='quiet'
            onPress={() => navigation.navigate('Wallet')}
            testID='home-watch'
          />
        </Card>
      ) : chain.loading && chain.position === null ? (
        <Card testID='position-loading'>
          <Loading label={t('home.loadingPosition')} />
        </Card>
      ) : chain.position ? (
        <PositionCard
          position={chain.position}
          snapshot={snapshot}
          rate={rate}
          currentCycle={chain.cycle?.rewardCycleId ?? null}
          address={address}
          canSign={wallet.canSign}
          onOpenWallet={() => navigation.navigate('Wallet')}
          onChange={
            wallet.canSign
              ? () =>
                  navigation.navigate('Stake', {
                    contractId: chain.position!.signer,
                  })
              : undefined
          }
          onViewPool={() =>
            navigation.navigate('Pool', { contractId: chain.position!.signer })
          }
        />
      ) : (
        <Card testID='not-staking'>
          {/*
            The label and the address, one on each end — and on the next line
            down rather than off the right edge of the card, once the system
            font is large enough that the two cannot share a line.
          */}
          <Row style={{ justifyContent: 'space-between' }} gap={space.sm} wrap>
            <View style={{ flexShrink: 1 }}>
              <Label>{t('home.notStaking.label')}</Label>
            </View>
            <Button
              title={shortLabel(address, wallet.canSign, t('wallet.watching'))}
              kind='quiet'
              onPress={() => navigation.navigate('Wallet')}
              testID='home-wallet'
              style={{ minHeight: 24, paddingHorizontal: 0 }}
            />
          </Row>
          <Text variant='title'>{t('home.notStaking.title')}</Text>
          <Note>{t('home.notStaking.body')}</Note>
          <Button
            title={t('home.notStaking.start')}
            onPress={() => navigation.navigate('Start')}
            testID='start-staking'
          />
          <Button
            title={t('home.notStaking.chooseYourself')}
            kind='quiet'
            onPress={() => navigation.navigate('ChooseContract')}
            testID='choose-yourself'
          />
        </Card>
      )}

      {chain.error ? (
        <Card testID='chain-error'>
          <Label>{t('home.chainError')}</Label>
          <Text variant='small' tone='bad'>
            {chain.error}
          </Text>
          <Button
            title={t('common.tryAgain')}
            kind='secondary'
            onPress={chain.reload}
          />
        </Card>
      ) : null}

      {/*
        One card of hittable rows, not a column of quiet text buttons. The
        payout history is not among them: the rate card's own footer link goes
        there, and two routes to one screen on one screen is one too many.
      */}
      <Card testID='more-section' style={{ gap: 0 }}>
        <Label testID='more-title'>{t('home.more.title')}</Label>
        <ListRow
          first
          title={t('home.more.contracts')}
          hint={t('home.more.contractsHint')}
          onPress={() => navigation.navigate('ChooseContract')}
          testID='more-contracts'
        />
        <ListRow
          title={t('home.more.pools')}
          hint={t('home.more.poolsHint', {
            count: snapshot.signers.signers.length,
          })}
          onPress={() => navigation.navigate('Pools')}
          testID='more-pools'
        />
        <ListRow
          title={t('home.more.data')}
          hint={
            stale
              ? t('home.more.dataStale')
              : t('home.more.dataUpdated', {
                  when: utcLabel(snapshot.signers.generatedAt, locale),
                })
          }
          onPress={() => navigation.navigate('DataStatus')}
          testID='more-data'
        />
      </Card>
    </Screen>
  );
}

/** "SP1N8F…4YDR", or the same with a word saying it cannot sign. */
function shortLabel(address: string, canSign: boolean, watching: string): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return canSign ? short : `${short} · ${watching}`;
}

const styles = StyleSheet.create({
  wordmark: { fontSize: 19, fontFamily: fonts.extrabold, letterSpacing: -0.4 },
  gear: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
