import { View } from 'react-native';
import { satsLabel } from '@guide/lib/amounts';
import { byCycle, isStxOnlyHistory } from '@guide/lib/stx-only-cycles';
import type { StxOnlyHistory } from '@guide/lib/types';
import { readRate } from '../data/rate';
import { useRemoteJson } from '../data/remote';
import { useSnapshot } from '../data/snapshot';
import { groupDigits, utcLabel } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import {
  Card,
  Divider,
  Field,
  Label,
  Loading,
  Note,
  Row,
  Screen,
  Section,
  Text,
} from '../ui';
import type { ScreenProps } from '../navigation-types';

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
        <Row gap={space.xl} wrap>
          <Field
            label={t('history.blended')}
            value={satsLabel(rate.satsPer1000Stx, locale)}
            tone='accent'
          />
          <Field
            label={t('history.projected')}
            value={satsLabel(rate.projectedSatsPer1000Stx, locale)}
            tone='muted'
            hint={t('history.projectedHint')}
          />
          <Field
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
          byCycle(history.value.distributions).map((cycle) => (
            <Card key={cycle.cycle} testID={`history-cycle-${cycle.cycle}`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant='heading'>
                  {t('history.cycle', { cycle: cycle.cycle })}
                </Text>
                <Text
                  variant='heading'
                  tone={cycle.complete ? 'accent' : 'muted'}
                  testID={`history-cycle-${cycle.cycle}-total`}
                >
                  {cycle.complete
                    ? satsLabel(cycle.totalSatsPer1000Stx, locale)
                    : t('history.stillPaying')}
                </Text>
              </Row>
              <Divider />
              {cycle.payouts.map((payout) => (
                <Row
                  key={payout.burnHeight}
                  style={{ justifyContent: 'space-between' }}
                >
                  <Text variant='small' tone='faint'>
                    {payout.firstOfCycle
                      ? t('history.firstHalf')
                      : t('history.secondHalf')}{' '}
                    · {t('history.burn', { height: groupDigits(payout.burnHeight) })}
                  </Text>
                  <Text variant='small' tone='muted'>
                    {payout.rateSatsPer1000Stx === null
                      ? t('history.notWorkedOut')
                      : satsLabel(BigInt(payout.rateSatsPer1000Stx), locale)}
                  </Text>
                </Row>
              ))}
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}
