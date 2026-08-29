import { View } from 'react-native';
import { bitcoinPayout } from '@guide/lib/features';
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
  const btc = bitcoinPayout(template);
  return (
    <View style={{ gap: space.xs }} testID={testID}>
      {/*
        Three answers, not two. A contract that only records the address and
        pays nowhere near it is neither "pays to Bitcoin" nor "cannot" — the
        pool can read what it recorded and pay from it, and that is the pool's
        word rather than the contract's, so it is shown as neither good nor bad.
      */}
      <Line
        good={btc === 'contract' ? true : btc === 'pool' ? null : false}
        text={t(
          btc === 'contract'
            ? 'feature.bitcoinYes'
            : btc === 'pool'
              ? 'feature.bitcoinViaPool'
              : 'feature.bitcoinNo',
        )}
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
