import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { lockDuration } from '@guide/lib/staking';
import { formatUstxAsStx, parseStxToUstx } from '@guide/lib/stx-amounts';
import { localizeProfile } from '@guide/lib/profile-i18n';
import { defaultPool } from '../data/default-pool';
import { earningsFor, readRate } from '../data/rate';
import { poolName } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { buildStakeCall, StakeRefused } from '../stacks/build-stake';
import { useChainView } from '../stacks/position';
import { useWallet } from '../wallet/context';
import { isCancellation, type WalletId } from '../wallet/types';
import { mockWalletEnabled } from '../wallet/mock';
import { WALLET_NAMES } from '../wallet/walletconnect';
import { satsLabel } from '@guide/lib/amounts';
import { lockLabel, stxExact } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Field,
  Label,
  Loading,
  Note,
  Row,
  Screen,
  Text,
} from '../ui';
import AmountField from '../components/AmountField';
import Identicon from '../components/Identicon';
import type { ScreenProps } from '../navigation-types';

/**
 * Staking, with every choice already made except the one only they can make.
 *
 * The long way round — read the contracts, compare the pools, set a payout
 * address and a fee cap and a floor — is still there, and is the right way for
 * somebody who wants it. It is also six screens and about eleven decisions,
 * which is six screens and eleven decisions more than most people will get
 * through the first time.
 *
 * So this screen makes four of them, says so, and lets any of them be changed:
 *
 *   pool      the rule in `default-pool.ts`, named on screen with its reason
 *   rewards   held as sBTC, so no Bitcoin address has to be found or typed
 *   period    one cycle — about two weeks, and endable earlier than that
 *   amount    theirs, and the only field on the screen
 *
 * Holding rewards as sBTC is the default rather than paying out to Bitcoin
 * because it is the only one of the two that cannot go wrong quietly: a
 * mistyped Bitcoin address is rewards sent somewhere nobody can get them back
 * from, and it is not checkable until the first payout. sBTC sits with the
 * pool until it is asked for. The Bitcoin address can be set later, once, from
 * the full form.
 */
const DEFAULT_CYCLES = 1;

