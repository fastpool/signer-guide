import { View } from 'react-native';
import type { Template } from '../data/signers';
import { useT } from '../i18n';
import { space } from '../theme';
import { Row, Text } from '../ui';

/**
 * What a contract does for the person staking with it.
 *
 * Read off the group rather than off each pool: pools sharing a group hash
 * share the code, and so share the answers. Anything the detector could not
 * establish is shown as not established — a contract with no fee cap is a
 * different thing from one whose cap we could not find, and both are different
 * from a cap of zero.
 */
export default function FeatureList({
  template,
  testID,
}: {
  template: Template;
  testID?: string;
}) {
  const t = useT();
  return (
    <View style={{ gap: space.xs }} testID={testID}>
      <Line
        good={template.bitcoinRewards}
        text={
          template.bitcoinRewards ? t('feature.bitcoinYes') : t('feature.bitcoinNo')
        }
      />
      <Line
        good={template.openToAnyone}
        text={template.openToAnyone ? t('feature.openYes') : t('feature.openNo')}
      />
      {template.maxFeeBips === null ? (
        <Line good={null} text={t('feature.feeUncapped')} />
      ) : (
        <Line
          good
          text={t('feature.feeCapped', {
            percent: (template.maxFeeBips / 100).toFixed(2),
          })}
        />
      )}
      {template.feeChangeNotice ? <Line good text={t('feature.feeNotice')} /> : null}
      {template.feeExemption ? <Line good text={t('feature.feeExemption')} /> : null}
    </View>
  );
}

function Line({ good, text }: { good: boolean | null; text: string }) {
  if (!text) return null;
  return (
    <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
      <Text variant='small' tone={good === null ? 'warn' : good ? 'good' : 'muted'}>
        {good === null ? '!' : good ? '✓' : '·'}
      </Text>
      <Text variant='small' tone='muted' style={{ flexShrink: 1, lineHeight: 19 }}>
        {text}
      </Text>
    </Row>
  );
}
