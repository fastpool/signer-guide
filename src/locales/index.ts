import { en } from './en';
import { ko } from './ko';

/**
 * Every language the guide speaks. Adding one means adding a file here and
 * nothing else: the bundle carries its own date format, its own way of saying
 * large numbers, and its own profile copy.
 */
export const BUNDLES = { en, ko };

export type Locale = keyof typeof BUNDLES;

/** Switcher order, and the order a missing translation falls back through. */
export const LOCALES: readonly Locale[] = ['en', 'ko'];

/** The language the messages are authored in; every other one falls back to it. */
export const DEFAULT_LOCALE: Locale = 'en';

export type {
  AmountScaleStep,
  LocaleBundle,
  MessageKey,
  Messages,
  PluralKey,
  ProfileTranslation,
} from './en';
