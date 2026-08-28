import { View } from 'react-native';
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

      {/* Whose stake this is, and the way to change that. */}
      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
        <Text variant='small' tone='faint' testID='position-address'>
          {shortAddress(address, 8, 6)}
          {canSign ? '' : ` · ${t('wallet.watching')}`}
        </Text>
        <Button
          title={t('common.change')}
          kind='quiet'
          onPress={onOpenWallet}
          testID='position-wallet'
          style={{ minHeight: 24, paddingHorizontal: 0 }}
        />
      </Row>

      <Text variant='title' tone='stx' testID='position-amount'>
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
          <Identicon hash={signer?.identiconHash ?? null} size={32} />
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

      <Row gap={space.xl} wrap>
        <Field
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
        <Field
          label={t('position.rewardsGoTo')}
          testID='position-payout'
          value={payoutLabel(position, t)}
          hint={payoutHint(position, t, locale)}
        />
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

type T = ReturnType<typeof useT>;

function payoutLabel(position: StakedPosition, t: T): string {
  const route = position.payout?.route;
  if (!route) return t('common.notKnown');
  if (route.kind === 'sbtc') return t('position.sbtc');
  return shortAddress(route.address, 8, 6);
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
