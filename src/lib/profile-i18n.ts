import { BUNDLES, type Locale } from '../locales';
import { profileFor, type ManagerProfile } from './profiles';

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

/**
 * What to call the contract type a pool runs, in the reader's language.
 *
 * The name lives in `src/data/profiles.json`. `implementationName` in
 * `signers.json` is a copy of it, taken when the data was generated — the
 * generator writes `profile?.name`, and `manual-data` is forbidden from
 * touching it — so it says nothing the profile does not.
 *
 * The profile is the one to ask, for two reasons. The copy is a refresh out of
 * date the moment a profile is renamed. And the copy is only ever the English
 * name, which is how a Korean reader came to be told their pool runs the
 * "Invite-only 서명자 컨트랙트" and then taken to a page headed 초대 전용.
 *
 * The copy is still the answer when the profile is not one this build knows.
 * The phone fetches `signers.json` and bundles `profiles.json`, so an
 * installed app that predates a contract type holds data naming a profile it
 * has never heard of. The name that came with the data is worth more there
 * than the alternative, which is telling somebody their pool runs code nobody
 * has reviewed.
 *
 * Null is "there is no name for this", which the callers word as such.
 */
export function contractTypeName(
  signer: {
    groupSha256: string;
    implementationName: string | null;
  },
  locale: Locale,
): string | null {
  const profile = profileFor(signer.groupSha256);
  if (!profile) return signer.implementationName;
  return localizeProfile(profile, locale).name;
}
