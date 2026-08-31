# Signer Guide, on a phone

The guide's two questions, in the order somebody standing at a bus stop asks
them: **what is a staked STX earning right now**, and **what have I got
staked**. Everything else the guide knows — forty-five pools, six signer
contracts, the record of every payout — is one tap below them and never beside
them.

```bash
npm install
npm test                    # 220 tests, no device needed
npx expo run:android        # build and install on a connected device
npm run e2e                 # Maestro, against that device
```

## Two screens to a first stake

On first launch, three sentences and a number: what this does with your STX,
what comes back, and that it can be undone. Then one screen with a wallet to
pick and an amount to type. Four decisions are made for you, and all four are
on that screen with a way to change each:

| decision | default | why |
| --- | --- | --- |
| pool | Fast Pool Max500 | see below |
| rewards | as sBTC, in the same wallet | a mistyped Bitcoin address is rewards nobody can recover, and it is not checkable until the first payout |
| period | the whole of pox-5's maximum | a stake can be ended at the close of the cycle whatever period was chosen, so the longest is the one that asks the least afterwards |
| amount | yours | the only field on the screen |

The last three live in `src/data/stake-defaults.ts`, not on the screen. Both
staking screens read them, and they had drifted — the guided one said two weeks
and sBTC, the full form said ninety-six cycles and a Bitcoin address, so the
row saying "change this" led to a form that disagreed with it.

**The pool is a preference, and the screen says so in those words.** It is Fast
Pool's own, and Fast Pool wrote this app. The alternative was to dress that up
as a neutral filter that happened to land on its author's own pool, which is
the one thing a guide that ranks its rivals cannot do. What can be said for it
is checkable on its own page: the Capped Fee contract, so the fee cannot pass
5% and a rise has to be announced a month ahead; open to anyone; and it can pay
to a Bitcoin address.

If that pool is ever unregistered or closed, `defaultPool` falls back to the
rule it used to use — read contract, open to anyone, lowest fee — and
`preferred: false` makes the screen print the rule's sentence instead of the
preference's. A default that has stopped working is worse than one somebody
disagrees with, and a reason that describes something the app did not do is
worse than both.

Words that are true, are in this app, and are two taps away — pox-5, signer
manager, reward cycle, calldata, post condition — appear nowhere on the welcome
screen. None of them belongs between somebody and their first stake.

## Two ways in, kept apart

There are two answers to "whose stake is this", and they are not degrees of the
same thing:

| | can read a position | can sign |
| --- | --- | --- |
| **connected** — a live wallet session | yes | yes |
| **watching** — an address somebody typed | yes | no |

Watching is worth having on its own: it is how somebody checks a position from
a phone that does not hold the keys, and on a phone with no wallet installed it
is the only way in at all. Both live on one screen — `WalletScreen` — reached
from the address inside the stake card and from preferences.

The address is *in* the stake card rather than in a card of its own. It is the
answer to a question nobody opened the app to ask, and which only matters when
it is the wrong one, so it is small, quiet, and doubles as the way to change
it. A watched address says so beside itself, and the app never offers to sign
for one.

`WalletScreen` closes itself once a session exists. Connecting sends somebody
to another application and back; when they return, the screen that asked has
done its job and is in the way.

## Preferences

Three things, and deliberately no more — no notifications row (the app sends
none), no currency row (it quotes in sats because that is what pox-5 pays), no
"advanced" section (everything an advanced reader would change is an
environment variable, written down under **Configuration** below).

- **Appearance** — light, dark, or the phone's. `system` is the default,
  because a phone already knows whether it is being held in the sun; it is a
  third state, not the absence of a choice, so somebody who picked dark stays
  dark at sunset.
- **Language** — English or 한국어, each named in itself and never translated:
  somebody who cannot read the current one has to be able to find their way
  out.
- **Wallet** — what the app is currently looking at, and a way to the wallet
  screen. A shortcut, not a second place to change it.

## Three routes to a wallet, in the order they work

