# Store listings

Everything three stores need, kept as files so that a listing is reviewable in
a pull request rather than retyped into three web forms.

```
store/
  play/en-US/        Google Play — fastlane supply layout
  appstore/en-US/    App Store Connect — fastlane deliver layout
  zapstore/          Zapstore (nostr) — zapstore.yaml
  screenshots/raw/   straight off the device, 1080×2340
  screenshots/play/  framed and captioned, 1080×1920
  privacy-policy.md  the one linked from all three
  data-safety.md     the answers to Play's Data safety form
```

The directory names are not arbitrary: `play/` and `appstore/` are laid out the
way `fastlane supply` and `fastlane deliver` expect, so both upload with no
argument beyond a path. `bitrise.yml` does exactly that.

## Screenshots

Captioned frames, alternating grape and cream so the strip reads as a set in
the store's carousel rather than as eight unrelated pictures. Each caption
makes one claim, in the order somebody scrolls a listing: what they get, how
little it takes, what it looks like running.

They are taken from the app actually running, against mainnet, and can be taken
again in a minute:

```bash
maestro test e2e/screenshots.yaml     # with the app installed and Metro up
node scripts/frame-screenshots.mjs    # needs ImageMagick 7
```

`e2e/screenshots.yaml` walks the app and captures eight screens; Maestro writes
them under `~/.maestro/tests/<run>/Screenshots/`, so copy them into
`screenshots/raw/`. The framing script crops the phone's status and navigation
bars, captions each one and bleeds the device off the bottom of a 1080×1920
frame. The reframing is not decoration: a 1080×2340 screenshot is 1:2.17, and
**Google Play rejects anything taller than 1:2** without looking at it.

The same script draws the **Play feature graphic** (1024×500) into
`play/en-US/images/`. It carries no screenshot — Play crops and overlays that
asset hard, so anything small in it is lost — and the rate figure on it is read
from `src/data/stx-only-calculations.json`, so it cannot claim a rate nobody is
paying.

The position on screen is a live mainnet staker holding 15,000,000 STX, opened
by share link. Nothing in any screenshot is anybody's private information —
it is a public position on a public chain, and no wallet is connected in any of
them.

### The App Store is not done here

Apple requires screenshots at iPhone display sizes, from an iOS build. There is
no iOS build in this repository yet and none can be made from Linux. When there
is one:

```bash
# on macOS, with the simulator running
maestro test e2e/screenshots.yaml
```

on a 6.9" simulator (1290×2796) and a 6.5" one (1242×2688), and drop the
results into `appstore/en-US/screenshots/`. Do not scale the Android ones up to
those sizes — Apple checks, and a screenshot of an Android status bar in an iOS
listing is a rejection with a week's delay attached.

## What each store limits

Checked against the files here; a listing that overruns is rejected at upload.

| Field                       | Limit | Ours |
| --------------------------- | ----- | ---- |
| Play title                  | 30    | 23   |
| Play short description      | 80    | 78   |
| Play full description       | 4000  | ~3000 |
| App Store name              | 30    | 23   |
| App Store subtitle          | 30    | 22   |
| App Store promotional text  | 170   | 155  |
| App Store keywords          | 100   | 86   |

## Zapstore

