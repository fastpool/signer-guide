import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../settings';
import { radius, space, type, type Palette } from '../theme';

/**
 * The primitives, and the one place that knows what colour anything is.
 *
 * Layout lives in a `StyleSheet` because it never changes; colour is applied
 * inline from the palette in force, because it does. Splitting them that way
 * means switching to light does not rebuild a stylesheet — it re-renders with
 * different colours over the same geometry — and it means a screen that wants
 * one colour of its own asks `useColors()` for it rather than importing a
 * constant that would be wrong half the time.
 */

type TextTone =
  | 'default'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'stx'
  | 'good'
  | 'bad'
  | 'warn';
type TextVariant = keyof typeof type;

function tone(colors: Palette, name: TextTone): string {
  const map: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.muted,
    faint: colors.faint,
    accent: colors.accent,
    stx: colors.stx,
    good: colors.good,
    bad: colors.bad,
    warn: colors.warn,
  };
  return map[name];
}

export function Text({
  children,
  variant = 'body',
  tone: name = 'default',
  style,
  testID,
  numberOfLines,
  accessibilityRole,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  testID?: string;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'text';
}) {
  const colors = useColors();
  return (
    <RNText
      testID={testID}
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole}
      style={[type[variant], { color: tone(colors, name) }, style]}
    >
      {children}
    </RNText>
  );
}

/** A caption above a figure — always small, always quiet, always upper. */
export function Label({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text variant='tiny' tone='faint' testID={testID} style={styles.label}>
      {String(children).toUpperCase()}
    </Text>
  );
}

export function Screen({
  children,
  scroll = true,
  testID,
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const colors = useColors();
  const ground = { backgroundColor: colors.bg };

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.screen, ground]} edges={['top']} testID={testID}>
        {children}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.screen, ground]} edges={['top']} testID={testID}>
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps='handled'
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  testID,
  raised = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  raised?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: raised ? colors.cardRaised : colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A card you can press — the whole thing, not a button inside it. */
export function TouchCard({
  children,
  onPress,
  testID,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.cardRaised : colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled = false,
  busy = false,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const off = disabled || busy;

  const fill: ViewStyle =
    kind === 'primary'
      ? { backgroundColor: colors.accent }
      : kind === 'secondary'
        ? {
            backgroundColor: colors.cardRaised,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }
        : kind === 'danger'
          ? {
              backgroundColor: 'transparent',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.bad,
            }
          : { backgroundColor: 'transparent', minHeight: 40 };

  const label =
    kind === 'primary'
      ? colors.onAccent
      : kind === 'danger'
        ? colors.bad
        : colors.text;

  return (
    <Pressable
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        fill,
        off && styles.buttonOff,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={label} size='small' />
      ) : (
        <RNText style={[styles.buttonLabel, { color: label }]}>{title}</RNText>
      )}
    </Pressable>
  );
}

export function Pill({
  children,
  tone: name = 'muted',
  testID,
}: {
  children: ReactNode;
  tone?: TextTone;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <View testID={testID} style={[styles.pill, { borderColor: tone(colors, name) }]}>
      <Text variant='tiny' tone={name}>
        {children}
      </Text>
    </View>
  );
}

export function Row({
  children,
  gap = space.sm,
  style,
  wrap = false,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap },
        wrap && { flexWrap: 'wrap' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A labelled figure, the shape most of this app is made of. */
export function Field({
  label,
  value,
  tone = 'default',
  testID,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: TextTone;
  testID?: string;
  hint?: string;
}) {
  return (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant='heading' tone={tone} testID={testID}>
          {value}
        </Text>
      ) : (
        value
      )}
      {hint ? (
        <Text variant='small' tone='faint'>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

/**
 * The heading over a group of cards. Sections are how "less prominent" is
 * built: everything that is not the stake or the rate lives under one.
 */
export function Section({
  title,
  children,
  action,
  testID,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={{ gap: space.sm }} testID={testID}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant='tiny' tone='faint' accessibilityRole='header'>
          {title.toUpperCase()}
        </Text>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Note({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: TextTone;
}) {
  return (
    <Text variant='small' tone={tone} style={{ lineHeight: 19 }}>
      {children}
    </Text>
  );
}

export function Loading({ label, testID }: { label?: string; testID?: string }) {
  const colors = useColors();
  return (
    <View style={styles.loading} testID={testID}>
      <ActivityIndicator color={colors.muted} />
      {label ? (
        <Text variant='small' tone='faint'>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** One of a small set of choices — appearance, language, a lock period. */
export function Choice({
  label,
  selected,
  onPress,
  testID,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Button
      title={label}
      kind={selected ? 'primary' : 'secondary'}
      onPress={onPress}
      testID={testID}
      style={[{ minHeight: 40, paddingHorizontal: space.md }, style]}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollBody: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  label: { marginBottom: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonOff: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  loading: { alignItems: 'center', gap: space.sm, padding: space.xl },
});
