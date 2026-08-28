import { StyleSheet, View } from 'react-native';
import { satsLabel } from '@guide/lib/amounts';
import {
  cyclesRemaining,
  lockDuration,
  type StakedPosition,
} from '@guide/lib/staking';
import { earningsFor, type Rate } from '../data/rate';
import { poolName, signerFor } from '../data/signers';
import type { Snapshot } from '../data/snapshot';
import { lockLabel, shortAddress, stxExact } from '../format';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { fonts, radius, space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Label,
  Note,
  Pill,
  Row,
  Text,
} from '../ui';
import Identicon from './Identicon';

/**
 * What somebody's stake is, and what it is earning.
 *
 * The order is deliberate: whose it is, then how much, then what it earns,
 * then with whom, then where the rewards land. Somebody opening this app twice
 * a week is checking the third of those and nothing else, so it sits above the
 * pool's name — the pool does not change, and the number does.
 *
 * The address is at the top rather than in a card of its own, because it is
 * not a thing anybody came here to read: it is the answer to "whose stake is
 * this", which only matters when it is the wrong one. So it is small, quiet,
 * and doubles as the way to the wallet screen — which is where changing it
 * belongs.
 */
export default function PositionCard({
  position,
  snapshot,
  rate,
  currentCycle,
  address,
  canSign,
  onOpenWallet,
  onChange,
  onViewPool,
  testID = 'position-card',
}: {
  position: StakedPosition;
  snapshot: Snapshot;
  rate: Rate;
  currentCycle: number | null;
  address: string;
  canSign: boolean;
  onOpenWallet: () => void;
  onChange?: () => void;
  onViewPool?: () => void;
  testID?: string;
}) {
  const t = useT();
  const colors = useColors();
  const { locale } = useSettings();
  const signer = signerFor(snapshot, position.signer);
  const { name, guessed } = poolName(signer, position.signer);
  const earnings = earningsFor(position.amountUstx, rate);
  const remaining =
    currentCycle === null ? null : cyclesRemaining({ position, currentCycle });

  return (
    <Card testID={testID}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{t('position.label')}</Label>
        <Pill tone='good' testID='position-active'>
          {t('position.active')}
        </Pill>
      </Row>

      <Text variant='title' tone='stx' testID='position-amount' style={styles.amount}>
        {stxExact(position.amountUstx, locale)}
      </Text>

      {earnings ? (
        <Text variant='body' tone='muted' testID='position-earnings'>
          {t('position.earnings', {
            payout: satsLabel(earnings.perPayout, locale),
            year: satsLabel(earnings.perYear, locale),
          })}
        </Text>
      ) : (
        <Note>{t('position.earningsUnknown')}</Note>
      )}

      <Divider />

      <Row gap={space.md} style={{ justifyContent: 'space-between' }}>
        <Row gap={space.sm} style={{ flexShrink: 1 }}>
          <View style={[styles.tile, { backgroundColor: colors.trough }]}>
            <Identicon hash={signer?.identiconHash ?? null} size={26} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Label>{t('position.stakedWith')}</Label>
            <Text
              variant='heading'
              testID='position-pool'
              numberOfLines={1}
              style={guessed ? { fontStyle: 'italic' } : undefined}
            >
              {name}
            </Text>
            {signer?.implementationName ? (
              <Text variant='small' tone='faint'>
                {t('position.contractNamed', { name: signer.implementationName })}
              </Text>
            ) : (
              <Text variant='small' tone='warn'>
                {t('position.unreviewed')}
              </Text>
            )}
          </View>
        </Row>
        {onViewPool ? (
          <Button
            title={t('common.details')}
            kind='quiet'
            onPress={onViewPool}
            testID='position-pool-details'
          />
        ) : null}
      </Row>

      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Cell
          label={t('position.lockedUntil')}
          testID='position-remaining'
          value={
            remaining === null
              ? t('common.notKnown')
              : remaining < 0
                ? t('position.alreadyUnlocked')
                : t('common.cycle', {
                    cycle: position.firstRewardCycle + position.numCycles - 1,
                  })
          }
          hint={
            remaining === null || remaining < 0
              ? undefined
              : remaining === 0
                ? t('position.endsThisCycle')
                : t('position.moreCycles', {
                    count: remaining,
                    duration: lockLabel(lockDuration(remaining), locale),
                  })
          }
        />
        <Cell
          label={t('position.rewardsGoTo')}
          testID='position-payout'
          value={payoutLabel(position, t)}
          hint={payoutHint(position, t, locale)}
        />
      </Row>

      {/*
        Whose stake this is, at the foot of the card and quiet.
        It is the answer to a question nobody opened the app to ask, and which
        only matters when it is the wrong one — so it sits under the figures
        rather than over them, and doubles as the way to change it.
      */}
      <Row
        gap={space.sm}
        wrap
        style={[styles.address, { backgroundColor: colors.cardRaised }]}
      >
        {/*
          The address and its state on the left, `Change` on the right — and
          at large system font sizes the two halves wrap onto separate lines
          rather than the row running `Change` off the edge of the screen.
          The left half grows, so `Change` keeps its right edge while the row
          fits on one line; the address shrinks and ellipses before anything
          is pushed anywhere.
        */}
        <Row gap={space.sm} wrap style={styles.addressLeft}>
          <Text
            variant='small'
            tone='faint'
            testID='position-address'
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {shortAddress(address, 8, 6)}
          </Text>
          {canSign ? null : (
            <Text
              variant='small'
              tone='accent'
              testID='position-watching'
              style={{ fontFamily: fonts.bold }}
            >
              {t('wallet.watching')}
            </Text>
          )}
        </Row>
        <Text
          variant='small'
          tone='stx'
          onPress={onOpenWallet}
          testID='position-wallet'
          style={{ fontFamily: fonts.bold }}
        >
          {t('common.change')}
        </Text>
      </Row>

      {onChange ? (
        <Button
          title={t('position.change')}
          kind='secondary'
          onPress={onChange}
          testID='position-change'
        />
      ) : null}
    </Card>
  );
}

/** One of the two figures under the hairline, in a column that does not wrap. */
function Cell({
  label,
  value,
  hint,
  testID,
}: {
  label: string;
  value: string;
  hint?: string;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Label>{label}</Label>
      <Text variant='heading' testID={testID}>
        {value}
      </Text>
      {hint ? (
        <Text variant='small' tone='faint'>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 31, letterSpacing: -0.8 },
  tile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  address: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addressLeft: { flexGrow: 1, flexShrink: 1 },
});

type T = ReturnType<typeof useT>;

/**
 * Where the rewards go, and in what.
 *
 * Both halves, because either alone is a half-answer: "sBTC" does not say
 * where it lands and an address does not say what arrives at it. The two
 * routes are genuinely different — sBTC stays on Stacks in this same wallet,
 * BTC is withdrawn to L1 — and the line has to be readable as that difference.
 */
function payoutLabel(position: StakedPosition, t: T): string {
  const route = position.payout?.route;
  if (!route) return t('common.notKnown');
  if (route.kind === 'sbtc') return t('position.sbtc');
  return t('position.btcTo', { address: shortAddress(route.address, 8, 6) });
}

function payoutHint(
  position: StakedPosition,
  t: T,
  locale: 'en' | 'ko',
): string | undefined {
  const route = position.payout?.route;
  if (!route) return t('position.payoutUnknown');
  if (route.kind === 'sbtc') return t('position.sbtcHint');
  return t('position.btcHint', { fee: satsLabel(route.maxFeeSats, locale) });
}