`zapstore/zapstore.yaml` describes the app for [Zapstore](https://zapstore.dev),
which publishes it as nostr events rather than to a review queue. What that
buys is provenance: `zsp` records the APK's own signing certificate in the
release event, so an update that is not signed by the same key is visibly not
the same app.

**The file is generated.** Its name, summary, description and release notes
come from the same text the Play and App Store listings are built from, so the
three cannot drift:

```bash
node scripts/make-zapstore-config.mjs
```

Publishing:

```bash
go install github.com/zapstore/zsp@latest
SIGN_WITH="bunker://…" zsp publish store/zapstore/zapstore.yaml --skip-metadata
```

`--skip-metadata` is not optional in spirit: without it `zsp` fetches metadata
from the Play Store and the repository and overwrites the listing above.

### `SIGN_WITH`

The one required variable. It takes any of:

| value | what it is |
| --- | --- |
| `nsec1…` | a nostr private key, in the clear |
| 64 hex characters | the same key, unencoded |
| `bunker://pubkey?relay=…&secret=…` | NIP-46: a remote signer signs on request |
| `browser` | a NIP-07 extension, via the local preview page |
| `npub1…` | signs nothing — writes unsigned events to stdout |

**Use a bunker URL**, on a laptop as much as in CI. `zsp`'s own warning is that
a private key in an environment variable is readable through `/proc/*/environ`
and lands in shell history; a bunker hands out signatures without handing out
the key, and can be revoked without rotating the identity the app is published
under. `SIGN_WITH=npub1…` is the way to see exactly what would be published
before anything is signed.

On Bitrise it is a secret named `SIGN_WITH`, and the release workflow skips the
step entirely when it is unset — a Play-only release should not be a red build.

### Before the first publish

Zapstore takes **your** signature on the APK as the app's identity, and every
future update has to carry the same one. Two things follow:

- **The same keystore signs every release, forever.** Zapstore, Play and every
  installed copy treat the certificate as the app's identity, so losing it
  means a new app rather than a new version.

  `expo prebuild` writes `release { signingConfig signingConfigs.debug }` and a
  comment asking you to fix it — the most dangerous default in the project,
  because `assembleRelease` then produces an APK signed with Android's *shared
  debug key* and says nothing about it. `plugins/withReleaseSigning.js`
  replaces that, and it is a plugin rather than an edit because `android/` is
  regenerated and gitignored. Two outcomes now, and neither is a debug-signed
  release:

  | | result |
  | --- | --- |
  | keystore properties set | signed with the release key |
  | properties absent | **unsigned** — `app-release-unsigned.apk`, which cannot be installed or published by accident |

  The second is what CI wants: Bitrise builds, then its own `sign-apk` step
  applies `BITRISEIO_ANDROID_KEYSTORE_*`.
### Building a signed release locally

The keystore and its passwords live at `~/.signer-guide-keystore/`, outside the
repository and never in it. `credentials.env` there carries the four values:

```bash
set -a; . ~/.signer-guide-keystore/credentials.env; set +a
./android/gradlew -p android :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -PSIGNER_GUIDE_STORE_FILE="$SIGNER_GUIDE_STORE_FILE" \
  -PSIGNER_GUIDE_STORE_PASSWORD="$SIGNER_GUIDE_STORE_PASSWORD" \
  -PSIGNER_GUIDE_KEY_ALIAS="$SIGNER_GUIDE_KEY_ALIAS" \
  -PSIGNER_GUIDE_KEY_PASSWORD="$SIGNER_GUIDE_KEY_PASSWORD"
```

**Back that directory up somewhere that is not this machine**, and put the same
values into Bitrise. There is no recovery and no appeal.

## Before the first submission

Things a person has to do, that no file here can:

- [ ] **Play**: create the app, fill in **Data safety** from `data-safety.md`,
      set the content rating questionnaire, and declare the app category
      (Finance).
- [ ] **Play**: host `privacy-policy.md` at the URL the listing claims —
      `signer-guide.fastpool.org/privacy`. A privacy policy URL that 404s is
      the single most common rejection.
- [ ] **Play**: financial-app rules apply. Play treats a wallet-adjacent app in
      Finance as needing a declaration; this one holds no keys and takes no
      custody, and saying that plainly in the declaration is the honest answer.
- [ ] **App Store**: an Apple Developer account, a bundle id registered for
      `org.fastpool.signerguide`, and screenshots taken on a simulator.
- [ ] **App Store**: guideline 3.1.1 — the app must not be a route to buying
      anything outside Apple's payment system. It is not: it takes no payment,
      sells nothing, and every transaction is signed by the user's own wallet.
      Say so in the review notes, with a test address to watch.
- [ ] **All three**: decide the app's licence and put it in `LICENSE`.
      `zapstore.yaml` currently claims MIT.
- [ ] **Zapstore**: create a release keystore and build a signed release APK.
      Nothing should be published from a debug build — see above.
- [ ] A **media kit** and a **share card** were specified in the design
      hand-off and are not built. Neither blocks a submission.
