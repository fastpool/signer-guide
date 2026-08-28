import { Linking, View } from 'react-native';
import { satsLabel } from '@guide/lib/amounts';
import { readRate } from '../data/rate';
import { DATA_BASE_URL, useSnapshot } from '../data/snapshot';
import { STACKS_API_URL } from '../stacks/api';
import { projectId } from '../wallet/walletconnect';
import { mockWalletEnabled } from '../wallet/mock';
import { groupDigits, stxShort, utcLabel } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Field,
  Label,
  Note,
  Pill,
  Row,
  Screen,
  Section,
  Text,
} from '../ui';
import type { ScreenProps } from '../navigation-types';

/**
 * Where every number on the other screens came from.
 *
 * An installed app holds whatever build it last downloaded, so "how old is
 * this" is a real question with a real answer, and it is answered here rather
 * than implied by a timestamp in a corner. The rate in particular is a
 * derived figure with a stated method, and somebody acting on it is owed the
 * method.
 */
export default function DataStatusScreen(_: ScreenProps<'DataStatus'>) {
  const { snapshot, refreshing, stale, refresh } = useSnapshot();
  const { locale } = useSettings();
  const t = useT();
  const rate = readRate(snapshot.stxOnlyCalculations);
  const calc = snapshot.stxOnlyCalculations;

  return (
    <Screen testID='data-status-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header'>
          {t('data.title')}
        </Text>
        <Note>{t('data.intro')}</Note>
      </View>

      <Card testID='data-origin'>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>{t('data.poolData')}</Label>
          <Pill tone={stale ? 'warn' : 'good'} testID='data-origin-pill'>
            {snapshot.origin}
          </Pill>
        </Row>
        <Text variant='body'>{t(`data.origin.${snapshot.origin}` as const)}</Text>
        <Field
          label={t('data.generated')}
          value={utcLabel(snapshot.signers.generatedAt, locale)}
        />
        {snapshot.fetchedAt ? (
          <Field
            label={t('data.downloaded')}
            value={utcLabel(new Date(snapshot.fetchedAt).toISOString(), locale)}
          />
        ) : null}
        {stale ? <Note tone='warn'>{t('data.stale')}</Note> : null}
        <Button
          title={t('data.refresh')}
          kind='secondary'
          busy={refreshing}
          onPress={refresh}
          testID='data-refresh'
        />
      </Card>

      <Section title={t('data.howRate')}>
        <Card>
          <Note>
            {t('data.howRateBody', { blocks: calc.distributionBlocks })}
          </Note>
          <Divider />
          <Row gap={space.xl} wrap>
            <Field
              label={t('data.totalStaked')}
              value={stxShort(rate.totalStakedUstx, locale)}
            />
            <Field
              label={t('data.stxPrice')}
              value={satsLabel(rate.stxPriceSats, locale)}
            />
            <Field
              label={t('data.burnHeight')}
              value={
                calc.currentBurnHeight === null
                  ? t('common.notKnown')
                  : groupDigits(calc.currentBurnHeight)
              }
            />
          </Row>
        </Card>
      </Section>

      <Section title={t('data.talksTo')}>
        <Card>
          <Field label={t('data.poolData')} value={DATA_BASE_URL} />
          <Divider />
          <Field label={t('data.stacksNode')} value={STACKS_API_URL} />
          <Divider />
          <Field
            label={t('data.wallets')}
            value={
              mockWalletEnabled()
                ? t('data.walletsMock')
                : projectId()
                  ? t('data.walletsReal')
                  : t('data.walletsNone')
            }
            hint={
              mockWalletEnabled()
                ? t('data.walletsMockHint')
                : t('data.walletsRealHint')
            }
          />
        </Card>
      </Section>

      <Button
        title={t('data.openWeb')}
        kind='quiet'
        onPress={() => void Linking.openURL('https://signer-guide.fastpool.org')}
      />
      <Note tone='faint'>{t('data.madeBy')}</Note>
    </Screen>
  );
}
