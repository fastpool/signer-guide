import { useMemo, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import {
  cyclesRemaining,
  defaultMinClaimSats,
  extendCyclesForUpdate,
  isValidMaxFee,
  isValidMinClaim,
  lockDuration,
  MAX_LOCK_CYCLES,
  minClaimFloorSats,
  type PayoutShape,
} from '@guide/lib/staking';
import { parseStxToUstx, formatUstxAsStx } from '@guide/lib/stx-amounts';
import { earningsFor, readRate } from '../data/rate';
import { DEFAULT_LOCK_CYCLES, DEFAULT_REWARDS } from '../data/stake-defaults';
import { poolName, signerFor } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { useChainView } from '../stacks/position';
import { buildStakeCall, buildUnstakeCall, StakeRefused, type PayoutChoice } from '../stacks/build-stake';
import { useWallet } from '../wallet/context';
import { isBtcAddress, isCancellation } from '../wallet/types';
import { satsLabel } from '@guide/lib/amounts';
import { groupDigits, lockLabel, stxExact } from '../format';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { fonts, radius, space } from '../theme';
import {
  Button,
  Card,
  Field,
  Label,
  Loading,
  Note,
  Row,
  Screen,
  StickyFooter,
  Text,
} from '../ui';
import AmountField from '../components/AmountField';
import Identicon from '../components/Identicon';
import type { ScreenProps } from '../navigation-types';

/**
 * The form, and the only screen in the app that changes anything.
 *
 * It serves both a first stake and a change to one, because pox-5 does: the
 * difference is `stake` versus `stake-update`, and which of those it will be
 * is settled by reading the chain at the moment the button is pressed, not by
 * what this screen was opened as. Somebody whose position unlocked while the
 * form was open gets the first-stake path without being told to start again.
 *
 * Everything the contract would refuse is checked here first, read-only. A
 * transaction the chain rejects has still cost its fee, and the commonest
 * reasons — too little left in the lock to extend, a min-claim under the floor
 * — are all knowable before anybody signs.
 */
/**
 * The lock periods offered, longest by default.
 *
 * Five options that fit one row: a cycle to try it, a quarter, half a year, a
 * year, and the contract's maximum. `MAX_LOCK_CYCLES` is the staking package's
 * own `MAX_NUM_CYCLES`, so the last one is whatever pox-5 will actually take.
 */
const LOCK_PRESETS = [1, 12, 26, 52, MAX_LOCK_CYCLES];

export default function StakeScreen({ route, navigation }: ScreenProps<'Stake'>) {
  const { contractId } = route.params;
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const colors = useColors();
  const t = useT();
  const wallet = useWallet();
  const address = wallet.account?.stxAddress ?? null;
  const chain = useChainView(address);

  const signer = signerFor(snapshot, contractId);
  const { name } = poolName(signer, contractId);
  const rate = readRate(snapshot.stxOnlyCalculations);

  const position = chain.position;
  const staking = position !== null;
  const movingPool = staking && position.signer !== contractId;
  const payoutShape: PayoutShape = position?.payout?.shape ?? 'payout-config';
  const supportsMinClaim = payoutShape === 'payout-config';

  const [amount, setAmount] = useState('');
  /* The same period the guided screen offers — see `stake-defaults.ts`. */
  const [cycles, setCycles] = useState(DEFAULT_LOCK_CYCLES);
  const [extend, setExtend] = useState<number | null>(null);
  /*
   * A position already on file decides this; otherwise the shared default.
   * Starting on "to a Bitcoin address" for somebody whose rewards arrive as
   * sBTC would offer to change something they had not asked to change.
   */
  const [toBitcoin, setToBitcoin] = useState(
    position?.payout?.route.kind === 'bitcoin' ||
      (position?.payout === undefined && DEFAULT_REWARDS === 'bitcoin'),
  );
  const [btcAddress, setBtcAddress] = useState(
    wallet.account?.btcAddress ?? currentBtcAddress(position) ?? '',
  );
  const [maxFee, setMaxFee] = useState(currentMaxFee(position) ?? '3000');
  const [minClaim, setMinClaim] = useState(currentMinClaim(position) ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountUstx = amount.trim() === '' ? 0n : parseStxToUstx(amount);
  const spendable = chain.balance?.unlockedUstx ?? null;
  const maxFeeSats = /^\d+$/.test(maxFee.trim()) ? BigInt(maxFee.trim()) : null;
  /*
   * An empty floor is not a missing answer. Left blank it means the lowest the
   * contract will take, which is what a contract that does not understand the
   * field fills in for itself — so the form does the same rather than refusing
   * to go on until somebody types a number they have no way to pick.
   */
  const minClaimSats =
    minClaim.trim() === ''
      ? maxFeeSats === null
        ? null
        : defaultMinClaimSats(maxFeeSats)
      : /^\d+$/.test(minClaim.trim())
        ? BigInt(minClaim.trim())
        : null;

  const remaining =
    position && chain.cycle
      ? cyclesRemaining({ position, currentCycle: chain.cycle.rewardCycleId })
      : null;
  const minExtend =
    position && chain.cycle
      ? extendCyclesForUpdate({ position, currentCycle: chain.cycle.rewardCycleId })
      : 0;

  const projected = useMemo(() => {
    const total = (position?.amountUstx ?? 0n) + (amountUstx ?? 0n);
    // A projection of nothing is not a projection. Until there is an amount to
    // measure, the card that would hold it is not there at all.
    return total > 0n ? earningsFor(total, rate) : null;
  }, [position, amountUstx, rate]);

  const problem = validate();

  function validate(): string | null {
    if (!address) return t('stake.problem.connect');
    if (!wallet.canSign) return t('stake.problem.watching');
    if (amount.trim() !== '' && amountUstx === null) {
      return t('stake.problem.notAnAmount');
    }
    if (!staking && (amountUstx ?? 0n) <= 0n) return t('stake.problem.enterAmount');
    if (spendable !== null && (amountUstx ?? 0n) > spendable) {
      return t('stake.problem.tooMuch', { amount: stxExact(spendable, locale) });
    }
    if (!staking && (cycles < 1 || cycles > MAX_LOCK_CYCLES)) {
      return t('stake.problem.cycles', { max: MAX_LOCK_CYCLES });
    }
    if (toBitcoin && !isBtcAddress(btcAddress.trim())) {
      return t('stake.problem.btcAddress');
    }
    if (toBitcoin && maxFeeSats === null) return t('stake.problem.maxFee');
    /*
     * Refused here rather than by the sBTC signers later: being told no by a
     * form costs a field, and being told no by the signers costs a reward
     * nobody receives and no message anybody sees.
     */
    if (toBitcoin && maxFeeSats !== null && !isValidMaxFee(maxFeeSats)) {
      return t('stake.problem.maxFeeFloor');
    }
    if (toBitcoin && supportsMinClaim && maxFeeSats !== null) {
      if (minClaimSats === null || !isValidMinClaim(minClaimSats, maxFeeSats)) {
        return t('stake.problem.minClaim', {
          floor: groupDigits(minClaimFloorSats(maxFeeSats)),
        });
      }
    }
    if (
      staking &&
      (amountUstx ?? 0n) === 0n &&
      !movingPool &&
      (extend ?? minExtend) === 0
    ) {
      return t('stake.problem.nothingToChange');
    }
    if (chain.cycle?.inPreparePhase && staking) {
      return t('stake.problem.preparePhase');
    }
    return null;
  }

  const payout: PayoutChoice = toBitcoin
    ? {
        kind: 'bitcoin',
        address: btcAddress.trim(),
        maxFeeSats: maxFeeSats ?? 0n,
        minClaimSats:
          supportsMinClaim && minClaimSats !== null ? minClaimSats : undefined,
      }
    : { kind: 'sbtc' };

  const onSubmit = async () => {
    if (problem || !address) return;
    setError(null);
    setSubmitting(true);
    try {
      const request = await buildStakeCall({
        staker: address,
        publicKey: wallet.account?.publicKey,
        signerContractId: contractId,
        amountUstx: amountUstx ?? 0n,
        numCycles: cycles,
        extendCycles: extend ?? undefined,
        payout,
        payoutShape,
      });
      const { txid } = await wallet.callContract(request);
      navigation.navigate('Sent', { txid, contractId, kind: 'stake' });
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

  const onUnstake = async () => {
    if (!address || !position) return;
    setError(null);
    setSubmitting(true);
    try {
      const request = await buildUnstakeCall({
        staker: address,
        publicKey: wallet.account?.publicKey,
        signerContractId: position.signer,
      });
      const { txid } = await wallet.callContract(request);
      navigation.navigate('Sent', { txid, contractId, kind: 'unstake' });
    } catch (err) {
      if (!isCancellation(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (chain.loading && position === null && address) {
    return (
      <Screen testID='stake-screen'>
        <Loading label={t('stake.loading')} testID='stake-loading' />
      </Screen>
    );
  }

  return (
    <Screen
      testID='stake-screen'
      footer={
        <StickyFooter>
          {/*
            Without a wallet there is nothing to sign with, and a disabled
            button under "connect a wallet before staking" is a sentence with
            no way to act on it. So the footer offers the thing that is
            actually missing — and the wallet screen closes itself once a
            session exists, which lands the person back here.
          */}
          {wallet.canSign ? (
            <Button
              title={staking ? t('stake.submitChange') : t('stake.submitFirst')}
              testID='stake-submit'
              busy={submitting}
              disabled={problem !== null}
              onPress={() => void onSubmit()}
            />
          ) : (
            <Button
              title={t('home.connect.button')}
              testID='stake-connect'
              onPress={() => navigation.navigate('Wallet', { contractId })}
            />
          )}
          <Note tone='faint'>{t('stake.keys')}</Note>
        </StickyFooter>
      }
    >
      <Row gap={space.md}>
        <Identicon hash={signer?.identiconHash ?? null} size={44} />
        <View style={{ flexShrink: 1 }}>
          <Label testID='stake-mode'>
            {staking
              ? movingPool
                ? t('stake.moveTo')
                : t('stake.changeWith')
              : t('stake.stakeWith')}
          </Label>
          <Text variant='title' accessibilityRole='header' testID='stake-pool-name'>
            {name}
          </Text>
        </View>
      </Row>

      {movingPool ? (
        <Note tone='warn'>{t('stake.moving')}</Note>
      ) : null}

      <Card>
        <AmountField
          label={staking ? t('stake.amountAdd') : t('stake.amountFirst')}
          testID='stake-amount'
          value={amount}
          onChange={setAmount}
          placeholder={staking ? '0' : '100'}
          suffix='STX'
          onMax={
            spendable === null
              ? undefined
              : () => setAmount(formatUstxAsStx(spendable))
          }
          hint={
            spendable === null
              ? t('start.balanceUnknown')
              : t('start.balance', { amount: stxExact(spendable, locale) })
          }
        />

        {staking ? (
          <View style={{ gap: space.sm }}>
            <Label>{t('stake.extend')}</Label>
            <Row gap={space.sm} wrap>
              {[minExtend, minExtend + 1, minExtend + 6, minExtend + 12]
                .filter((n, i, all) => all.indexOf(n) === i)
                .map((n) => (
                  <Text
                    key={n}
                    testID={`extend-${n}`}
                    onPress={() => setExtend(n)}
                    style={[
                      styles.choice,
                      (extend ?? minExtend) === n
                        ? { backgroundColor: colors.stx, color: colors.onAccent }
                        : { backgroundColor: colors.cardRaised, color: colors.muted },
                    ]}
                  >
                    {n === 0 ? t('stake.extendNone') : t('stake.extendBy', { count: n })}
                  </Text>
                ))}
            </Row>
            <Text variant='small' tone='faint'>
              {remaining === null
                ? t('stake.remainingUnknown')
                : t('stake.remaining', { count: remaining }) +
                  (minExtend > 0
                    ? t('stake.remainingFloor', { min: minExtend })
                    : '')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Label>{t('stake.lockFor')}</Label>
            <Row gap={space.sm} wrap>
              {/*
                Only the first option and the selected one carry the unit, so
                five fit on one row without wrapping.
              */}
              {LOCK_PRESETS.map((n, index) => (
                <Text
                  key={n}
                  testID={`cycles-${n}`}
                  onPress={() => setCycles(n)}
                  style={[
                    styles.choice,
                    cycles === n
                      ? { backgroundColor: colors.stx, color: colors.onAccent }
                      : { backgroundColor: colors.cardRaised, color: colors.muted },
                  ]}
                >
                  {index === 0 || cycles === n
                    ? t(n === 1 ? 'stake.cycle' : 'stake.cycles', { count: n })
                    : String(n)}
                </Text>
              ))}
            </Row>
            <Text variant='small' tone='faint'>
              {t('stake.lockHint', {
                duration: lockLabel(lockDuration(cycles), locale),
              })}
            </Text>
          </View>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flexShrink: 1 }}>
            <Label>{t('stake.rewards')}</Label>
            <Text variant='body'>
              {toBitcoin ? t('stake.rewardsBtc') : t('stake.rewardsSbtc')}
            </Text>
          </View>
          <Switch
            testID='payout-toggle'
            value={toBitcoin}
            onValueChange={setToBitcoin}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor={colors.text}
          />
        </Row>

        {toBitcoin ? (
          <>
            <AmountField
              label={t('stake.btcAddress')}
              testID='btc-address'
              value={btcAddress}
              onChange={setBtcAddress}
              placeholder='bc1…'
              keyboardType='default'
              hint={t('stake.btcAddressHint')}
            />
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <SatsField
                label={t('stake.maxFeeShort')}
                testID='max-fee'
                value={maxFee}
                onChange={setMaxFee}
              />
              {supportsMinClaim ? (
                <SatsField
                  label={t('stake.minClaimShort')}
                  testID='min-claim'
                  value={minClaim}
                  onChange={setMinClaim}
                  placeholder={
                    maxFeeSats === null
                      ? undefined
                      : String(defaultMinClaimSats(maxFeeSats))
                  }
                />
              ) : null}
            </Row>
            {supportsMinClaim ? (
              maxFeeSats === null ? null : (
                <Note tone='faint'>
                  {t('stake.feeNote', {
                    floor: groupDigits(minClaimFloorSats(maxFeeSats)),
                    lowest: groupDigits(defaultMinClaimSats(maxFeeSats)),
                  })}
                </Note>
              )
            ) : (
              <Note tone='faint'>{t('stake.noMinClaim')}</Note>
            )}
          </>
        ) : (
          <Note>{t('stake.sbtcNote')}</Note>
        )}
      </Card>

      {projected ? (
        <Card testID='stake-projection'>
          <Label>{t('stake.projection')}</Label>
          <Row gap={space.xl} wrap>
            <Field
              label={t('stake.projectionPayout')}
              value={satsLabel(projected.perPayout, locale)}
              tone='accent'
              testID='projection-payout'
            />
            <Field
              label={t('stake.projectionYear')}
              value={satsLabel(projected.perYear, locale)}
              tone='accent'
              testID='projection-year'
            />
          </Row>
          <Note tone='faint'>{t('stake.projectionNote')}</Note>
        </Card>
      ) : null}

      {problem ? (
        <Text variant='small' tone='warn' testID='stake-problem'>
          {problem}
        </Text>
      ) : null}

      {error ? (
        <Card testID='stake-error'>
          <Label>{t('stake.failed')}</Label>
          <Text variant='small' tone='bad'>
            {error}
          </Text>
        </Card>
      ) : null}

      {/*
        One outlined pill, with the explanation shown on press rather than
        sitting under the form. Ending a stake is a thing somebody comes here
        having already decided; the paragraph belongs at the moment of the
        decision, not above it.
      */}
      {staking && !movingPool ? (
        <View style={{ gap: space.sm }}>
          <Button
            title={t('stake.endingPill')}
            kind='danger'
            testID='unstake-open'
            onPress={() => setEnding((open) => !open)}
          />
          {ending ? (
            <Card testID='unstake-detail'>
              <Note>{t('stake.endingBody')}</Note>
              <Button
                title={t('stake.unstake')}
                kind='danger'
                testID='unstake-submit'
                busy={submitting}
                onPress={() => void onUnstake()}
              />
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/** One of the two sats figures, in a column that does not wrap. */
function SatsField({
  label,
  value,
  onChange,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Label>{label}</Label>
      <Row
        gap={space.xs}
        style={[styles.satsField, { backgroundColor: colors.cardRaised }]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          keyboardType='number-pad'
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          style={[styles.satsInput, { color: colors.text }]}
        />
        <Text variant='small' tone='faint'>
          sats
        </Text>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    fontSize: 12.5,
    fontFamily: fonts.bold,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  satsField: {
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  satsInput: {
    flexGrow: 1,
    fontSize: 16,
    fontFamily: fonts.bold,
    paddingVertical: 11,
  },
});

function currentBtcAddress(position: { payout?: { route: { kind: string; address?: string } } | null } | null) {
  const route = position?.payout?.route;
  return route && route.kind === 'bitcoin' ? (route.address ?? null) : null;
}

function currentMaxFee(position: { payout?: { route: { kind: string; maxFeeSats?: bigint } } | null } | null) {
  const route = position?.payout?.route;
  return route && route.kind === 'bitcoin' && route.maxFeeSats !== undefined
    ? String(route.maxFeeSats)
    : null;
}

function currentMinClaim(position: { payout?: { route: { kind: string; minClaimSats?: bigint | null } } | null } | null) {
  const route = position?.payout?.route;
  return route && route.kind === 'bitcoin' && route.minClaimSats
    ? String(route.minClaimSats)
    : null;
}
