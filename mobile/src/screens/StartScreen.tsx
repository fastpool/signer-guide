import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { lockDuration } from '@guide/lib/staking';
import { formatUstxAsStx, parseStxToUstx } from '@guide/lib/stx-amounts';
import { localizeProfile } from '@guide/lib/profile-i18n';
import { defaultPool } from '../data/default-pool';
import { DEFAULT_LOCK_CYCLES } from '../data/stake-defaults';
import { earningsFor, readRate } from '../data/rate';
import { poolName } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { buildStakeCall, StakeRefused } from '../stacks/build-stake';
import { useChainView } from '../stacks/position';
import { useWallet } from '../wallet/context';
import { isCancellation } from '../wallet/types';
import { satsLabel } from '@guide/lib/amounts';
import { lockLabel, stxExact } from '../format';
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
  StickyFooter,
  Text,
} from '../ui';
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
 *   pool      `default-pool.ts`, named on screen with the reason it was picked
 *   rewards   `stake-defaults.ts` — sBTC, so no Bitcoin address to mistype
 *   period    `stake-defaults.ts` — the same one the full form starts on
 *   amount    theirs, and the only field on the screen
 *
 * The two settings come from `stake-defaults.ts` rather than from here,
 * because the full form offers the same two and the pair had drifted: this
 * screen said two weeks and that one said ninety-six cycles, so the row saying
 * "change this" led to a form that disagreed with it.
 *
 * Holding rewards as sBTC is the default rather than paying out to Bitcoin
 * because it is the only one of the two that cannot go wrong quietly: a
 * mistyped Bitcoin address is rewards sent somewhere nobody can get them back
 * from, and it is not checkable until the first payout. sBTC sits with the
 * pool until it is asked for. The Bitcoin address can be set later, once, from
 * the full form.
 */


