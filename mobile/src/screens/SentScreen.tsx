import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { explorerUrl } from '@guide/lib/explorer';
import { watchTxStatus, type TxStatus } from '@guide/lib/tx-status';
import { poolName, signerFor } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { STACKS_API_URL } from '../stacks/api';
import { shortAddress } from '../format';
import { useT } from '../i18n';
import { space } from '../theme';
import { Button, Card, Label, Loading, Note, Pill, Row, Screen, Text } from '../ui';
import type { ScreenProps } from '../navigation-types';

/**
 * After the wallet has broadcast.
 *
 * The transaction is followed over the API's socket rather than polled, so
 * this says "confirmed" when it confirms rather than up to an interval later.
 * Until then it says pending and means it — a broadcast is not a stake, and a
 * screen that congratulated somebody at broadcast would be wrong about a third
 * of a percent of the time, on the occasions that matter most.
 */
export default function SentScreen({ route, navigation }: ScreenProps<'Sent'>) {
  const { txid, contractId, kind } = route.params;
  const { snapshot } = useSnapshot();
  const t = useT();
  const [status, setStatus] = useState<TxStatus>('pending');
  const { name } = poolName(signerFor(snapshot, contractId), contractId);

  useEffect(
    () => watchTxStatus({ txid, apiUrl: STACKS_API_URL, onStatus: setStatus }),
    [txid],
  );

  return (
    <Screen testID='sent-screen'>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>{kind === 'unstake' ? t('sent.unstake') : t('sent.stake')}</Label>
          <Pill
            tone={status === 'success' ? 'good' : status === 'failed' ? 'bad' : 'warn'}
            testID='sent-status'
          >
            {status === 'success'
              ? t('sent.confirmed')
              : status === 'failed'
                ? t('sent.failed')
                : t('sent.pending')}
          </Pill>
        </Row>

        <Text variant='title' testID='sent-headline'>
          {status === 'success'
            ? kind === 'unstake'
              ? t('sent.headlineUnstaked')
              : t('sent.headlineStaked', { pool: name })
            : status === 'failed'
              ? t('sent.headlineFailed')
              : t('sent.headlinePending')}
        </Text>

        {status === 'pending' ? <Loading label={t('sent.watching')} /> : null}

        <Note tone='faint'>
          {status === 'pending'
            ? t('sent.notePending')
            : status === 'failed'
              ? t('sent.noteFailed')
              : t('sent.noteConfirmed')}
        </Note>

        <View style={{ gap: space.sm }}>
          <Label>{t('sent.transaction')}</Label>
          <Text variant='mono' tone='muted' testID='sent-txid'>
            {shortAddress(txid, 12, 10)}
          </Text>
          <Row gap={space.sm}>
            <Button
              title={t('sent.copyId')}
              kind='secondary'
              style={{ flexGrow: 1 }}
              onPress={() => void Clipboard.setStringAsync(txid)}
            />
            <Button
              title={t('sent.explorer')}
              kind='secondary'
              style={{ flexGrow: 1 }}
              testID='sent-explorer'
              onPress={() => void Linking.openURL(explorerUrl(txid))}
            />
          </Row>
        </View>
      </Card>

      <Button
        title={t('sent.backHome')}
        testID='sent-done'
        onPress={() => navigation.navigate('Home')}
      />
    </Screen>
  );
}
