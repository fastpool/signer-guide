/**
 * Two palettes, one set of roles.
 *
 * The app was dark-only to begin with, for a reason that still holds: the
 * numbers on the first screen are read in a second and acted on, and a screen
 * whose contrast moves under them makes that second longer. What changed is
 * that "dark" is not the same choice for everybody — a phone held in the sun
 * is a different problem from one held in bed — so the choice is the reader's,
 * and the roles below are what stay fixed.
 *
 * Every colour is a role rather than a hue: `accent` is bitcoin and so is
 * every figure paid in sats, `stx` is every amount of STX, `muted` is anything
 * that qualifies a number without being one. A palette is a complete set of
 * answers to those roles, so a new one cannot half-exist.
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
  /** Stacks, and so amounts of STX. */
  stx: string;
  good: string;
  warn: string;
  bad: string;
  /** Text on an accent-filled button. */
  onAccent: string;
  /** What the OS paints behind a keyboard and a status bar. */
  statusBar: 'light' | 'dark';
};

const dark: Palette = {
  bg: '#0B0D12',
  card: '#151922',
  cardRaised: '#1D2230',
  border: '#252B3A',
  text: '#E8ECF3',
  muted: '#8B97AB',
  faint: '#5C6678',
  accent: '#F7931A',
  stx: '#7C6BFF',
  good: '#34D399',
  warn: '#FBBF24',
  bad: '#F87171',
  onAccent: '#1A1206',
  statusBar: 'light',
};

/*
 * Not the dark palette inverted.
 *
 * `#F7931A` is bitcoin's orange and it is legible as a 44-point figure on
 * white; it is not legible as 13-point body text on white, and this app puts
 * the accent colour on both. So the light palette darkens it to a shade that
 * clears 4.5:1 against the card and keeps the same hue — the figure still
 * reads as bitcoin, and the caption under it can still be read.
 *
 * The same applies to `good`, `warn` and `bad`: each is the darkest version of
 * itself that still reads as the colour it is meant to be.
 */
const light: Palette = {
  bg: '#FAF9F6',
  card: '#FFFFFF',
  cardRaised: '#F2F0EA',
  border: '#E4E0D6',
  text: '#191A20',
  muted: '#5B6070',
  faint: '#868B99',
  accent: '#A85D00',
  stx: '#4B39C8',
  good: '#0B7A50',
  warn: '#8A5B00',
  bad: '#B32D1F',
  onAccent: '#FFFFFF',
  statusBar: 'dark',
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

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const type = {
  hero: { fontSize: 44, fontWeight: '700' as const, letterSpacing: -1 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  tiny: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.6 },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
} as const;
