import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useT } from '../i18n';
import { useColors } from '../settings';
import { shortAddress } from '../format';
import { radius, space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Label,
  Loading,
  Note,
  Row,
  Screen,
  Section,
  Text,
} from '../ui';
import { useWallet } from '../wallet/context';
import { mockWalletEnabled } from '../wallet/mock';
import { isStacksAddress, type WalletId } from '../wallet/types';
import { WALLET_NAMES } from '../wallet/walletconnect';
import type { ScreenProps } from '../navigation-types';

/**
 * One screen for the whole question of who the app is looking at.
 *
 * It used to be a card wedged under the stake, which made it compete with the
 * stake for a reader who had already answered it — and there are two answers,
 * not one, which a card had no room to keep apart:
 *
 *   connected   a live wallet session; this address can sign
 *   watching    an address somebody typed; it can only be read
 *
 * The second is worth having and is not a lesser version of the first. It is
 * how somebody checks a position from a phone that does not hold the keys, and
 * on a phone with no wallet installed it is the only way in. So it is a
 * heading of its own here rather than a link at the bottom of a card.
 */
export default function WalletScreen({ navigation }: ScreenProps<'Wallet'>) {
  const t = useT();
  const colors = useColors();
  const wallet = useWallet();
  const [typed, setTyped] = useState('');

  /*
   * Connecting sends the person to another application and back. When they
   * return with a session, this screen has done its job and is in the way — so
   * it closes, and they are where they were when they asked for a wallet.
   *
   * Only for a connect started *here*: arriving with a wallet already
   * connected, to change it or to forget it, has to stay put.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && wallet.account && !wallet.connecting) {
      asked.current = false;
      navigation.goBack();
    }
  }, [wallet.account, wallet.connecting, navigation]);

  const wallets: WalletId[] = mockWalletEnabled()
    ? ['mock', 'xverse', 'leather', 'okx']
    : ['xverse', 'leather', 'okx', 'any'];

  return (
    <Screen testID='wallet-screen'>
      {wallet.account ? (
        <Card testID='wallet-account'>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <Label>
                {wallet.canSign ? t('wallet.connected') : t('wallet.watching')}
              </Label>
              <Text variant='heading' testID='wallet-address'>
                {shortAddress(wallet.account.stxAddress, 10, 8)}
              </Text>
            </View>
            <Button
              title={t('common.forget')}
              kind='quiet'
              onPress={() => void wallet.disconnect()}
              testID='wallet-forget'
            />
          </Row>
          <Note tone={wallet.canSign ? 'muted' : 'warn'}>
            {wallet.canSign
              ? t('wallet.canSign', {
                  wallet: WALLET_NAMES[wallet.account.walletId],
                })
              : t('wallet.readOnly')}
          </Note>
        </Card>
      ) : null}

      <Section title={t('wallet.connectHeading')} testID='wallet-connect'>
        <Card>
          <Note>{t('wallet.intro')}</Note>
          <View style={{ gap: space.sm }}>
            {wallets.map((id, index) => (
              <Button
                key={id}
                title={WALLET_NAMES[id]}
                kind={index === 0 ? 'primary' : 'secondary'}
                busy={wallet.connecting}
                onPress={() => {
                  asked.current = true;
                  void wallet.connect(id);
                }}
                testID={`connect-${id}`}
              />
            ))}
          </View>
          {wallet.connecting ? <Loading label={t('wallet.connecting')} /> : null}
          {wallet.error ? (
            <Text variant='small' tone='bad' testID='wallet-error'>
              {wallet.error}
            </Text>
          ) : null}
          <Note tone='faint'>{t('wallet.notInstalled')}</Note>
        </Card>
      </Section>

      <Section title={t('wallet.watchHeading')} testID='wallet-watch'>
        <Card>
          <Note>{t('wallet.watchBody')}</Note>
          <Divider />
          <Label>{t('wallet.addressLabel')}</Label>
          <TextInput
            testID='watch-input'
            value={typed}
            onChangeText={setTyped}
            autoCapitalize='characters'
            autoCorrect={false}
            placeholder='SP…'
            placeholderTextColor={colors.faint}
            style={[
              styles.input,
              {
                backgroundColor: colors.cardRaised,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
          <Button
            title={t('wallet.watchSubmit')}
            kind='secondary'
            disabled={!isStacksAddress(typed.trim())}
            onPress={() => {
              void wallet.watch(typed);
              navigation.goBack();
            }}
            testID='watch-submit'
          />
        </Card>
      </Section>

      <Note tone='faint'>{t('wallet.keys')}</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: 'monospace',
    fontSize: 14,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
});
