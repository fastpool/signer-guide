import { View } from 'react-native';
import { localizeProfile } from '@guide/lib/profile-i18n';
import { useSnapshot } from '../data/snapshot';
import { templatesFrom, templateStakedUstx } from '../data/signers';
import { stxShort } from '../format';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { space } from '../theme';
import { Note, Row, Screen, Text, TouchCard } from '../ui';
import FeatureList from '../components/FeatureList';
import Identicon from '../components/Identicon';
import type { ScreenProps } from '../navigation-types';

/**
 * The first of the two choices: which contract.
 *
 * Forty-five deployed signer contracts run six distinct pieces of code
 * between them, which is why this list comes before the pool list rather than
 * after it. A signer contract is what decides how rewards are distributed —
 * whether they can go to a Bitcoin address at all, whether the fee is capped
 * — and the pool is then a choice of who to trust to run that code.
 *
 * It decides nothing about the STX itself, which stays locked in the staker's
 * own wallet whichever contract they pick. That distinction is worth keeping
 * in the copy: "what the pool may do with your stake" says the pool holds it,
 * and it does not.
 *
 * Ordered by how many pools run each, so the code a reader is most likely to
 * have already met is first.
 */
export default function ChooseContractScreen({
  navigation,
}: ScreenProps<'ChooseContract'>) {
  const { snapshot } = useSnapshot();
  const { locale } = useSettings();
  const t = useT();
  const templates = templatesFrom(snapshot);

  return (
    <Screen testID='choose-contract-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header'>
          {t('contracts.title')}
        </Text>
        <Note>{t('contracts.intro')}</Note>
      </View>

      {templates.map((template) => {
        const staked = templateStakedUstx(template, snapshot.totals);
        const profile = localizeProfile(template.profile, locale);
        const count = template.signers.length;
        return (
          <TouchCard
            key={template.profile.id}
            testID={`template-${template.profile.id}`}
            accessibilityLabel={profile.name}
            onPress={() =>
              navigation.navigate('Contract', {
                profileId: template.profile.id,
                choosing: true,
              })
            }
          >
            <Row gap={space.md}>
              <Identicon hash={template.identiconHash} size={40} />
              <View style={{ flexShrink: 1, gap: 2 }}>
                <Text
                  variant='heading'
                  testID={`template-${template.profile.id}-name`}
                >
                  {profile.name}
                </Text>
                <Text variant='small' tone='faint'>
                  {t(count === 1 ? 'contracts.poolCountOne' : 'contracts.poolCount', {
                    count,
                  })}{' '}
                  · {t('contracts.staked', { amount: stxShort(staked, locale) })}
                </Text>
              </View>
            </Row>
            <Text variant='small' tone='muted' style={{ lineHeight: 20 }}>
              {profile.summary}
            </Text>
            <FeatureList template={template} />
          </TouchCard>
        );
      })}
    </Screen>
  );
}
