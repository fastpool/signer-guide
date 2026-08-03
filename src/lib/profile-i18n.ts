import { BUNDLES, type Locale } from '../locales';
import type { ManagerProfile } from './profiles';

/**
 * A profile in the reader's language.
 *
 * The English copy is the source and lives beside the hash it describes, in
 * `src/data/profiles.json`. Other languages keep theirs in their own file, and
 * a profile with no translation yet falls back to the English rather than
 * disappearing.
 */
export function localizeProfile(
  profile: ManagerProfile,
  locale: Locale,
): ManagerProfile {
  const translated = BUNDLES[locale].profiles[profile.id];
  if (!translated) return profile;
  return {
    ...profile,
    name: translated.name ?? profile.name,
    summary: translated.summary,
    detail: translated.detail,
  };
}
