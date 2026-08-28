/**
 * Two palettes, one set of roles — the web guide's colours.
 *
 * Nothing here is a hue this app invented. Every value below is one the site
 * already owns in `src/index.css`: cream, ink, grape, mint, amber. The point
 * of moving onto them is that somebody who has read the guide and then opens
 * the app should not have to work out that it is the same thing.
 *
 * Every colour is still a role rather than a hue, and the roles did not move:
 * `accent` is bitcoin and so is every figure paid in sats, `stx` is Stacks and
 * so is every amount of STX, `muted` is anything that qualifies a number
 * without being one. A palette is a complete set of answers to those roles, so
 * a new one cannot half-exist.
 *
 * One role changed meaning rather than value: the **primary action is grape**,
 * not amber. Amber is reserved for figures, so that the one colour that means
 * "this is money" is never also the colour of a button.
 */
export type Scheme = 'light' | 'dark';

export type Palette = {
  bg: string;
  card: string;
  cardRaised: string;
  border: string;
  text: string;
  /** Qualifiers, units, captions — present, never first. */
  muted: string;
  faint: string;
  /** Bitcoin, and so the rate and everything paid in sats. */
  accent: string;
  /** Stacks — every amount of STX, every primary action, the brand. */
  stx: string;
  good: string;
  warn: string;
  bad: string;
  /** Text on a grape-filled button. */
  onAccent: string;
  /* Soft fills, for pills and badges that carry a colour without shouting. */
  grapeSoft: string;
  mintSoft: string;
  amberSoft: string;
  /** The progress track and identicon tile — a shade below `cardRaised`. */
  trough: string;
  /** What the OS paints behind a status bar. */
  statusBar: 'light' | 'dark';
  /** Which palette this is. Cards carry a shadow in light and none in dark. */
  scheme: Scheme;
};

const light: Palette = {
  bg: '#fdf8f3',
  card: '#ffffff',
  cardRaised: '#f6f2ec',
  border: '#ebe6dd',
  text: '#2c2a35',
  muted: '#6b6577',
  faint: '#8b8697',
  accent: '#8a5a2b',
  stx: '#403374',
  good: '#2f7d62',
  warn: '#8a5a2b',
  bad: '#b32d1f',
  onAccent: '#ffffff',
  grapeSoft: '#ebe8f6',
  mintSoft: '#e3f3ec',
  amberSoft: '#fbeedd',
  trough: '#f1ece3',
  statusBar: 'dark',
  scheme: 'light',
};

/*
 * The same palette, not an inversion.
 *
 * Grape is deepened into the ground and cream lifted into the text, so the
 * app reads as the same product with the lights off rather than as a negative
 * of itself. Both figure colours are lightened until they clear 4.5:1 on
 * `card`: `#e2a15c` and `#b3a4f0` on `#1f1b2b`. That matters more here than in
 * most apps, because this one puts the accent colour on a 46-point number and
 * on 13-point body text in the same card.
 */
const dark: Palette = {
  bg: '#17141f',
  card: '#1f1b2b',
  cardRaised: '#282239',
  border: '#332c46',
  text: '#f6f2ea',
  muted: '#a49db4',
  faint: '#7d768e',
  accent: '#e2a15c',
  stx: '#b3a4f0',
  good: '#5cc79a',
  warn: '#e2a15c',
  bad: '#e88a7d',
  onAccent: '#17141f',
  grapeSoft: '#282239',
  mintSoft: 'rgba(92,199,154,0.14)',
  amberSoft: 'rgba(226,161,92,0.14)',
  trough: '#282239',
  statusBar: 'light',
  scheme: 'dark',
};

export const PALETTES: Record<Scheme, Palette> = { dark, light };

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Card padding and internal gap, which are not on the `space` scale. */
export const CARD_PADDING = 18;
export const CARD_GAP = 14;
/** The gap between cards down a screen. */
export const SCREEN_GAP = 14;

export const radius = {
  sm: 8,
  /** Inputs and inner blocks. */
  md: 14,
  /** Cards — the web's `rounded-3xl`. */
  lg: 24,
  pill: 999,
} as const;

/**
 * The web guide's type, as close as a phone gets.
 *
 * The site sets a rounded stack; iOS reaches SF Pro Rounded through
 * `fontFamily: 'System'`, and Android has no rounded system face at all — so
 * Nunito ships with the app and both platforms get the same letterforms. The
 * weights below are the real ones, not synthesised: `fontWeight` on a custom
 * family is ignored on Android, so each variant names the file it wants.
 */
export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export const type = {
  hero: { fontSize: 46, fontFamily: fonts.extrabold, letterSpacing: -1.6 },
  title: { fontSize: 25, fontFamily: fonts.extrabold, letterSpacing: -0.6 },
  heading: { fontSize: 15.5, fontFamily: fonts.bold },
  body: { fontSize: 14.5, fontFamily: fonts.regular },
  small: { fontSize: 13, fontFamily: fonts.regular },
  tiny: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 0.9 },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
} as const;

/** Body copy inside a card breathes at one and a half times its size. */
export const LINE_HEIGHT = 1.5;
