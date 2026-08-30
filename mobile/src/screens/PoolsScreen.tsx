import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { contractTypeName } from '@guide/lib/profile-i18n';
import type { Signer } from '@guide/lib/types';
import { allSigners, stakedUstx } from '../data/signers';
import { useSnapshot } from '../data/snapshot';
import { useT } from '../i18n';
import { useColors, useSettings } from '../settings';
import { radius, SCREEN_GAP, space } from '../theme';
import { Note, Screen, Text } from '../ui';
import SignerRow from '../components/SignerRow';
import type { ScreenProps } from '../navigation-types';

/**
 * Every pool, biggest first.
 *
 * This is the list the guide leads with on the web and this app does not: on a
 * phone it is forty-five rows of things somebody has to already know to use.
 * It is here in full, one tap from the home screen, and not on it.
 *
 * A `FlatList` rather than forty-five rows inside a `ScrollView`, which is how
 * it was and why it took a moment to appear: every row was built, and every
 * identicon parsed, before the screen drew anything at all. Now the heading and
 * the search field paint immediately and the rows fill in behind them — the
 * waiting is the same length and there is something to look at through it.
 */
export default function PoolsScreen({ navigation }: ScreenProps<'Pools'>) {
  const { snapshot } = useSnapshot();
  const colors = useColors();
  const t = useT();
  const { locale } = useSettings();
  const [query, setQuery] = useState('');

  /*
   * The field updates on every keystroke; the list is allowed to lag behind
   * it. Typing into a filter over forty-five rows should never feel like
   * typing into treacle.
   */
  const deferredQuery = useDeferredValue(query);

  const signers = useMemo(() => {
    const all = allSigners(snapshot);
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (signer) =>
        signer.displayName.toLowerCase().includes(needle) ||
        signer.contractId.toLowerCase().includes(needle) ||
        // The contract type by the name the reader is being shown it under,
        // which in Korean is not the one in the data.
        (contractTypeName(signer, locale) ?? '').toLowerCase().includes(needle),
    );
  }, [snapshot, deferredQuery, locale]);

  const renderItem = useCallback(
    ({ item }: { item: Signer }) => (
      <SignerRow
        signer={item}
        stakedUstx={stakedUstx(snapshot.totals, item.contractId)}
        testID={`pools-row-${item.contractId}`}
        onPress={() => navigation.navigate('Pool', { contractId: item.contractId })}
      />
    ),
    [snapshot.totals, navigation],
  );

  return (
    <Screen testID='pools-screen' scroll={false}>
      <FlatList
        data={signers}
        keyExtractor={keyOf}
        renderItem={renderItem}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps='handled'
        /*
         * Six rows is about a screenful. Building the other thirty-nine before
         * showing any of them is the whole of the delay this replaces.
         */
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: SCREEN_GAP }}>
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
          </View>
        }
        ListEmptyComponent={
          <Note>{t('pools.noMatch', { query: query.trim() })}</Note>
        }
      />
    </Screen>
  );
}

function keyOf(signer: Signer): string {
  return signer.contractId;
}

const styles = StyleSheet.create({
  body: {
    padding: space.lg,
    gap: SCREEN_GAP,
    paddingBottom: space.xxl * 2,
  },
  search: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
