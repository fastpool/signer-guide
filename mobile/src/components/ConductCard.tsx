import { View } from 'react-native';
import {
  acceptedRate,
  answered,
  answeredRate,
  isSignerPerformance,
  neverAnswered,
  proposals,
  responseSeconds,
} from '@guide/lib/performance';
import type { SignerCyclePerformance, SignerPerformance } from '@guide/lib/types';
import { useRemoteJson } from '../data/remote';
import { groupDigits } from '../format';
import { useT } from '../i18n';
import { space } from '../theme';
import { Card, Divider, Field, Label, Loading, Note, Row, Text } from '../ui';

/**
 * Whether the node behind this pool answers the miners.
 *
 * The screen could already say how much a pool holds and what share of the
 * signer set that buys. It could not say whether the node then does anything,
 * and the two are not the same question: one signer holds 2.7% of the vote,
 * answers a quarter of what it is asked and takes half a minute over it.
 *
 * One request, not two. The website bundles a summary of the current cycle
 * with its pool list; this app downloads its data on every launch, so it takes
 * the per-key file instead — which carries the current cycle in its first row
 * and every earlier one behind it. A failure here costs this card and nothing
 * else on the screen.
 *
 * The three rules the wording turns on are in `@guide/lib/performance`, shared
 * with the site: answering leads and agreeing follows, a mean over nothing is
 * not a fast mean, and an open cycle is a cycle so far.
 */
export default function ConductCard({
  signerKey,
  rotatedFrom,
}: {
  signerKey: string | null | undefined;
  /**
   * The key this contract rotated away from, when it has.
   *
   * A cycle's signer set is fixed before the cycle begins, so a pool that has
   * just rotated has a new key holding nothing and an old key holding the
   * seat. Showing "nothing on file" for the new one would hide the fortnight
   * that actually matters.
   */
  rotatedFrom?: string | null;
}) {
  const t = useT();

  const bare = (key: string | null | undefined) =>
    typeof key === 'string' ? key.toLowerCase().replace(/^0x/, '') : null;
  const wanted = bare(signerKey);
  const fallback = bare(rotatedFrom);

  const own = useRemoteJson<SignerPerformance>(
    wanted === null ? null : `performance/${wanted}.json`,
    isSignerPerformance,
  );
  /*
   * Only asked for when the pool has rotated, and only then because the key it
   * left behind is the one holding this cycle's seat.
   */
  const old = useRemoteJson<SignerPerformance>(
    fallback === null ? null : `performance/${fallback}.json`,
    isSignerPerformance,
  );

  const ownRow = own.state === 'ready' ? own.value.cycles[0] : null;
  const oldRow = old.state === 'ready' ? old.value.cycles[0] : null;
  const row = ownRow ?? oldRow;
  const forOldKey = ownRow === null && oldRow !== null;

  const loading =
    own.state === 'loading' || (fallback !== null && old.state === 'loading');

  return (
    <Card testID='conduct-card'>
      <Label>{t('conduct.title')}</Label>
      <Note>{t('conduct.intro')}</Note>

      {loading ? (
        <Loading label={t('conduct.loading')} />
      ) : row === null ? (
        <Note tone={own.state === 'failed' ? 'warn' : undefined}>
          {own.state === 'failed' ? t('conduct.failed') : t('conduct.none')}
        </Note>
      ) : (
        <Cycle row={row} forOldKey={forOldKey} />
      )}

      {row !== null && own.state === 'ready' && own.value.cycles.length > 1 && (
        <>
          <Divider />
          <Label>{t('conduct.history')}</Label>
          <History rows={own.value.cycles.slice(0, 6)} />
        </>
      )}

      {row !== null && <Note>{t('conduct.source')}</Note>}
    </Card>
  );

  function Cycle({
    row,
    forOldKey,
  }: {
    row: SignerCyclePerformance;
    forOldKey: boolean;
  }) {
    const label = t(row.final ? 'conduct.cycleClosed' : 'conduct.cycleOpen', {
      cycle: row.cycle,
    });

    if (neverAnswered(row)) {
      return (
        <View style={{ gap: space.xs }} testID='conduct-never'>
          <Text variant='title' tone='bad'>
            {t('conduct.neverAnswered')}
          </Text>
          <Text variant='small' tone='muted'>
            {t('conduct.neverAnsweredNote', {
              proposals: groupDigits(proposals(row)),
              cycle: row.cycle,
            })}
          </Text>
          {forOldKey ? (
            <Text variant='tiny' tone='faint'>
              {t('conduct.oldKeyNote')}
            </Text>
          ) : null}
        </View>
      );
    }

    const rate = answeredRate(row);
    const seconds = responseSeconds(row);
    const agreed = acceptedRate(row);

    return (
      <View style={{ gap: space.sm }}>
        <Row gap={space.xl} wrap>
          <Field
            label={t('conduct.answered')}
            value={rate === null ? t('conduct.unknown') : `${(rate * 100).toFixed(2)}%`}
            tone={rate !== null && rate < 0.9 ? 'bad' : 'stx'}
            testID='conduct-answered'
          />
          <Field
            label={t('conduct.response')}
            value={
              seconds === null
                ? t('conduct.unknown')
                : t('conduct.seconds', { seconds: seconds.toFixed(1) })
            }
            testID='conduct-response'
          />
          <Field
            label={t('conduct.agreed')}
            value={
              agreed === null ? t('conduct.unknown') : `${(agreed * 100).toFixed(1)}%`
            }
          />
        </Row>
        <Text variant='small' tone='muted'>
          {t('conduct.answeredNote', {
            answered: groupDigits(answered(row)),
            proposals: groupDigits(proposals(row)),
            label,
          })}
        </Text>
        {forOldKey ? (
          <Text variant='tiny' tone='faint'>
            {t('conduct.oldKeyNote')}
          </Text>
        ) : null}
      </View>
    );
  }

  /** The last few cycles, oldest at the bottom. Six is a phone's worth. */
  function History({ rows }: { rows: SignerCyclePerformance[] }) {
    return (
      <View style={{ gap: space.xs }} testID='conduct-history'>
        {rows.map((entry) => {
          const rate = answeredRate(entry);
          const seconds = responseSeconds(entry);
          return (
            <Row key={entry.cycle} gap={space.md}>
              <Text variant='small' tone='faint'>
                {entry.cycle}
                {entry.final ? '' : ` ${t('conduct.soFar')}`}
              </Text>
              <View style={{ marginLeft: 'auto' }}>
                <Row gap={space.lg}>
                  <Text variant='small'>
                    {rate === null ? '—' : `${(rate * 100).toFixed(1)}%`}
                  </Text>
                  <Text variant='small' tone='muted'>
                    {seconds === null ? '—' : `${seconds.toFixed(1)}s`}
                  </Text>
                </Row>
              </View>
            </Row>
          );
        })}
      </View>
    );
  }
}
