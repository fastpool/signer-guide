import { View } from 'react-native';
import {
  groupById,
  groupContracts,
  groupNodes,
  groupUstx,
  groupVotingPowerBips,
  groupsForContract,
} from '@guide/lib/signer-groups';
import { votingPowerBips } from '@guide/lib/signer-nodes';
import { poolName, stakedUstx } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { shortContract, stxShort } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import {
  Card,
  Divider,
  Field,
  Note,
  Row,
  Screen,
  Section,
  Text,
  TouchCard,
} from '../ui';
import Identicon from '../components/Identicon';
import type { ScreenProps } from '../navigation-types';

/**
 * One entity, and every signer node behind it.
 *
 * The headline is the only number in this app that the chain cannot check —
 * nothing on chain says who is behind a key — so the screen shows its work
 * instead of asking to be believed: which nodes were added together, what each
 * one holds, and the evidence the claim rests on, in full, at the bottom.
 *
 * A reader who does not accept the grouping can take the rows they do.
 */
export default function GroupScreen({ route, navigation }: ScreenProps<'Group'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const t = useT();
  const group = groupById(route.params.groupId);

  if (!group) {
    return (
      <Screen testID='group-screen'>
        <Note>{t('groups.missing')}</Note>
      </Screen>
    );
  }

  const signers = snapshot.signers.signers;
  const ustx = snapshot.totals.ustx;
  const nodes = groupNodes(group, signers);
  const contracts = groupContracts(group, signers);
  const bips = groupVotingPowerBips(group, signers, ustx);
  const staked = groupUstx(group, signers, ustx);
  const notes = group.members.filter((member) => member.note);

  return (
    <Screen testID='group-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header' testID='group-name'>
          {group.name}
        </Text>
        <Note>{group.summary}</Note>
      </View>

      <Card>
        <Row gap={space.xl} wrap>
          <Field
            label={t('groups.votingPower', { cycle: snapshot.totals.cycle })}
            value={bips === null ? t('groups.unknown') : `${(bips / 100).toFixed(2)}%`}
            tone='stx'
            testID='group-share'
          />
          <Field
            label={t('groups.staked')}
            value={stxShort(staked, locale)}
            testID='group-staked'
          />
          <Field
            label={t('groups.nodeCount')}
            value={String(nodes.length)}
          />
          <Field
            label={t('groups.contractCount')}
            value={String(contracts.length)}
          />
        </Row>
        <Divider />
        <Text variant='small' tone='muted'>
          {t(`groups.kindNote.${group.kind}`)}
        </Text>
      </Card>

      <Section title={t('groups.whatIsIn')}>
        {nodes.map((node) => {
          const nodeBips = votingPowerBips(node, ustx);
          /*
           * Whether the group takes the whole of a key or one contract on it.
           * The difference between "Xverse signs with this" and "Stacking DAO's
           * money sits in this", and the row says which rather than leaving it
           * to be inferred from the kind of the group.
           */
          const whole = group.members.some(
            (member) => member.signerKey === node.signerKey,
          );
          return (
            <Card key={node.signerKey ?? node.contracts[0].contractId}>
              <Row gap={space.md}>
                <Text variant='mono' tone='faint' numberOfLines={1} style={{ flexShrink: 1 }}>
                  {node.signerKey ?? node.contracts[0].contractId}
                </Text>
                <View style={{ marginLeft: 'auto' }}>
                  <Text variant='small'>
                    {nodeBips === null
                      ? t('groups.unknown')
                      : `${(nodeBips / 100).toFixed(2)}%`}
                  </Text>
                </View>
              </Row>

              {node.contracts.map((contract) => {
                const { name } = poolName(contract, contract.contractId);
                const also = groupsForContract(
                  contract.contractId,
                  contract.signerKey,
                ).filter((other) => other.id !== group.id);
                return (
                  <TouchCard
                    key={contract.contractId}
                    testID={`group-pool-${contract.contractId}`}
                    accessibilityLabel={name}
                    onPress={() =>
                      navigation.navigate('Pool', {
                        contractId: contract.contractId,
                      })
                    }
                  >
                    <Row gap={space.md}>
                      <Identicon hash={contract.identiconHash} size={28} />
                      <View style={{ flexShrink: 1, gap: 2 }}>
                        <Text variant='heading' numberOfLines={1}>
                          {name}
                        </Text>
                        <Text variant='tiny' tone='faint' numberOfLines={1}>
                          {shortContract(contract.contractId)}
                        </Text>
                      </View>
                      <View style={{ marginLeft: 'auto' }}>
                        <Text variant='small' tone='stx'>
                          {stxShort(
                            stakedUstx(snapshot.totals, contract.contractId),
                            locale,
                          )}
                        </Text>
                      </View>
                    </Row>
                    {also.length > 0 ? (
                      <Text variant='tiny' tone='faint'>
                        {t('groups.alsoIn', {
                          names: also.map((other) => other.name).join(', '),
                        })}
                      </Text>
                    ) : null}
                  </TouchCard>
                );
              })}

              <Text variant='tiny' tone='faint'>
                {whole ? t('groups.wholeNode') : t('groups.contractOnly')}
              </Text>
            </Card>
          );
        })}
      </Section>

      <Section title={t('groups.source')}>
        <Card>
          <Text variant='small' style={{ lineHeight: 20 }}>
            {group.source}
          </Text>
          {notes.length > 0 ? (
            <>
              <Divider />
              {notes.map((member) => (
                <View
                  key={member.contractId ?? member.signerKey}
                  style={{ gap: 2 }}
                >
                  <Text variant='tiny' tone='faint'>
                    {(member.contractId ?? member.signerKey ?? '').split('.')[1] ??
                      member.signerKey}
                  </Text>
                  <Text variant='small' tone='muted' style={{ lineHeight: 20 }}>
                    {member.note}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          <Note>{t('groups.sourceNote')}</Note>
        </Card>
      </Section>
    </Screen>
  );
}
