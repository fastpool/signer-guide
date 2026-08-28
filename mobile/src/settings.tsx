import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { isLocale, type Locale } from '@guide/lib/i18n';
import { PALETTES, type Palette, type Scheme } from './theme';

/**
 * The two things a reader is allowed to decide about the app itself.
 *
 * Both are read off the device before anything is drawn and written back the
 * moment they change, so a preference survives a restart. Neither is sent
 * anywhere: this app has no server to send them to.
 *
 * `system` is the default for appearance rather than `dark`, because a phone
 * already knows whether it is being held in the sun. It is a third state and
 * not the absence of a choice — somebody who has picked `dark` should stay in
 * the dark when their phone switches at sunset.
 */

export type Appearance = Scheme | 'system';

const APPEARANCE_KEY = 'signer-guide:appearance:v1';
const LOCALE_KEY = 'signer-guide:locale:v1';

export type Settings = {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  /** What `appearance` resolves to right now, the system included. */
  scheme: Scheme;
  colors: Palette;
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** True until both preferences have been read off the device. */
  loading: boolean;
};

const SettingsContext = createContext<Settings | null>(null);

function isAppearance(value: string | null): value is Appearance {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function SettingsProvider({
  children,
  /** Only for the tests, which need a known starting point. */
  initial,
}: {
  children: ReactNode;
  initial?: { appearance?: Appearance; locale?: Locale };
}) {
  const systemScheme = useColorScheme();
  const [appearance, setStoredAppearance] = useState<Appearance>(
    initial?.appearance ?? 'system',
  );
  const [locale, setStoredLocale] = useState<Locale>(initial?.locale ?? 'en');
  const [loading, setLoading] = useState(initial === undefined);

  useEffect(() => {
    if (initial !== undefined) return;
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(APPEARANCE_KEY),
      AsyncStorage.getItem(LOCALE_KEY),
    ])
      .then(([storedAppearance, storedLocale]) => {
        if (cancelled) return;
        if (isAppearance(storedAppearance)) setStoredAppearance(storedAppearance);
        if (storedLocale && isLocale(storedLocale)) setStoredLocale(storedLocale);
      })
      // A store that will not answer costs the preference, not the app.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // On mount alone: `initial` is a test fixture and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setStoredAppearance(next);
    void AsyncStorage.setItem(APPEARANCE_KEY, next).catch(() => {});
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    void AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
  }, []);

  const scheme: Scheme =
    appearance === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : appearance;

  const value = useMemo<Settings>(
    () => ({
      appearance,
      setAppearance,
      scheme,
      colors: PALETTES[scheme],
      locale,
      setLocale,
      loading,
    }),
    [appearance, setAppearance, scheme, locale, setLocale, loading],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings outside a SettingsProvider');
  return value;
}

/** The palette in force. Most components want only this. */
export function useColors(): Palette {
  return useSettings().colors;
}
