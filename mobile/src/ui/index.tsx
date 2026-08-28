import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import {
  CARD_GAP,
  CARD_PADDING,
  fonts,
  LINE_HEIGHT,
  radius,
  SCREEN_GAP,
  space,
  type,
  type Palette,
} from '../theme';

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
  onPress,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  testID?: string;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'text';
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <RNText
      testID={testID}
      numberOfLines={numberOfLines}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : accessibilityRole}
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
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /**
   * Pinned below the scroll rather than at the end of it.
   *
   * The staking screens put their primary action here because it was
   * otherwise below four cards and off screen when the screen opened — the one
   * thing the screen exists to do was the one thing you could not see.
   */
  footer?: ReactNode;
}) {
  const colors = useColors();
  const ground = { backgroundColor: colors.bg };

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.screen, ground]} edges={['top']} testID={testID}>
        <KeyboardAvoiding>{children}</KeyboardAvoiding>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.screen, ground]} edges={['top']} testID={testID}>
      <KeyboardAvoiding>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollBody,
            footer ? { paddingBottom: space.xl } : null,
          ]}
          keyboardShouldPersistTaps='handled'
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoiding>
    </SafeAreaView>
  );
}

/**
 * Room for the keyboard, on every screen that has a field.
 *
 * Android is drawn edge to edge (`edgeToEdgeEnabled` in `gradle.properties`),
 * and edge to edge means the window no longer resizes under the keyboard the
 * way `adjustResize` in the manifest asks it to — the keyboard is simply drawn
 * over the app, which is how the watch-address field came to be typed into
 * from behind a keyboard.
 *
 * Padding rather than a shrunken window: the keyboard's height goes on as
 * bottom padding, which shortens the scroll view inside it, and a shortened
 * scroll view brings its focused field back into view on both platforms. A
 * pinned footer is inside it too, so the button that submits what was typed
 * rises with the field rather than staying under the keyboard.
 */
function KeyboardAvoiding({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior='padding'>
      {children}
    </KeyboardAvoidingView>
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
        cardSurface(colors, raised),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A card sits on a shadow in light and on nothing in dark.
 *
 * The web guide's cards are white on cream with a one-pixel shadow and no
 * border, and that is what is copied here. In dark there is no shadow to
 * copy — `card` against `bg` is already the separation, and a shadow under a
 * dark card on a darker ground is a smudge.
 */
function cardSurface(colors: Palette, raised = false): ViewStyle {
  const base: ViewStyle = {
    backgroundColor: raised ? colors.cardRaised : colors.card,
  };
  if (colors.scheme === 'dark') return base;
  return {
    ...base,
    shadowColor: '#2c2a35',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  };
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
        cardSurface(colors, pressed),
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

  /*
   * The primary action is grape, not amber. Amber means "this is money" —
   * every figure paid in sats is amber — and a colour that means two things
   * means neither.
   */
  const fill: ViewStyle =
    kind === 'primary'
      ? { backgroundColor: colors.stx, minHeight: 52 }
      : kind === 'secondary'
        ? { backgroundColor: colors.cardRaised }
        : kind === 'danger'
          ? {
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderColor: colors.bad,
            }
          : { backgroundColor: 'transparent', minHeight: 40 };

  const label =
    kind === 'primary'
      ? colors.onAccent
      : kind === 'danger'
        ? colors.bad
        : kind === 'quiet'
          ? colors.stx
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

/**
 * A soft fill behind the matching text, rather than an outline.
 *
 * The web guide's badges are a tinted ground with the colour's own text on
 * top, and an outline at this size reads as a mistake beside them. `muted` has
 * no tint of its own, so it borrows the neutral one.
 */
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
  const fills: Partial<Record<TextTone, string>> = {
    stx: colors.grapeSoft,
    good: colors.mintSoft,
    accent: colors.amberSoft,
    warn: colors.amberSoft,
    bad: colors.amberSoft,
  };
  return (
    <View
      testID={testID}
      style={[styles.pill, { backgroundColor: fills[name] ?? colors.cardRaised }]}
    >
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
    <Text variant='small' tone={tone} style={{ lineHeight: 13 * LINE_HEIGHT }}>
      {children}
    </Text>
  );
}

/**
 * A row you can press, with a chevron — the shape a list of destinations
 * takes.
 *
 * It replaces a column of quiet text buttons, which were the argument against
 * the stack navigator rather than for it: a text button is not a hit target,
 * and "everything else the guide knows" being hard to press is not the same
 * thing as it being lower down.
 */
export function ListRow({
  title,
  hint,
  value,
  onPress,
  testID,
  leading,
  first = false,
}: {
  title: string;
  hint?: string;
  /** Shown instead of a chevron — "Change", a current setting. */
  value?: string;
  onPress: () => void;
  testID?: string;
  leading?: ReactNode;
  /** The first row in a card has no hairline above it. */
  first?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      {leading}
      <View style={{ flexShrink: 1, flexGrow: 1, gap: 1 }}>
        <Text variant='body'>{title}</Text>
        {hint ? (
          <Text variant='small' tone='faint'>
            {hint}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant='small' tone='stx' style={{ fontFamily: fonts.bold }}>
          {value}
        </Text>
      ) : (
        <Text variant='heading' tone='stx'>
          ›
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The primary action, pinned to the bottom of a form.
 *
 * Both staking screens put it here for one reason: the button was below four
 * cards and off screen when the screen opened, so the thing the screen exists
 * to do was the one thing you could not see.
 */
export function StickyFooter({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.stickyFooter,
        { backgroundColor: colors.card, borderTopColor: colors.border },
      ]}
    >
      {children}
    </View>
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
  scrollBody: {
    padding: space.lg,
    gap: SCREEN_GAP,
    paddingBottom: space.xxl * 2,
  },
  label: { marginBottom: 1 },
  card: {
    borderRadius: radius.lg,
    padding: CARD_PADDING,
    gap: CARD_GAP,
  },
  button: {
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonOff: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { fontSize: 16.5, fontFamily: fonts.bold },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingVertical: space.sm,
  },
  stickyFooter: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  loading: { alignItems: 'center', gap: space.sm, padding: space.xl },
});