The wallet screen offers them in that order, which is not the order they are
usually listed in:

1. **Watch an address** — needs nothing installed, works for every address on
   the chain, and takes a BNS name. Read-only.
2. **Open the guide in your wallet** — both wallets ship a browser, and a page
   inside one reaches the wallet through the provider it injects. Verified on a
   device.
3. **WalletConnect** — last, and honest about why.

WalletConnect no longer lists Xverse, Leather and OKX. Leather registers no
`wc:` scheme at all and the integration is an **open request on its own
tracker** ([leather-io/mono#2595](https://github.com/leather-io/mono/issues/2595));
Xverse gets as far as its lock screen and nothing past that has been confirmed;
OKX takes the pairing and refuses on region. Three buttons promised three
things that mostly do not happen. What is left is the pairing link itself,
which works in whatever wallet somebody actually has.

The browser hand-off opens **the page they were on**, not the front page:
`guideUrlFor` builds it from the guide's own `signerHref` and `contractHref`,
so somebody two taps into choosing a pool is not handed a list of forty-five
and asked to start again.

### The evidence

Reading the wallets' own intent filters off a device settles what each supports,
which guessing had not:

```
io.leather.mobilewallet   leather   exp+leather-wallet-mobile
com.secretkeylabs.xverse  xverse    https (connect.xverse.app)
com.okinc.okex.gp         wc  okx  okex  okxweb3  …
```

**Leather registers no `wc:` scheme at all.** That is what it means when it says
WalletConnect is not supported, and no proposal this app sends will change it.
**OKX registers `wc:`**, which is why a bare pairing URI opened OKX under a
button that did not say OKX.

So there is a second route, and for Leather it is the only one: both wallets
ship a browser, and a page opened inside one reaches the wallet through the
provider it injects — the same route the web guide already uses. The app hands
the guide over.

| | link | verified on a device |
| --- | --- | --- |
| Leather | `leather://browser?url=…` | opened its browser on the guide |
| Xverse | `https://connect.xverse.app/browser?url=…` | opened Xverse — its lock screen, and past that is a PIN |

Xverse's own `xverse://browser?url=` still works and its documentation calls it
deprecated, so the verified app link is what is used.

## Watching a BNS name

The watch field takes `friedger.btc` as well as `SP…`. The name is resolved
against the **registry contract**, not an indexer — `@guide/lib/bns-resolve.ts`
explains why: what comes back is used to look up somebody's stake, and a stale
owner would report one person's position under another person's name, silently.

Three outcomes, kept apart on screen: an address, a name nobody owns, and a
node that would not answer. The last is not the second — showing a failed
lookup as "unregistered" tells somebody their name does not exist, which is a
different and worse thing to be wrong about.

## Connecting, and the wallet this app cannot name

Three wallets are named and opened on their own scheme. The fourth entry is
not a wallet: it **copies the pairing link**, and it says so on the button.

Handing a bare `wc:` URI to `Linking.openURL` does not raise a chooser on
Android — it opens whichever app claimed the scheme, which on a phone with OKX
installed is OKX, under a button that does not say OKX. A link on the clipboard
works in every wallet that takes one and lies about none of them.

Only the button that was pressed shows progress. `wallet.connecting` in the
context is one flag for the whole app, so handing it to four buttons spun all
four — which says the app is talking to Leather, Xverse and OKX at once when it
is talking to one of them.

Both preferences are read off the device before anything is drawn and written
back the moment they change. Neither goes anywhere: there is no server to send
them to.

## It looks like the guide, because it is the guide

`src/theme.ts` holds `PALETTES.light` and `PALETTES.dark`, and every value in
them is one the website already owns in `src/index.css`: cream, ink, grape,
mint, amber. Nothing here is a hue the app invented. Somebody who has read the
site and then opens this should not have to work out that it is the same thing.

Every colour is a role rather than a hue — `accent` is bitcoin and so is every
figure paid in sats, `stx` is Stacks and so is every amount of STX, `muted` is
anything that qualifies a number without being one. A palette is a complete set
of answers to those roles, so a new one cannot half-exist; a test asserts the
two have the same keys.

One role changed meaning rather than value: **the primary action is grape, not
amber.** Amber means "this is money", and a colour that means two things means
neither.

Light is not dark inverted. Grape is deepened into the ground and cream lifted
into the text, and both figure colours are lightened until they clear 4.5:1 on
`card` — which matters more here than in most apps, because this one puts the
accent colour on a 46-point number and on 13-point body text in the same card.

Type is Nunito, shipped with the app. The site sets a rounded stack; iOS
reaches SF Pro Rounded through `fontFamily: 'System'` and Android has no
rounded system face at all, so the font travels rather than the platform
choosing one.

Layout lives in a `StyleSheet` because it never changes; colour is applied
inline from `useColors()`, because it does. Switching to light re-renders with
different colours over the same geometry rather than rebuilding a stylesheet.

## The mark

Two circles on one axis, one filled and one outlined, overlapping: Stacks and
bitcoin are linked, and two pools showing the same icon run the same code — the
idea the identicons already carry. It is a sibling of `public/fastpool-logo.svg`
rather than a copy: same grape, same container radius, same stroke weight, a
different glyph.

The app used to ship Fast Pool's own glyph, which made the guide look like a
Fast Pool product rather than a guide that lists Fast Pool among forty-four
others. `src/components/Mark.tsx` draws it from the same geometry the exported
PNGs use, so the two cannot drift, and `scripts/make-splash.mjs` draws the
splash from those same numbers — a white tile with the grape mark, inverted
against the grape ground `app.json` paints, because a grape tile on a grape
ground is a mark with no container at all.

**Changing an icon needs a rebuild.** Android's launcher icons are generated
into `android/app/src/main/res/mipmap-*` by `expo prebuild` and compiled into
the APK; replacing the PNGs in `assets/` and reloading from Metro changes
nothing you can see. Run `npx expo prebuild --platform android --clean` and
build again.

## Language

`src/i18n/` holds the app's own catalogue — English is the source, Korean is
typed against it, so a key added in one and forgotten in the other is a build
error. Four tests hold the pair together: same keys both ways, nothing left
untranslated, and every `{placeholder}` present in both.

It is a *separate* catalogue from the web guide's `src/locales`, and that is a
deliberate cost. The guide ships its bundle to every reader on every page load,
and two hundred strings only a phone renders would be paid for by everybody.
What is shared is everything both apps say: amounts through
`@guide/lib/amounts` (English groups by millions, Korean by 만 and 억), and the
contract descriptions through `@guide/lib/profile-i18n` — so switching to
Korean translates the contract pages too, because the guide already wrote them.

One word is deliberately the same in both: `sats`. The guide's Korean bundle
keeps it untranslated, and the rate card puts this app's unit label directly
beside a figure formatted by that bundle — translating one and not the other
put two words for one unit six millimetres apart on the device.

## What is on the first screen, and why

The headline is `rateSatsPer1000Stx` from the guide's hourly refresh, and the
unit is written under it because it is the thing most easily got wrong: pox-5
pays every 1050 burn blocks, which is **half a reward cycle, about a week**. A
rate read as a cycle's is half the truth and read as a year's is fifty-two
times too small. Under it, the same figure said three other ways — compounded
over a year, what the last completed payout actually paid, and how long until
the next one — because an estimate is only judgeable against the facts it was
built from.

Below that is the position, if there is one: how much, what it earns at that
rate, with whom, until when, and where the rewards land. If there is not, the
same space holds the way to make one.

**With nobody connected, that space is one row.** It used to be a card with a
label, a heading, a paragraph and two buttons — and the two buttons went to the
same screen, since watching and connecting both live on `WalletScreen`. Four
elements' height to say "there is nothing here yet", on the one screen most
people will ever look at, pushing everything the guide actually knows below the
fold. So it is now a row of the same shape as the ones at the bottom: what it
is, what to do about it, a chevron. Somebody with nothing staked is usually
here to read.

Below *that*, under a heading of its own, is the rest of the guide. That
placement is the whole layout decision. A tab bar would have put "every pool"
at equal weight with "your stake", and they are not of equal weight.

## Choosing where to stake

Two steps, contract first:

1. **Which contract.** Twenty-five of the forty-five deployed signer contracts
   are the same code, and that code is what decides how rewards are
   distributed — whether they can go to a Bitcoin address at all, whether the
   fee is capped, whether the pool decides who may join. It decides nothing
   about the STX, which stays locked in the staker's own wallet either way. So
   it is the decision that matters, and it is made in plain language against a
   feature list rather than against a hash.
2. **Which pool runs it.** All of them run the code just chosen, so what is
   left to compare is the fee, the size, and who they are.

On the way to staking, a pool that is not registered or will not take a stake
from a stranger is left out rather than offered and then refused by the chain.
Reached from the browse-everything side, the same list is complete, because
there it claims to be.

## Who holds the vote

The pool list answers *where could my STX go*. `GroupsScreen` answers the
question underneath it, which the chain does not: three keys at six percent
each read as three small signers until somebody writes down that they are one
company, at which point they are a fifth of a veto.

It is a row in the same "rest of the guide" card as the pool list, and never
above it — somebody opening this app is checking a rate, not auditing the
signer set. The index is every group with its share of the cycle, largest
first, and one card at the bottom that is deliberately not a claim about
anybody: **Not grouped**, what no group here covers, drawn outlined rather than
filled and not openable. It sits below the groups rather than sorted in among
them, where its share would put it in the middle of the list.

`GroupScreen` is one entity. Its headline is the only number in this app the
chain cannot check, so the screen shows its work rather than asking to be
believed: every node added together with what each holds, whether the group
takes a whole key or a single contract on it, which contracts are counted under
two names — and, at the bottom, `source` in full, the evidence the claim rests
on. Each pool on it opens, and `PoolScreen` now says who is behind that pool in
the other direction.

Not one line of the arithmetic is this app's. `allGroups`, `groupVotingPowerBips`
and `ungroupedVotingPowerBips` come from `@guide/lib/signer-groups`, reading the
same hand-written `src/data/signer-groups.json` the website reads, so the two
cannot disagree about who carries what. What is this app's own is the layout and
its own Korean.

## A fee that keeps almost everything

Four pools charge **99.99%** today, and each is holding around a million STX.
In a list of forty-five rows their fee was drawn in the same grey as a fee of
5%: a number, in a row somebody is scrolling past, saying nothing about itself.

`isHighFee` in `@guide/lib/pool-filters` is the shared judgement — 95%, because
a pool keeping ninety-five percent of the rewards has done the same thing to
the staker as one keeping all of it — and it does two things here. Every
`SignerRow` with a fee that steep draws it in the warning colour and adds
_keeps almost every reward_ beside it, so it is legible everywhere pools are
listed. And the pool list gets **one** switch above it.

One, not the website's six. The other five filters there narrow forty-five
pools to the ones somebody might want, and on a phone that row of chips would
push the first pool off the screen to say nothing a reader could not type into
the search field. This one is not a preference: it finds the pools somebody
should walk away from, which is not something a search field can be asked.

## The wallet

Leather, Xverse and OKX are separate applications on a phone, so the route to
them is WalletConnect: the app publishes a pairing URI, the wallet is opened on it
by deep link, the person approves in their own app, and the reply comes back
over the relay.

[`WALLETCONNECT.md`](../WALLETCONNECT.md) explains why the web page switched
WalletConnect off: `@stacks/connect` reads addresses out of the approved
session, and unless a wallet published `sessionProperties.stacks_getAddresses`
there is no **public key** in there — so a page that builds the transaction
itself and asks for a signature has nothing to build with.

This app never builds one. It asks for `stx_callContract` and the wallet
builds, signs and broadcasts, so an address-only session is everything it
needs. That is the route the document names as the answer if the wallets will
not publish the key, and it is the route taken here.

The staking package still returns whole transactions, so a public key goes in
to build one — and everything built around it is thrown away. Only `contract`,
`functionName` and `functionArgs` are read back out; the wallet fills in the
spending condition from its own key. The value used is the generator point of
secp256k1, which belongs to nobody. `contract-call.test.ts` asserts the call is
identical whichever key built it.

**This app never sees a key and never asks for one.**

### It does not connect yet, and here is exactly why

Measured on a real device on 28 August 2026, and written up in full at the foot
of [`WALLETCONNECT.md`](../WALLETCONNECT.md).

The relay and the project id are **not** the problem — driving
`@walletconnect/universal-provider` headlessly creates the pairing and
publishes it. Everything below happens in the wallet, after that.

| Wallet | What happens | Why |
| --- | --- | --- |
| **Xverse** | was an error naming *bitcoin*; now opens and asks to unlock | the proposal asked for `stacks:1` alone. Adding `bip122:0000…31e93` to `optionalNamespaces` changed it — which is why the guide's own `walletOptions()` keeps both namespaces |
| **Leather** | "WalletConnect not supported" | no documented mobile transport of any kind. `docs.leather.io` does not resolve, and the Stacks wallet-support table lists only web methods |
| **OKX** | "not available in your region" | OKX's own geographic restriction. Nothing in a proposal causes it or fixes it |

Adding bip122 costs nothing: it is optional, a wallet approves what it can, and
`accountFromSession` reads a Bitcoin address if one comes back and carries on
if it does not. **It is not confirmed end to end** — unlocking Xverse needs a
fingerprint, so whether it then approves a Stacks session is unmeasured.

Xverse has meanwhile removed WalletConnect from its documentation entirely. The
only mobile route it documents now is opening a **web page** in its own in-app
browser, `https://connect.xverse.app/browser?url=…`, which is a route for
websites and not for native apps — and which means the web guide already has a
mobile signing story this app does not.

## Sharing code with the web guide

The staking rules, the contract profiles, the sats-per-1000-STX conversion, the
identicon, the snapshot validators and the STX arithmetic are imported straight
out of `../src` rather than copied. An app and a site disagreeing about what
somebody earns is not a rounding difference, it is two answers to the same
question.

| Shared module           | What it decides                                     |
| ----------------------- | --------------------------------------------------- |
| `lib/staking.ts`        | post conditions, lock periods, payout calldata      |
| `lib/rate-view.ts`      | the rate's period, its APY, what a position earns   |
| `lib/templates.ts`      | which pools run the same code                       |
| `lib/stx-amounts.ts`    | parsing and formatting an amount of STX             |
| `lib/snapshot-shape.ts` | whether a published file is usable                  |
| `lib/stx-only-cycles.ts`| grouping payouts into cycles                        |
| `lib/identicon.ts`      | SIP-043's icon, from the same seed                  |
| `lib/pool-filters.ts`   | what counts as a low, capped or ruinous fee         |
| `lib/signer-groups.ts`  | who is behind which signer keys, and what that adds to |

`metro.config.js` watches `../src` and resolves any bare import made from those
files against this project's `node_modules`, so the bundle carries one copy of
`@stacks/transactions` and one React. `jest.resolver.js` applies the same rule
to the test runner — two Reacts in one render is an "invalid hook call" and
nothing more useful.

What is **not** shared is anything that reaches for a browser: `data-source.ts`
reads `import.meta.env` and `localStorage`, neither of which exists here, so
`src/data/snapshot.tsx` is this app's own — same three copies in the same order
of preference (network, then the last one downloaded, then what shipped in the
build), kept in `AsyncStorage` instead.

## Tests

```bash
npm test          # jest + @testing-library/react-native
npm run e2e       # maestro, on a connected device
```

The unit and flow tests replace exactly two things — the network, and a wallet
that is another application. Everything else runs for real: the real navigator,
the real screens, the real forms, and the real staking package building the
real call. `src/flows/choose-and-stake.test.tsx` walks the whole path and then
asserts on **the call the wallet was handed** — a pox-5 `stake` for the amount
typed, in deny mode, bounded by a post condition — rather than on the app
having navigated somewhere, which would pass with a form that sent nothing.

### On a device

Neither Leather nor Xverse was installed on the device these were written
against, and a WalletConnect approval cannot be automated anyway — it happens
in another application. So the E2E build switches in a test wallet that returns
a canned address and transaction id:

```bash
EXPO_PUBLIC_MOCK_WALLET=1 npx expo start --dev-client   # in one terminal
npm run e2e                                              # in another
```

Everything else in those flows is real, including mainnet: `02` and `05` watch
a live staker with 15,000,000 STX in Fast Pool's signer manager, and `03`
builds a stake whose eligibility is checked by the read-only replay of every
gate pox-5 applies. The one thing that does not happen is the signature.

| Flow                        | What it holds to                                   |
| --------------------------- | -------------------------------------------------- |
| `00-onboarding`             | first launch to the staking screen in two taps      |
| `01-rate`                   | the rate, its unit and its cycle are the first thing |
| `02-watch-a-stake`          | a watched address shows its position and earnings   |
| `03-choose-and-stake`       | contract → pool → form → signed → broadcast        |
| `04-the-rest-of-the-guide`  | everything else is one tap away, and no closer      |
| `05-change-a-stake`         | an existing stake is changed, not started again     |
| `06-preferences`            | light/dark and a language switch that reaches past its own screen |
| `07-wallet`                 | connecting and watching, up to where another app takes over |
| `screenshots`               | not a test — it captures the store screenshots      |

## Shipping it

`store/` holds the listing for Google Play, the App Store and Zapstore as
files, in the layouts `fastlane supply` and `fastlane deliver` expect, plus the
nostr manifest Zapstore publishes from. `store/README.md` says what is in each
and what still needs a person. The screenshots are taken from the app running
against mainnet:

```bash
maestro test e2e/screenshots.yaml
node scripts/frame-screenshots.mjs
```

Zapstore's config is generated from the same text, by
`scripts/make-zapstore-config.mjs`, and published with `zsp` — the signing key
comes from `SIGN_WITH`, which should be a NIP-46 bunker URL rather than an
nsec. `store/README.md` has the table of what that variable accepts, and the
one thing that must be true before anything is published: a release keystore
that is not Android's shared debug key.

[`../bitrise.yml`](../bitrise.yml) builds and publishes. `check` runs on every
push — types, tests, and a Metro bundle, that last one because a module can
resolve under Node and not under Metro and nothing else would catch it. A
`mobile-v*` tag builds an AAB for Play's internal track and a signed APK for
Zapstore.

## Configuration

Everything has a working default; these are for pointing a build somewhere else.

| Variable                             | Default                        |
| ------------------------------------ | ------------------------------ |
| `EXPO_PUBLIC_STACKS_API_URL`         | `https://api.hiro.so`          |
| `EXPO_PUBLIC_DATA_BASE_URL`          | the guide's branch on GitHub   |
| `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID` | the id in `app.json`         |
| `EXPO_PUBLIC_MOCK_WALLET`            | off — `1` switches in the test wallet |
| `EXPO_PUBLIC_MOCK_ADDRESS`           | an address with no stake       |

## A share link

`signerguide://watch/SP…` opens the app on that address's position, read-only.
Nothing is signed and no wallet is involved, which is what makes it safe to
pass around — the address is a public fact about a public chain. It is
deliberately the only link the app understands, and it can only ever put the
app into a read-only state: a link that could connect a wallet, prefill an
amount or choose a pool would be a link that could be sent to somebody with
intent. `deep-link.test.ts` is mostly a list of what it refuses.

A Reown project id is a public client identifier, not a secret; what stops
somebody else spending the quota is the allowed-list in the Reown dashboard.