export default function StartScreen({ navigation }: ScreenProps<'Start'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const colors = useColors();
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
        numCycles: DEFAULT_LOCK_CYCLES,
        /*
         * This screen only ever sends sBTC — the other route needs an address,
         * a fee cap and a floor, which is the full form's job. The assertion
         * is `stake-defaults.ts`'s: if the shared default ever becomes
         * Bitcoin, this screen has to grow those fields rather than quietly
         * send a route it has not asked anybody about.
         */
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
    <Screen
      testID='start-screen'
      footer={
        address && wallet.canSign ? (
          <StickyFooter>
            <Button
              title={t('start.submit')}
              testID='start-submit'
              busy={submitting}
              disabled={problem !== null}
              onPress={() => void onStake()}
            />
            <Note tone='faint'>{t('stake.keys')}</Note>
          </StickyFooter>
        ) : undefined
      }
    >
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
          {/*
            One button to the wallet screen rather than a wallet list here.
            There are three ways in — watching, a wallet's own browser,
            WalletConnect — and only one of them fits on a card. Repeating a
            subset of them mid-flow meant the easiest route to a stake offered
            the route least likely to work.
          */}
          <Button
            title={t('home.connect.button')}
            onPress={() =>
              navigation.navigate('Wallet', {
                contractId: pool.signer.contractId,
              })
            }
            testID='start-connect-wallet'
          />
        </Card>
      ) : (
        <Card testID='start-amount-card'>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>{t('start.amountLabel')}</Label>
            {spendable === null ? null : (
              <Text
                testID='start-amount-max'
                onPress={() => setAmount(formatUstxAsStx(spendable))}
                style={[
                  styles.maxPill,
                  { backgroundColor: colors.grapeSoft, color: colors.stx },
                ]}
              >
                {t('common.max')}
              </Text>
            )}
          </Row>

          {/*
            Not a box. The amount is the only thing this screen asks for, so it
            is set like a figure and underlined, the way the rate is set like a
            figure — a bordered field would make it look like one of several.
          */}
          <View style={[styles.baseline, { borderBottomColor: colors.stx }]}>
            <TextInput
              testID='start-amount'
              value={amount}
              onChangeText={setAmount}
              keyboardType='decimal-pad'
              placeholder='100'
              placeholderTextColor={colors.faint}
              style={[styles.baselineInput, { color: colors.stx }]}
            />
            <Text style={[styles.baselineUnit, { color: colors.faint }]}>STX</Text>
          </View>
          <Text variant='small' tone='faint'>
            {chain.loading && spendable === null
              ? t('start.balanceLoading')
              : spendable === null
                ? t('start.balanceUnknown')
                : t('start.balance', { amount: stxExact(spendable, locale) })}
          </Text>

          {earnings ? (
            <View style={[styles.projection, { backgroundColor: colors.amberSoft }]}>
              <Text style={[styles.projectionLabel, { color: colors.accent }]}>
                {t('start.projectionLabel').toUpperCase()}
              </Text>
              <Text
                testID='start-earnings'
                style={[styles.projectionValue, { color: colors.accent }]}
              >
                {t('start.earnings', {
                  payout: satsLabel(earnings.perPayout, locale),
                  year: satsLabel(earnings.perYear, locale),
                })}
              </Text>
            </View>
          ) : null}
        </Card>
      )}

      <Card testID='start-defaults' style={{ gap: 0 }}>
        <Label>{t('start.setForYou')}</Label>
        <ListRow
          first
          title={name}
          hint={t('start.poolMeta', {
            fee:
              pool.signer.feeBips === 0
                ? t('start.noFee')
                : t('start.fee', { percent: (pool.signer.feeBips ?? 0) / 100 }),
            contract: localizeProfile(pool.template.profile, locale).name,
          })}
          value={t('common.change')}
          leading={<Identicon hash={pool.signer.identiconHash} size={30} />}
          onPress={() => navigation.navigate('ChooseContract')}
          testID='start-change-pool'
        />
        <ListRow
          title={t('start.rewardsValue')}
          hint={t('start.rewardsHint')}
          value={t('common.change')}
          onPress={() =>
            navigation.navigate('Stake', { contractId: pool.signer.contractId })
          }
          testID='start-payout'
        />
        <ListRow
          title={lockLabel(lockDuration(DEFAULT_LOCK_CYCLES), locale)}
          hint={t('start.periodHint')}
          value={t('common.change')}
          onPress={() =>
            navigation.navigate('Stake', { contractId: pool.signer.contractId })
          }
          testID='start-period'
        />
        <View style={{ paddingTop: space.md }}>
          {/*
            Which sentence depends on what actually chose the pool. Printing
            the preference's wording over a rule's choice, or the other way
            round, would be the app telling somebody why it did something it
            did not do.
          */}
          <Note tone='faint'>
            {pool.preferred
              ? t('start.reason', {
                  contract: localizeProfile(pool.template.profile, locale).name,
                  count: pool.alternatives,
                  fee:
                    pool.signer.feeBips === 0
                      ? t('start.reasonNoFee')
                      : t('start.reasonLowestFee', {
                          percent: (pool.signer.feeBips ?? 0) / 100,
                        }),
                })
              : t('start.reasonFallback', { count: pool.alternatives + 1 })}
          </Note>
        </View>
      </Card>

      <Text
        variant='small'
        tone='stx'
        testID='start-full-form'
        onPress={() =>
          navigation.navigate('Stake', { contractId: pool.signer.contractId })
        }
        style={{ fontFamily: fonts.bold, textAlign: 'center' }}
      >
        {t('start.fullForm')}
      </Text>

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

    </Screen>
  );
}

const styles = StyleSheet.create({
  maxPill: {
    fontSize: 11.5,
    fontFamily: fonts.extrabold,
    letterSpacing: 0.4,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  /*
   * The amount is not a box. It is the only thing this screen asks for, so it
   * is set like a figure and underlined the way the rate is set like a figure
   * — a bordered field would make it look like one of several.
   */
  baseline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    borderBottomWidth: 2,
    paddingBottom: 4,
  },
  baselineInput: {
    flexGrow: 1,
    fontSize: 38,
    fontFamily: fonts.extrabold,
    letterSpacing: -1.2,
    padding: 0,
  },
  baselineUnit: { fontSize: 17, fontFamily: fonts.bold, paddingBottom: 8 },
  projection: { borderRadius: 16, padding: 12, paddingHorizontal: 14, gap: 4 },
  projectionLabel: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 0.7 },
  projectionValue: { fontSize: 15, fontFamily: fonts.bold, lineHeight: 21 },
});
