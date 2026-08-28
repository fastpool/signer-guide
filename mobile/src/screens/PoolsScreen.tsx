import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { allSigners, stakedUstx } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { useT } from '../i18n';
import { useColors } from '../settings';
import { radius, space } from '../theme';
import { Note, Screen, Text } from '../ui';
import SignerRow from '../components/SignerRow';
import type { ScreenProps } from '../navigation-types';

/**
 * Every pool, biggest first.
 *
 * This is the list the guide leads with on the web and this app does not: on a
 * phone it is forty-five rows of things somebody has to already know to use.
 * It is here in full, one tap from the home screen, and not on it.
 */
export default function PoolsScreen({ navigation }: ScreenProps<'Pools'>) {
  const { snapshot } = useSnapshot();
  const colors = useColors();
  const t = useT();
  const [query, setQuery] = useState('');

  const signers = useMemo(() => {
    const all = allSigners(snapshot);
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (signer) =>
        signer.displayName.toLowerCase().includes(needle) ||
        signer.contractId.toLowerCase().includes(needle) ||
        (signer.implementationName ?? '').toLowerCase().includes(needle),
    );
  }, [snapshot, query]);

  return (
    <Screen testID='pools-screen'>
      <View style={{ gap: space.xs }}>
        <Text variant='title' accessibilityRole='header'>
          {t('pools.title')}
        </Text>
        <Text variant='small' tone='faint'>
          {t('pools.subtitle', { count: snapshot.signers.signers.length })}
        </Text>
      </View>

      <TextInput
        testID='pools-search'
        value={query}
        onChangeText={setQuery}
        placeholder={t('pools.search')}
        placeholderTextColor={colors.faint}
        autoCapitalize='none'
        autoCorrect={false}
        style={[
          styles.search,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
      />

      {signers.length === 0 ? (
        <Note>{t('pools.noMatch', { query: query.trim() })}</Note>
      ) : null}

      {signers.map((signer) => (
        <SignerRow
          key={signer.contractId}
          signer={signer}
          stakedUstx={stakedUstx(snapshot.totals, signer.contractId)}
          testID={`pools-row-${signer.contractId}`}
          onPress={() =>
            navigation.navigate('Pool', { contractId: signer.contractId })
          }
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
