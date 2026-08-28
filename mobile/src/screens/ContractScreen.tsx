import { View } from 'react-native';
import { localizeProfile } from '@guide/lib/profile-i18n';
import { templateFor } from '@guide/lib/templates';
import {
  joinableSigners,
  stakedUstx,
  templatesFrom,
  templateStakedUstx,
} from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { stxShort } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import { Card, Field, Note, Row, Screen, Section, Text } from '../ui';
import FeatureList from '../components/FeatureList';
import Identicon from '../components/Identicon';
import SignerRow from '../components/SignerRow';
import type { ScreenProps } from '../navigation-types';

/**
 * One contract, and the pools that run it — the second of the two choices.
 *
 * `choosing` is set when this screen was reached on the way to staking. It
 * changes what the pool list is for, and so what it contains: on the way to
 * staking, a pool that is not registered or will not take a stake from a
 * stranger is not an option, and is left out rather than offered and then
 * refused by the chain. Reached from the browse-everything side, the list is
 * the whole group, because that is what it claims to be.
 */
export default function ContractScreen({ route, navigation }: ScreenProps<'Contract'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const t = useT();
  const templates = templatesFrom(snapshot);
  const template = templateFor(templates, route.params.profileId);
  const choosing = route.params.choosing ?? false;

  if (!template) {
    return (
      <Screen testID='contract-screen'>
        <Note>{t('contract.missing')}</Note>
      </Screen>
    );
  }

  const profile = localizeProfile(template.profile, locale);
  const pools = choosing
    ? joinableSigners(template, snapshot.totals)
    : [...template.signers].sort((a, b) => a.contractId.localeCompare(b.contractId));
  const hidden = template.signers.length - pools.length;
  const count = template.signers.length;

  return (
    <Screen testID='contract-screen'>
      <Row gap={space.md}>
        <Identicon hash={template.identiconHash} size={48} />
        <View style={{ flexShrink: 1 }}>
          <Text variant='title' accessibilityRole='header' testID='contract-name'>
            {profile.name}
          </Text>
          <Text variant='small' tone='faint'>
            {t(count === 1 ? 'contract.runByOne' : 'contract.runBy', { count })} ·{' '}
            {t('contracts.staked', {
              amount: stxShort(templateStakedUstx(template, snapshot.totals), locale),
            })}
          </Text>
        </View>
      </Row>

      <Card>
        <Text variant='body' tone='muted' style={{ lineHeight: 22 }}>
          {profile.detail}
        </Text>
        <FeatureList template={template} testID='contract-features' />
      </Card>

      {template.identiconOutliers > 0 ? (
        <Note tone='warn'>
          {t('contract.identiconOutliers', { count: template.identiconOutliers })}
        </Note>
      ) : null}

      <Section
        title={choosing ? t('contract.choosePool') : t('contract.poolsRunning')}
        testID='contract-pools'
      >
        {choosing ? <Note>{t('contract.chooseIntro')}</Note> : null}
        {pools.map((signer) => (
          <SignerRow
            key={signer.contractId}
            signer={signer}
            stakedUstx={stakedUstx(snapshot.totals, signer.contractId)}
            testID={`pool-${signer.contractId}`}
            onPress={() => navigation.navigate('Pool', { contractId: signer.contractId })}
          />
        ))}
        {pools.length === 0 ? (
          <Card>
            <Field label={t('contract.noPool')} value={t('contract.noPoolBody')} />
          </Card>
        ) : null}
        {hidden > 0 ? (
          <Note tone='faint'>
            {t(hidden === 1 ? 'contract.hiddenOne' : 'contract.hidden', {
              count: hidden,
            })}
          </Note>
        ) : null}
      </Section>
    </Screen>
  );
}
