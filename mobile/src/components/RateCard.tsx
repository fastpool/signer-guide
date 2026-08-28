import { StyleSheet, View } from 'react-native';
import { satsLabel } from '@guide/lib/amounts';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { fonts, radius, space } from '../theme';
import { Card, Divider, Label, Pill, Row, Text } from '../ui';
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
 *
 * The three qualifiers are a fixed three-column grid rather than a wrapping
 * row. Wrapping put "LAST PAYOUT PAID" on a line of its own on a narrow phone,
 * which read as a fourth thing rather than the third of three.
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

  return (
    <Card testID={testID} style={styles.card}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{t('rate.label')}</Label>
        <Pill tone='stx' testID='rate-cycle'>
          {t('rate.cycle', { cycle: rate.cycle }).toUpperCase()}
        </Pill>
      </Row>

      {rate.satsPer1000Stx === null ? (
        <Text variant='title' tone='muted' testID='rate-value'>
          {t('common.notKnown')}
        </Text>
      ) : (
        <View>
          <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
            <Text variant='hero' tone='accent' testID='rate-value' style={styles.figure}>
              {groupDigits(rate.satsPer1000Stx)}
            </Text>
            <Text tone='muted' style={styles.unit}>
              {t('rate.sats')}
            </Text>
          </Row>
          <Text variant='body' tone='muted' testID='rate-unit'>
            {t('rate.unit')}
          </Text>
        </View>
      )}

      <Progress value={rate.progress} />

      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Column label={t('rate.apy')} value={percent(rate.apy)} testID='rate-apy' />
        <Column
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
        <Column
          label={t('rate.last')}
          value={
            rate.lastPayoutSatsPer1000Stx === null
              ? '—'
              : satsLabel(rate.lastPayoutSatsPer1000Stx, locale)
          }
          testID='rate-last-payout'
        />
      </Row>

      {onPress ? (
        <>
          <Divider />
          <Text
            variant='small'
            tone='stx'
            testID='rate-history-link'
            onPress={onPress}
            style={{ fontFamily: fonts.bold }}
          >
            {t('rate.historyLink')}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

/** One of the three qualifiers, in a column that does not wrap. */
function Column({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel} tone='faint'>
        {label.toUpperCase()}
      </Text>
      <Text testID={testID} style={styles.columnValue} numberOfLines={1}>
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
      style={[styles.track, { backgroundColor: colors.trough }]}
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
  figure: { fontSize: 48, letterSpacing: -1.6 },
  unit: { fontSize: 18, fontFamily: fonts.bold, paddingBottom: 7 },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
  column: { flex: 1, gap: 2 },
  columnLabel: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 0.7 },
  columnValue: { fontSize: 14.5, fontFamily: fonts.bold },
});
