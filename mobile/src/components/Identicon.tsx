import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { identiconSvg, isIdenticonHash } from '@guide/lib/identicon';
import { useT } from '../i18n';
import { useColors } from '../settings';
import { radius } from '../theme';
import { Text } from '../ui';

/**
 * The icon of a contract's code (SIP-043), drawn from the same seed and by the
 * same library as the web guide — so a pool recognised by its icon there is
 * recognised by the same icon here.
 *
 * With no hash there is a marked-out placeholder rather than nothing. That
 * case means one thing: this code is new, nobody has standardised it yet. A
 * blank reads as a missing image and an invented pattern would be a false
 * claim about which code this is, so the placeholder is deliberately not a
 * grid — dashed and amber, this app's colour for what it has not checked.
 */
/**
 * Drawn once per hash, for as long as the app is open.
 *
 * `identiconSvg` is deterministic — the seed is a hash — and the pool list asks
 * for forty-five of them at once, then again for every row that scrolls back
 * into view. Nothing in it depends on the palette or the language, so the
 * answer is kept.
 */
const drawn = new Map<string, string>();

function svgFor(hash: string): string {
  const cached = drawn.get(hash);
  if (cached !== undefined) return cached;
  const svg = identiconSvg(hash);
  drawn.set(hash, svg);
  return svg;
}

function Identicon({
  hash,
  size = 36,
  testID,
}: {
  hash: string | null;
  size?: number;
  testID?: string;
}) {
  const colors = useColors();
  const t = useT();

  if (!isIdenticonHash(hash)) {
    return (
      <View
        testID={testID}
        accessibilityRole='image'
        accessibilityLabel={t('identicon.new')}
        style={[
          styles.placeholder,
          {
            width: size,
            height: size,
            borderRadius: radius.md,
            borderColor: colors.warn,
          },
        ]}
      >
        <Text variant='tiny' tone='warn'>
          ?
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole='image'
      accessibilityLabel={t('identicon.label')}
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: colors.cardRaised,
        },
      ]}
    >
      <SvgXml xml={svgFor(hash)} width='100%' height='100%' />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { padding: 2, overflow: 'hidden' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});

/*
 * Memoised on its two props: a row that scrolls past has nothing new to draw.
 */
export default memo(Identicon);
