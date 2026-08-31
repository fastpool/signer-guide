import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { satsLabel } from '@guide/lib/amounts';
import { profileById } from '@guide/lib/profiles';
import { localizeProfile } from '@guide/lib/profile-i18n';
import { lastRotation } from '@guide/lib/key-rotations';
import { groupsForContract } from '@guide/lib/signer-groups';
import { templateFor } from '@guide/lib/templates';
import { poolName, signerFor, stakedUstx, templatesFrom } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { useWallet } from '../wallet/context';
import { shortAddress, stxShort } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Field,
  Label,
  ListRow,
  Note,
  Pill,
  Row,
  Screen,
  Section,
  Text,
} from '../ui';
import ConductCard from '../components/ConductCard';
import FeatureList from '../components/FeatureList';
import Identicon from '../components/Identicon';
import type { ScreenProps } from '../navigation-types';

/**
 * One pool.
 *
 * The staking button is the point of the screen, so it is above everything
 * that qualifies it; the identity of the code — which contract, which key,
 * what the guide has and has not read — is under it, where somebody who wants
 * to check will look and nobody else has to.
 */
export default function PoolScreen({ route, navigation }: ScreenProps<'Pool'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const t = useT();
  const wallet = useWallet();
  const { contractId } = route.params;
  const signer = signerFor(snapshot, contractId);

  if (!signer) {
    return (
      <Screen testID='pool-screen'>
        <Note>{t('pool.missing')}</Note>
        <Text variant='mono' tone='faint'>
          {contractId}
        </Text>
      </Screen>
    );
  }

  const { name, guessed } = poolName(signer, contractId);
  const template = signer.profileId
    ? templateFor(templatesFrom(snapshot), signer.profileId)
    : null;
  const rawProfile = signer.profileId ? profileById(signer.profileId) : null;
  const profile = rawProfile ? localizeProfile(rawProfile, locale) : null;
  const now = stakedUstx(snapshot.totals, contractId);
  const next = snapshot.totals.next?.ustx?.[contractId];
  const joinable = signer.registered && signer.openToAnyone;
  /*
   * Who else signs with this key. A pool holding four percent is a small
   * signer; a pool holding four percent whose operator holds four more under
   * two other keys is not, and this is the only place in the app that says so.
   */
  const groups = groupsForContract(contractId, signer.signerKey);
  /*
   * A pool that has rotated its key has a new key holding nothing and an old
   * key holding this cycle's seat — signing, or not signing, for a fortnight.
   * The card is told about both so it can show the one that is actually being
   * asked to answer.
   */
  const rotation = lastRotation(contractId);

  return (
    <Screen testID='pool-screen'>
      <Row gap={space.md}>
        <Identicon hash={signer.identiconHash} size={48} />
        <View style={{ flexShrink: 1 }}>
          <Text
            variant='title'
            accessibilityRole='header'
            testID='pool-name'
            style={guessed ? { fontStyle: 'italic' } : undefined}
          >
            {name}
          </Text>
          {guessed ? (
            <Text variant='small' tone='faint'>
              {t('pool.guessedName')}
            </Text>
          ) : null}
        </View>
      </Row>

      <Card>
        <Row gap={space.xl} wrap>
          <Field
            label={t('pool.stakedCycle', { cycle: snapshot.totals.cycle })}
            value={stxShort(now, locale)}
            tone='stx'
            testID='pool-staked'
          />
          {snapshot.totals.next ? (
            <Field
              label={t('pool.nextCycle', { cycle: snapshot.totals.next.cycle })}
              value={stxShort(
                typeof next === 'string' && /^\d+$/.test(next) ? BigInt(next) : null,
                locale,
              )}
              tone='muted'
              testID='pool-staked-next'
            />
          ) : null}
          <Field
            label={t('pool.fee')}
            value={
              signer.feeBips === null || signer.feeBips === undefined
                ? t('common.notKnown')
                : `${signer.feeBips / 100}%`
            }
            testID='pool-fee'
          />
        </Row>

        {joinable ? (
          <Button
            title={
              wallet.canSign
                ? t('pool.stakeWith', { pool: name })
                : t('pool.stakeGeneric')
            }
            testID='pool-stake'
            onPress={() => navigation.navigate('Stake', { contractId })}
          />
        ) : (
          <Note tone='warn'>
            {signer.registered ? t('pool.notOpen') : t('pool.notRegistered')}
          </Note>
        )}
      </Card>

      <Section title={t('pool.contractSection')}>
        <Card>
          {profile && template ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant='heading'>{profile.name}</Text>
                <Button
                  title={t('pool.readIt')}
                  kind='quiet'
                  testID='pool-contract'
                  onPress={() =>
                    navigation.navigate('Contract', { profileId: profile.id })
                  }
                />
              </Row>
              <Text variant='small' tone='muted' style={{ lineHeight: 20 }}>
                {profile.summary}
              </Text>
              <FeatureList template={template} />
            </>
          ) : (
            <Note tone='warn'>{t('pool.unreviewed')}</Note>
          )}
        </Card>
      </Section>

      {/*
        Under the stake button and above the contract: a reader who has just
        been told what this pool holds asks next whether the node behind it
        turns up. It is one request and it fails on its own.
      */}
      <ConductCard signerKey={signer.signerKey} rotatedFrom={rotation?.from} />

      {rotation ? (
        <Card testID='pool-rotated'>
          <Note>
          {t('conduct.rotated', {
            when: rotation.observedAt.slice(0, 10),
            cycle: rotation.cycle ?? '—',
          })}
          </Note>
        </Card>
      ) : null}

      {groups.length > 0 ? (
        <Section title={t('groups.partOf')}>
          <Card style={{ gap: 0 }}>
            {groups.map((group, index) => (
              <ListRow
                key={group.id}
                first={index === 0}
                title={group.name}
                hint={t(`groups.kind.${group.kind}`)}
                onPress={() => navigation.navigate('Group', { groupId: group.id })}
                testID={`pool-group-${group.id}`}
              />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={t('pool.identity')}>
        <Card>
          <Copyable
            label={t('pool.contractId')}
            value={contractId}
            copy={t('common.copy')}
            testID='pool-contract-id'
          />
          <Divider />
          {signer.signerKey ? (
            <Copyable
              label={t('pool.signerKey')}
              value={signer.signerKey}
              copy={t('common.copy')}
              testID='pool-key'
            />
          ) : (
            <Field label={t('pool.signerKey')} value={t('pool.noSignerKey')} />
          )}
          <Divider />
          <Row gap={space.sm} wrap>
            <Pill tone={signer.registered ? 'good' : 'warn'}>
              {signer.registered ? t('pool.registered') : t('pool.notRegisteredPill')}
            </Pill>
            {signer.firstSeenCycle ? (
              <Pill>{t('pool.firstSeen', { cycle: signer.firstSeenCycle })}</Pill>
            ) : null}
            <Pill>{t('pool.match', { match: signer.match ?? 'none' })}</Pill>
          </Row>
          <Row gap={space.xl} wrap>
            <Field
              label={t('pool.undistributed')}
              value={satsLabel(
                signer.undistributedSats ? BigInt(signer.undistributedSats) : null,
                locale,
              )}
            />
            <Field
              label={t('pool.unclaimed')}
              value={satsLabel(
                signer.unclaimedFromPoxSats
                  ? BigInt(signer.unclaimedFromPoxSats)
                  : null,
                locale,
              )}
              hint={
                signer.unclaimedFromCycle
                  ? t('pool.unclaimedAsOf', { cycle: signer.unclaimedFromCycle })
                  : undefined
              }
            />
          </Row>
        </Card>
      </Section>
    </Screen>
  );
}

function Copyable({
  label,
  value,
  copy,
  testID,
}: {
  label: string;
  value: string;
  copy: string;
  testID?: string;
}) {
  return (
    <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
      <View style={{ flexShrink: 1 }}>
        <Label>{label}</Label>
        <Text variant='mono' tone='muted' testID={testID} numberOfLines={1}>
          {value.length > 40 ? shortAddress(value, 14, 12) : value}
        </Text>
      </View>
      <Button
        title={copy}
        kind='quiet'
        onPress={() => void Clipboard.setStringAsync(value)}
      />
    </Row>
  );
}
