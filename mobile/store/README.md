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

They are taken from the app actually running, against mainnet, and can be taken
again in a minute:

```bash
maestro test e2e/screenshots.yaml     # with the app installed and Metro up
node scripts/frame-screenshots.mjs    # needs ImageMagick 7
```

`e2e/screenshots.yaml` walks the app and captures seven screens; Maestro writes
them under `~/.maestro/tests/<run>/Screenshots/`, so copy them into
`screenshots/raw/`. The framing script crops the phone's status and navigation
bars, letterboxes each onto 1080×1920 and writes a caption. The letterboxing is
not decoration: a 1080×2340 screenshot is 1:2.17, and **Google Play rejects
anything taller than 1:2** without looking at it.

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
buys is provenance: an APK signed by a key anyone can check, next to a
repository anyone can build from.

Publishing needs a nostr key, which is **not** in this repository and must not
be. The CLI reads `NSEC` from the environment, or talks to a NIP-46 remote
signer. On Bitrise it is a secret named `NSEC`.

The schema in that file is the one the CLI took when it was written. Zapstore
is young and its keys move — run `zapstore publish --help` before the first
release rather than after a failed one.

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
