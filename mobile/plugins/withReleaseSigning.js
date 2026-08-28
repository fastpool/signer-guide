const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs release builds with a real key, or with nothing at all.
 *
 * `expo prebuild` writes `release { signingConfig signingConfigs.debug }` and a
 * comment asking you to fix it. That is the most dangerous default in the
 * project: `assembleRelease` then produces an APK signed with Android's
 * *shared debug key* and says nothing, and the identity of a published app is
 * its signing certificate. Publishing one to Zapstore or Play would bind this
 * app to a key everybody has, permanently — no properly signed update could
 * ever reach those installs.
 *
 * `android/` is generated and gitignored, so editing it by hand lasts until the
 * next prebuild. This is a plugin so the fix survives.
 *
 * Two outcomes, and neither is a debug-signed release:
 *
 *   properties set   signed with the release keystore
 *   properties unset signed with nothing — an `-unsigned.apk` that cannot be
 *                    installed or published by accident
 *
 * The second is what CI wants: Bitrise builds, then its own `sign-apk` step
 * applies the keystore from `BITRISEIO_ANDROID_KEYSTORE_*`.
 *
 * The properties come from `~/.signer-guide-keystore/credentials.env` — see
 * `store/README.md`. They are never in this repository.
 */
const SIGNING_CONFIG = `
        release {
            // Injected by plugins/withReleaseSigning.js. Absent properties
            // leave this null on purpose, which yields an unsigned APK rather
            // than a debug-signed one pretending to be a release.
            if (project.hasProperty('SIGNER_GUIDE_STORE_FILE')) {
                storeFile file(project.property('SIGNER_GUIDE_STORE_FILE'))
                storePassword project.property('SIGNER_GUIDE_STORE_PASSWORD')
                keyAlias project.property('SIGNER_GUIDE_KEY_ALIAS')
                keyPassword project.property('SIGNER_GUIDE_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;

    if (!gradle.includes('SIGNER_GUIDE_STORE_FILE')) {
      const anchor = 'signingConfigs {';
      const at = gradle.indexOf(anchor);
      if (at === -1) throw new Error('No signingConfigs block to add to');
      gradle =
        gradle.slice(0, at + anchor.length) +
        SIGNING_CONFIG +
        gradle.slice(at + anchor.length);
    }

    /*
     * The line this plugin exists for. Replacing it rather than appending,
     * because a second `signingConfig` in the same block would just be the
     * debug one again with extra steps.
     */
    gradle = gradle.replace(
      /release \{\s*\n(\s*)\/\/ Caution![\s\S]*?signingConfig signingConfigs\.debug/,
      (whole, indent) =>
        whole
          .replace(/\/\/ Caution![\s\S]*?signed-apk-android\.\n\s*/, '')
          .replace(
            'signingConfig signingConfigs.debug',
            [
              '// See plugins/withReleaseSigning.js. Null without the keystore',
              `${indent}// properties, which is an unsigned APK rather than a`,
              `${indent}// debug-signed one.`,
              `${indent}signingConfig project.hasProperty('SIGNER_GUIDE_STORE_FILE')`,
              `${indent}    ? signingConfigs.release`,
              `${indent}    : null`,
            ].join('\n'),
          ),
    );

    mod.modResults.contents = gradle;
    return mod;
  });
};