export default function StartScreen({ navigation }: ScreenProps<'Start'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const t = useT();
  const wallet = useWallet();
  const address = wallet.account?.stxAddress ?? null;
  const chain = useChainView(address);
  const rate = readRate(snapshot.stxOnlyCalculations);
  const pool = useMemo(() => defaultPool(snapshot), [snapshot]);

  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountUstx = amount.trim() === '' ? null : parseStxToUstx(amount);
  const spendable = chain.balance?.unlockedUstx ?? null;
  const earnings = earningsFor(amountUstx, rate);

  const wallets: WalletId[] = mockWalletEnabled()
    ? ['mock', 'xverse', 'leather', 'okx']
    : ['xverse', 'leather', 'okx', 'any'];

  if (!pool) {
    return (
      <Screen testID='start-screen'>
        <Note tone='warn'>{t('start.noPool')}</Note>
      </Screen>
    );
  }

  const { name } = poolName(pool.signer, pool.signer.contractId);

  /* Somebody who is already staking is on the wrong screen; the form that can
   * change a position is the one that reads what the position is. */
  if (chain.position) {
    return (
      <Screen testID='start-screen'>
        <Card>
          <Label>{t('start.alreadyStaking')}</Label>
          <Text variant='title'>
            {stxExact(chain.position.amountUstx, locale)}
          </Text>
          <Note>{t('start.alreadyStakingBody')}</Note>
          <Button
            title={t('start.changeStake')}
            testID='start-change'
            onPress={() =>
              navigation.replace('Stake', { contractId: chain.position!.signer })
            }
          />
        </Card>
      </Screen>
    );
  }

  const problem = (() => {
    if (!address) return null; // The connect step below is the answer to this.
    if (!wallet.canSign) return t('stake.problem.watching');
    if (amount.trim() === '') return t('stake.problem.enterAmount');
    if (amountUstx === null) return t('stake.problem.notAnAmount');
    if (amountUstx <= 0n) return t('stake.problem.enterAmount');
    if (spendable !== null && amountUstx > spendable) {
      return t('stake.problem.tooMuch', { amount: stxExact(spendable, locale) });
    }
    return null;
  })();

  const onStake = async () => {
    if (problem || !address || amountUstx === null) return;
    setError(null);
    setSubmitting(true);
    try {
      const request = await buildStakeCall({
        staker: address,
        publicKey: wallet.account?.publicKey,
        signerContractId: pool.signer.contractId,
        amountUstx,
        numCycles: DEFAULT_CYCLES,
        payout: { kind: 'sbtc' },
        payoutShape: 'payout-config',
      });
      const { txid } = await wallet.callContract(request);
      navigation.replace('Sent', {
        txid,
        contractId: pool.signer.contractId,
        kind: 'stake',
      });
    } catch (err) {
      if (!isCancellation(err)) {
        setError(
          err instanceof StakeRefused
            ? t('stake.problem.refused', { reason: err.message })
            : err instanceof Error
              ? err.message
              : String(err),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen testID='start-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header'>
          {t('start.title')}
        </Text>
        <Note>{t('start.intro')}</Note>
      </View>

      {/* Step one, and the only one that needs another app. */}
      {!address || !wallet.canSign ? (
        <Card testID='start-connect'>
          <Label>{t('start.step1')}</Label>
          <Text variant='heading'>{t('start.connectHeading')}</Text>
          <Note>{t('wallet.intro')}</Note>
          <View style={{ gap: space.sm }}>
            {wallets.map((id, index) => (
              <Button
                key={id}
                title={WALLET_NAMES[id]}
                kind={index === 0 ? 'primary' : 'secondary'}
                busy={wallet.connecting}
                onPress={() => void wallet.connect(id)}
                testID={`start-connect-${id}`}
              />
            ))}
          </View>
          {wallet.error ? (
            <Text variant='small' tone='bad' testID='start-connect-error'>
              {wallet.error}
            </Text>
          ) : null}
        </Card>
      ) : (
        <Card testID='start-amount-card'>
          <Label>{t('start.step2')}</Label>
          <AmountField
            label={t('start.amountLabel')}
            testID='start-amount'
            value={amount}
            onChange={setAmount}
            placeholder='100'
            suffix='STX'
            onMax={
              spendable === null
                ? undefined
                : () => setAmount(formatUstxAsStx(spendable))
            }
            hint={
              chain.loading && spendable === null
                ? t('start.balanceLoading')
                : spendable === null
                  ? t('start.balanceUnknown')
                  : t('start.balance', { amount: stxExact(spendable, locale) })
            }
          />
          {earnings ? (
            <Text variant='small' tone='muted' testID='start-earnings'>
              {t('start.earnings', {
                payout: satsLabel(earnings.perPayout, locale),
                year: satsLabel(earnings.perYear, locale),
              })}
            </Text>
          ) : null}
        </Card>
      )}

      <Card testID='start-defaults'>
        <Label>{t('start.setForYou')}</Label>

        <Row gap={space.md} style={{ justifyContent: 'space-between' }}>
          <Row gap={space.sm} style={{ flexShrink: 1 }}>
            <Identicon hash={pool.signer.identiconHash} size={30} />
            <View style={{ flexShrink: 1 }}>
              <Text variant='body' testID='start-pool'>
                {name}
              </Text>
              <Text variant='small' tone='faint'>
                {t('start.poolMeta', {
                  fee:
                    pool.signer.feeBips === 0
                      ? t('start.noFee')
                      : t('start.fee', {
                          percent: (pool.signer.feeBips ?? 0) / 100,
                        }),
                  contract: localizeProfile(pool.template.profile, locale).name,
                })}
              </Text>
            </View>
          </Row>
          <Button
            title={t('common.change')}
            kind='quiet'
            testID='start-change-pool'
            onPress={() => navigation.navigate('ChooseContract')}
          />
        </Row>
        <Note tone='faint'>
          {t('start.reason', {
            contract: localizeProfile(pool.template.profile, locale).name,
            fee:
              pool.signer.feeBips === 0
                ? t('start.reasonNoFee')
                : t('start.reasonLowestFee', {
                    percent: (pool.signer.feeBips ?? 0) / 100,
                  }),
          })}
        </Note>

        <Divider />

        <Row gap={space.xl} wrap>
          <Field
            label={t('start.rewards')}
            value={t('start.rewardsValue')}
            testID='start-payout'
            hint={t('start.rewardsHint')}
          />
          <Field
            label={t('start.period')}
            value={lockLabel(lockDuration(DEFAULT_CYCLES), locale)}
            testID='start-period'
            hint={t('start.periodHint')}
          />
        </Row>
        <Button
          title={t('start.fullForm')}
          kind='quiet'
          testID='start-full-form'
          onPress={() =>
            navigation.navigate('Stake', { contractId: pool.signer.contractId })
          }
        />
      </Card>

      {chain.loading && address ? <Loading label={t('start.loading')} /> : null}

      {problem ? (
        <Text variant='small' tone='warn' testID='start-problem'>
          {problem}
        </Text>
      ) : null}

      {error ? (
        <Card testID='start-error'>
          <Label>{t('start.failed')}</Label>
          <Text variant='small' tone='bad'>
            {error}
          </Text>
        </Card>
      ) : null}

      {address && wallet.canSign ? (
        <>
          <Button
            title={t('start.submit')}
            testID='start-submit'
            busy={submitting}
            disabled={problem !== null}
            onPress={() => void onStake()}
          />
          <Note tone='faint'>{t('stake.keys')}</Note>
        </>
      ) : null}
    </Screen>
  );
}
