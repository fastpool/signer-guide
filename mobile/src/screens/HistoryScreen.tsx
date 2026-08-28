import { StyleSheet, View } from 'react-native';
import { satsLabel } from '@guide/lib/amounts';
import { byCycle, isStxOnlyHistory } from '@guide/lib/stx-only-cycles';
import type { StxOnlyHistory } from '@guide/lib/types';
import { readRate } from '../data/rate';
import { useRemoteJson } from '../data/remote';
import { useSnapshot } from '../data/snapshot';
import { groupDigits, utcLabel } from '../format';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { fonts, radius, space } from '../theme';
import {
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
import type { ScreenProps } from '../navigation-types';

/** One of the two figures under the hairline. */
function Cell({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'muted';
}) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Label>{label}</Label>
      <Text tone={tone} style={styles.cellValue}>
        {value}
      </Text>
      <Text variant='small' tone='faint'>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  blended: { fontSize: 42, fontFamily: fonts.extrabold, letterSpacing: -1.4 },
  blendedUnit: { fontSize: 16, fontFamily: fonts.bold, paddingBottom: 6 },
  cellValue: { fontSize: 17, fontFamily: fonts.bold },
  cycleBlock: { paddingVertical: space.md, gap: space.sm },
  cycleName: { fontSize: 17, fontFamily: fonts.extrabold },
  cycleTotal: { fontSize: 17, fontFamily: fonts.extrabold },
  stillPaying: { fontSize: 13, fontFamily: fonts.bold },
  payoutLabel: { width: 118, fontSize: 11.5 },
  payoutValue: { width: 62, fontSize: 12.5, fontFamily: fonts.bold, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.pill },
});

/**
 * What each payout actually paid.
 *
 * The reason to have this behind the rate rather than beside it: the headline
 * is an estimate that blends a fact with a projection, and the only way to
 * judge an estimate is against the facts it was built from. So this screen is
 * the record — two payouts a cycle, each of them a number pox-5 really paid —
 * and the current estimate is shown at the top of it for comparison, not as
 * another row in the list.
 */
export default function HistoryScreen(_: ScreenProps<'History'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const colors = useColors();
  const t = useT();
  const rate = readRate(snapshot.stxOnlyCalculations);
  const history = useRemoteJson<StxOnlyHistory>(
    'stx-only-history.json',
    isStxOnlyHistory,
  );

  return (
    <Screen testID='history-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header'>
          {t('history.title')}
        </Text>
        <Note>{t('history.intro')}</Note>
      </View>

      <Card testID='history-current'>
        <Label>{t('history.estimatedNow', { cycle: rate.cycle })}</Label>
        <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
          <Text tone='accent' style={styles.blended}>
            {rate.satsPer1000Stx === null
              ? t('common.notKnown')
              : groupDigits(rate.satsPer1000Stx)}
          </Text>
          <Text tone='muted' style={styles.blendedUnit}>
            {t('history.blendedUnit')}
          </Text>
        </Row>
        <Divider />
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Cell
            label={t('history.projected')}
            value={satsLabel(rate.projectedSatsPer1000Stx, locale)}
            tone='muted'
            hint={t('history.projectedHint')}
          />
          <Cell
            label={
              rate.lastPayoutCycle === null
                ? t('history.lastPayoutGeneric')
                : t('history.lastPayout', { cycle: rate.lastPayoutCycle })
            }
            value={satsLabel(rate.lastPayoutSatsPer1000Stx, locale)}
            hint={t('history.lastPayoutHint')}
          />
        </Row>
        <Note tone='faint'>
          {t('history.read', { when: utcLabel(rate.generatedAt, locale) })}
        </Note>
      </Card>

      <Section title={t('history.every')} testID='history-list'>
        {history.state === 'loading' ? (
          <Card>
            <Loading label={t('history.loading')} />
          </Card>
        ) : history.state === 'missing' ? (
          <Note>{t('history.missing')}</Note>
        ) : history.state === 'failed' ? (
          <Note tone='warn'>{t('history.failed')}</Note>
        ) : (
          (() => {
            const cycles = byCycle(history.value.distributions);
            /*
             * Every bar is measured against the largest payout on record, so
             * the eye compares payouts with each other rather than each with
             * itself. A payout nobody could work out gets an empty track and
             * says so — never a zero-width bar, which reads as "paid nothing".
             */
            const largest = cycles.reduce((most, cycle) => {
              for (const payout of cycle.payouts) {
                const rate = payout.rateSatsPer1000Stx;
                if (rate !== null && BigInt(rate) > most) most = BigInt(rate);
              }
              return most;
            }, 1n);

            return (
              <Card style={{ gap: 0 }}>
                {cycles.map((cycle, index) => (
                  <View
                    key={cycle.cycle}
                    testID={`history-cycle-${cycle.cycle}`}
                    style={[
                      styles.cycleBlock,
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={styles.cycleName}>
                        {t('history.cycle', { cycle: cycle.cycle })}
                      </Text>
                      <Text
                        tone={cycle.complete ? 'accent' : 'faint'}
                        style={cycle.complete ? styles.cycleTotal : styles.stillPaying}
                        testID={`history-cycle-${cycle.cycle}-total`}
                      >
                        {cycle.complete
                          ? satsLabel(cycle.totalSatsPer1000Stx, locale)
                          : t('history.stillPaying')}
                      </Text>
                    </Row>
                    {cycle.payouts.map((payout) => {
                      const paid =
                        payout.rateSatsPer1000Stx === null
                          ? null
                          : BigInt(payout.rateSatsPer1000Stx);
                      return (
                        <Row key={payout.burnHeight} gap={space.sm}>
                          <Text style={styles.payoutLabel} tone='faint' numberOfLines={1}>
                            {payout.firstOfCycle
                              ? t('history.firstHalf')
                              : t('history.secondHalf')}{' '}
                            ·{' '}
                            {t('history.burn', {
                              height: groupDigits(payout.burnHeight),
                            })}
                          </Text>
                          <View
                            style={[styles.barTrack, { backgroundColor: colors.trough }]}
                          >
                            {paid === null ? null : (
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    width: `${Number((paid * 100n) / largest)}%`,
                                    backgroundColor: cycle.complete
                                      ? colors.accent
                                      : colors.stx,
                                  },
                                ]}
                              />
                            )}
                          </View>
                          <Text style={styles.payoutValue} numberOfLines={1}>
                            {paid === null
                              ? t('history.notWorkedOut')
                              : satsLabel(paid, locale)}
                          </Text>
                        </Row>
                      );
                    })}
                  </View>
                ))}
              </Card>
            );
          })()
        )}
      </Section>
    </Screen>
  );
}
