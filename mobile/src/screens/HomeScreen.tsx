import { RefreshControl, View } from 'react-native';
import { readRate } from '../data/rate';
import { useSnapshot } from '../data/snapshot';
import { useChainView } from '../stacks/position';
import { useWallet } from '../wallet/context';
import { utcLabel } from '../format';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { space } from '../theme';
import {
  Button,
  Card,
  Label,
  Loading,
  Note,
  Row,
  Screen,
  Section,
  Text,
} from '../ui';
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
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ gap: space.xs, flexShrink: 1 }}>
          <Text variant='title' accessibilityRole='header'>
            {t('home.title')}
          </Text>
          <Text variant='small' tone='faint'>
            {t('home.tagline')}
          </Text>
        </View>
        <Button
          title='⚙'
          kind='quiet'
          onPress={() => navigation.navigate('Preferences')}
          testID='open-preferences'
          style={{ minHeight: 40, paddingHorizontal: space.sm }}
        />
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
          <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
            <Label>{t('home.notStaking.label')}</Label>
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

      <Section title={t('home.more.title')} testID='more-section'>
        <Card>
          <MoreRow
            title={t('home.more.contracts')}
            hint={t('home.more.contractsHint')}
            action={t('common.open')}
            onPress={() => navigation.navigate('ChooseContract')}
            testID='more-contracts'
          />
          <MoreRow
            title={t('home.more.pools')}
            hint={t('home.more.poolsHint', {
              count: snapshot.signers.signers.length,
            })}
            action={t('common.open')}
            onPress={() => navigation.navigate('Pools')}
            testID='more-pools'
          />
          <MoreRow
            title={t('home.more.history')}
            hint={t('home.more.historyHint')}
            action={t('common.open')}
            onPress={() => navigation.navigate('History')}
            testID='more-history'
          />
          <MoreRow
            title={t('home.more.data')}
            hint={
              stale
                ? t('home.more.dataStale')
                : t('home.more.dataUpdated', {
                    when: utcLabel(snapshot.signers.generatedAt, locale),
                  })
            }
            action={t('common.open')}
            onPress={() => navigation.navigate('DataStatus')}
            testID='more-data'
          />
        </Card>
      </Section>
    </Screen>
  );
}

/** "SP1N8F…4YDR", or the same with a word saying it cannot sign. */
function shortLabel(address: string, canSign: boolean, watching: string): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return canSign ? short : `${short} · ${watching}`;
}

function MoreRow({
  title,
  hint,
  action,
  onPress,
  testID,
}: {
  title: string;
  hint: string;
  action: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
      <View style={{ flexShrink: 1 }}>
        <Text variant='body'>{title}</Text>
        <Text variant='small' tone='faint'>
          {hint}
        </Text>
      </View>
      <Button title={action} kind='quiet' onPress={onPress} testID={testID} />
    </Row>
  );
}
