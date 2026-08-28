import { StyleSheet, View } from 'react-native';
import { satsLabel } from '@guide/lib/amounts';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { radius, space } from '../theme';
import { Card, Label, Note, Row, Text, TouchCard } from '../ui';
import { durationLabel, groupDigits, percent } from '../format';
import type { Rate } from '../data/rate';

/**
 * The number this app exists to show.
 *
 * It is a rate per *payout*, and a payout is half a reward cycle — about a
 * week. That is the fact most easily got wrong about it, so the unit is
 * written out under the figure rather than left to a legend, and the countdown
 * to the next one sits beside it. A rate with no period attached is a number
 * somebody will read as a year's.
 */
export default function RateCard({
  rate,
  onPress,
  testID = 'rate-card',
}: {
  rate: Rate;
  onPress?: () => void;
  testID?: string;
}) {
  const t = useT();
  const { locale } = useSettings();
  const Container = onPress ? TouchCard : Card;

  return (
    <Container
      testID={testID}
      onPress={onPress as () => void}
      accessibilityLabel={t('rate.label')}
      style={styles.card}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{t('rate.label')}</Label>
        <Text variant='tiny' tone='faint' testID='rate-cycle'>
          {t('rate.cycle', { cycle: rate.cycle }).toUpperCase()}
        </Text>
      </Row>

      {rate.satsPer1000Stx === null ? (
        <Text variant='title' tone='muted' testID='rate-value'>
          {t('common.notKnown')}
        </Text>
      ) : (
        <View>
          <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
            <Text variant='hero' tone='accent' testID='rate-value'>
              {groupDigits(rate.satsPer1000Stx)}
            </Text>
            <Text variant='heading' tone='muted' style={{ paddingBottom: 6 }}>
              {t('rate.sats')}
            </Text>
          </Row>
          <Text variant='body' tone='muted' testID='rate-unit'>
            {t('rate.unit')}
          </Text>
        </View>
      )}

      <Progress value={rate.progress} />

      <Row style={{ justifyContent: 'space-between' }} wrap gap={space.md}>
        <Small label={t('rate.apy')} value={percent(rate.apy)} testID='rate-apy' />
        <Small
          label={t('rate.next')}
          value={
            rate.hoursToPayout === null
              ? '—'
              : t('rate.nextIn', {
                  duration: durationLabel(rate.hoursToPayout, locale),
                })
          }
          testID='rate-next-payout'
        />
        <Small
          label={t('rate.last')}
          value={
            rate.lastPayoutSatsPer1000Stx === null
              ? '—'
              : satsLabel(rate.lastPayoutSatsPer1000Stx, locale)
          }
          testID='rate-last-payout'
        />
      </Row>

      <Note tone='faint'>
        {rate.satsPerStx === null
          ? t('rate.unreadable')
          : t('rate.note', { perStx: rate.satsPerStx.toFixed(3) })}
      </Note>
    </Container>
  );
}

function Small({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View style={{ gap: 2, minWidth: 90 }}>
      <Label>{label}</Label>
      <Text variant='small' testID={testID}>
        {value}
      </Text>
    </View>
  );
}

/** How far through the payout window the chain is. */
function Progress({ value }: { value: number | null }) {
  const colors = useColors();
  if (value === null) return null;
  return (
    <View
      style={[styles.track, { backgroundColor: colors.cardRaised }]}
      accessibilityRole='progressbar'
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      testID='rate-progress'
    >
      <View
        style={[
          styles.fill,
          { width: `${Math.round(value * 100)}%`, backgroundColor: colors.accent },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  track: { height: 5, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.pill },
});
