import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import { isBnsName, resolveBnsName } from '@guide/lib/bns-resolve';
import { STACKS_API_URL } from '../stacks/api';
import { useT } from '../i18n';
import { useColors } from '../settings';
import { shortAddress } from '../format';
import { radius, space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Label,
  Note,
  Row,
  Screen,
  Section,
  Text,
} from '../ui';
import { useWallet } from '../wallet/context';
import { mockWalletEnabled } from '../wallet/mock';
import { isStacksAddress, type WalletId } from '../wallet/types';
import { walletLabel } from '../wallet/labels';
import {
  BROWSER_WALLETS,
  guideUrlFor,
  walletBrowserUrl,
  type GuideTarget,
} from '../wallet/browser-link';
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
export default function WalletScreen({ route, navigation }: ScreenProps<'Wallet'>) {
  const t = useT();
  const colors = useColors();
  const wallet = useWallet();
  const [typed, setTyped] = useState('');

  /* Which page of the guide a wallet browser should open on. */
  const contractId = route.params?.contractId;
  const target: GuideTarget = contractId
    ? { kind: 'pool', contractId }
    : { kind: 'guide' };
  /*
   * A BNS name is resolved before it is watched, and resolved against the
   * registry rather than an indexer — `bns-resolve.ts` explains why. Three
   * outcomes, kept apart on screen: an address, a name nobody owns, and a node
   * that would not answer. The last is not the second, and showing it as the
   * second would tell somebody their name does not exist.
   */
  const [resolving, setResolving] = useState(false);
  const [bnsError, setBnsError] = useState<'unregistered' | 'failed' | null>(null);
  /*
   * Which wallet was asked, not whether *a* wallet was asked.
   * `wallet.connecting` is one flag for the whole app, and handing it to four
   * buttons spun all four — which says the app is talking to Leather, Xverse
   * and OKX at once, and it is talking to one of them.
   */
  const [pending, setPending] = useState<WalletId | null>(null);

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
    if (wallet.connecting) return;
    setPending(null);
    if (asked.current && wallet.account) {
      asked.current = false;
      navigation.goBack();
    }
  }, [wallet.account, wallet.connecting, navigation]);

  const onWatch = async () => {
    const entered = typed.trim();
    setBnsError(null);

    if (isStacksAddress(entered)) {
      await wallet.watch(entered);
      navigation.goBack();
      return;
    }

    setResolving(true);
    const resolution = await resolveBnsName(entered.toLowerCase(), {
      apiUrl: STACKS_API_URL,
    });
    setResolving(false);

    if (resolution.state !== 'resolved') {
      setBnsError(resolution.state);
      return;
    }
    await wallet.watch(resolution.address);
    navigation.goBack();
  };

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
                  wallet: walletLabel(wallet.account.walletId, t),
                })
              : t('wallet.readOnly')}
          </Note>
        </Card>
      ) : null}

      {/*
        Watching first, and connecting last.
        The order is the order somebody can actually get somewhere. Watching
        needs nothing installed and works for every address on the chain. The
        wallet browsers work today, verified on a device. WalletConnect is the
        one that mostly does not — so it is at the bottom, with what is known
        about it written next to it rather than left to be discovered.
      */}
      <Section title={t('wallet.watchHeading')} testID='wallet-watch'>
        <Card>
          <Note>{t('wallet.watchBody')}</Note>
          <Divider />
          <Label>{t('wallet.addressLabel')}</Label>
          <TextInput
            testID='watch-input'
            value={typed}
            onChangeText={setTyped}
            /*
             * `none`, not `characters`: an address is upper case and a BNS
             * name is lower, and the field takes both. `onWatch` cases each
             * one the way its own format wants.
             */
            autoCapitalize='none'
            autoCorrect={false}
            placeholder={t('wallet.addressPlaceholder')}
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
            kind='primary'
            busy={resolving}
            disabled={!isWatchable(typed)}
            onPress={() => void onWatch()}
            testID='watch-submit'
          />
          {bnsError ? (
            <Text variant='small' tone='bad' testID='watch-error'>
              {bnsError === 'unregistered'
                ? t('wallet.nameUnregistered', { name: typed.trim().toLowerCase() })
                : t('wallet.nameLookupFailed')}
            </Text>
          ) : null}
        </Card>
      </Section>

      {/*
        The route that works. Both wallets ship a browser, and a page opened
        inside one reaches the wallet through the provider it injects — the
        same route the guide already uses. For Leather it is the only route
        there is.
      */}
      <Section title={t('wallet.browserHeading')} testID='wallet-browser'>
        <Card>
          <Note>{t('wallet.browserBody')}</Note>
          <View style={{ gap: space.sm }}>
            {BROWSER_WALLETS.map((id) => {
              const link = walletBrowserUrl(id, guideUrlFor(target));
              if (link === null) return null;
              return (
                <Button
                  key={id}
                  title={t('wallet.openIn', { wallet: walletLabel(id, t) })}
                  kind='secondary'
                  onPress={() => void Linking.openURL(link).catch(() => {})}
                  testID={`browser-${id}`}
                />
              );
            })}
          </View>
          <Note tone='faint'>{t('wallet.browserReturn')}</Note>
        </Card>
      </Section>

      {/*
        WalletConnect, last and honest about itself.
        The named wallets are gone from here. Leather registers no `wc:` scheme
        at all and its own tracker has the integration as an open request
        (leather-io/mono#2595), so a Leather button here promises something
        that does not exist. Xverse gets as far as its lock screen and no
        further has been confirmed. OKX takes the pairing and refuses on
        region. What is left is the link itself, which works in whatever wallet
        the person actually has — and says so.
      */}
      <Section title={t('wallet.connectHeading')} testID='wallet-connect'>
        <Card>
          <Note>{t('wallet.connectBody')}</Note>
          {mockWalletEnabled() ? (
            <Button
              title={walletLabel('mock', t)}
              kind='primary'
              busy={pending === 'mock'}
              onPress={() => {
                asked.current = true;
                setPending('mock');
                void wallet.connect('mock');
              }}
              testID='connect-mock'
            />
          ) : null}
          <Button
            title={walletLabel('any', t)}
            kind='secondary'
            onPress={() => {
              asked.current = true;
              setPending('any');
              void wallet.connect('any');
            }}
            testID='connect-any'
          />
          {pending !== null ? (
            <>
              <Note tone='stx'>{t('wallet.linkCopied')}</Note>
              <Button
                title={t('wallet.stopWaiting')}
                kind='quiet'
                testID='connect-cancel'
                onPress={() => {
                  asked.current = false;
                  setPending(null);
                  wallet.cancelConnect();
                }}
              />
            </>
          ) : null}
          {wallet.error ? (
            <Text variant='small' tone='bad' testID='wallet-error'>
              {wallet.error}
            </Text>
          ) : null}
        </Card>
      </Section>

      <Note tone='faint'>{t('wallet.keys')}</Note>
    </Screen>
  );
}

/** An address, or something shaped like a name worth asking the registry about. */
function isWatchable(value: string): boolean {
  const entered = value.trim();
  return isStacksAddress(entered) || isBnsName(entered.toLowerCase());
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
