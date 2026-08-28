const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Lets the app ask Android whether a wallet is installed.
 *
 * From Android 11 an app sees only the packages it declares an interest in,
 * so `Linking.canOpenURL('xverse://…')` answers false for a wallet that is
 * sitting on the home screen. The wallet picker would then offer to open an
 * app that is there, or claim one is missing when it is not — so the two
 * schemes it asks about are declared here.
 *
 * `wc:` is the WalletConnect scheme itself, which is what a "any wallet"
 * choice hands to the system chooser.
 */
const SCHEMES = ['xverse', 'leather', 'okx', 'wc'];

module.exports = function withWalletQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.intent = queries.intent ?? [];

    for (const scheme of SCHEMES) {
      const already = queries.intent.some(
        (intent) => intent?.data?.[0]?.$?.['android:scheme'] === scheme,
      );
      if (already) continue;
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }

    return mod;
  });
};
