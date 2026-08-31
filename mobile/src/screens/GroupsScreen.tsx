import { View } from 'react-native';
import {
  allGroups,
  groupContracts,
  groupNodes,
  groupUstx,
  groupVotingPowerBips,
  ungroupedContracts,
  ungroupedUstx,
  ungroupedVotingPowerBips,
} from '@guide/lib/signer-groups';
import { useSnapshot } from '../data/snapshot';
import { stxShort } from '../format';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { radius, space } from '../theme';
import { Card, Note, Row, Screen, Text, TouchCard } from '../ui';
import type { ScreenProps } from '../navigation-types';

/**
 * Who holds the vote, largest share first.
 *
 * The pool list answers "where could my STX go". This answers the question
 * underneath it, which the chain does not: three keys at six percent each read
 * as three small signers until somebody writes down that they are one company,
 * at which point they are a fifth of a veto.
 *
 * Every group is a hand-written claim in `src/data/signer-groups.json`, shared
 * with the web guide rather than copied — the arithmetic here is the guide's
 * own `groupVotingPowerBips`, so the two cannot disagree about who carries
 * what. The last card is the honest one: what nobody has grouped at all.
 */
export default function GroupsScreen({ navigation }: ScreenProps<'Groups'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const colors = useColors();
  const t = useT();

  const signers = snapshot.signers.signers;
  const ustx = snapshot.totals.ustx;

  const rows = allGroups()
    .map((group) => ({
      group,
      bips: groupVotingPowerBips(group, signers, ustx),
      staked: groupUstx(group, signers, ustx),
      nodes: groupNodes(group, signers).length,
      contracts: groupContracts(group, signers).length,
    }))
    // Unknown weight last: a group the refresh could not price is not a small
    // one, and the bottom is the only honest place for it.
    .sort((a, b) => (b.bips ?? -1) - (a.bips ?? -1));

  const rest = {
    bips: ungroupedVotingPowerBips(signers, ustx),
    staked: ungroupedUstx(signers, ustx),
    contracts: ungroupedContracts(signers).length,
  };

  const percent = (bips: number | null) =>
    bips === null ? t('groups.unknown') : `${(bips / 100).toFixed(2)}%`;

  return (
    <Screen testID='groups-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header'>
          {t('groups.title')}
        </Text>
        <Note>{t('groups.intro')}</Note>
        <Text variant='small' tone='faint'>
          {t('groups.asOf', { cycle: snapshot.totals.cycle })}
        </Text>
      </View>

      {rows.map(({ group, bips, staked, nodes, contracts }) => (
        <TouchCard
          key={group.id}
          testID={`groups-row-${group.id}`}
          accessibilityLabel={group.name}
          onPress={() => navigation.navigate('Group', { groupId: group.id })}
        >
          <Row gap={space.md}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Text variant='heading'>{group.name}</Text>
              <Text variant='small' tone='stx'>
                {t(`groups.kind.${group.kind}`)}
              </Text>
            </View>
            <View style={{ marginLeft: 'auto' }}>
              <Text variant='heading' testID={`groups-share-${group.id}`}>
                {percent(bips)}
              </Text>
            </View>
          </Row>
          <Text variant='small' tone='muted'>
            {group.summary}
          </Text>
          <Text variant='tiny' tone='faint'>
            {t('groups.counts', {
              nodes,
              contracts,
              staked: stxShort(staked, locale),
            })}
          </Text>
        </TouchCard>
      ))}

      {/*
        Not a card somebody can open, because it is not a claim about anybody.
        Below the groups rather than sorted in among them: its share would put
        it in the middle of the list, and a reader scanning for who holds the
        vote should not meet "nobody has written this down" as though it were
        an entity.
      */}
      <Card
        testID='groups-ungrouped'
        style={{
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
        }}
      >
        <Row gap={space.md}>
          <Text variant='heading' tone='muted'>
            {t('groups.ungrouped')}
          </Text>
          <View style={{ marginLeft: 'auto' }}>
            <Text variant='heading' tone='muted' testID='groups-ungrouped-share'>
              {percent(rest.bips)}
            </Text>
          </View>
        </Row>
        <Text variant='small' tone='muted'>
          {t('groups.ungroupedNote')}
        </Text>
        <Text variant='tiny' tone='faint'>
          {t('groups.ungroupedCounts', {
            contracts: rest.contracts,
            staked: stxShort(rest.staked, locale),
          })}
        </Text>
      </Card>

      <Note>{t('groups.sourceNote')}</Note>
    </Screen>
  );
}
