# Signer Guide, on a phone

The guide's two questions, in the order somebody standing at a bus stop asks
them: **what is a staked STX earning right now**, and **what have I got
staked**. Everything else the guide knows — forty-five pools, six signer
contracts, the record of every payout — is one tap below them and never beside
them.

```bash
npm install
npm test                    # 187 tests, no device needed
npx expo run:android        # build and install on a connected device
npm run e2e                 # Maestro, against that device
```

## Two screens to a first stake

On first launch, three sentences and a number: what this does with your STX,
what comes back, and that it can be undone. Then one screen with a wallet to
pick and an amount to type. Four decisions are made for you, and all four are
on that screen with a way to change each:

| decision | default                         | why                                                  |
| -------- | ------------------------------- | ---------------------------------------------------- |
| pool     | lowest fee, open, code reviewed | the rule is in `src/data/default-pool.ts`, and `defaultPoolReason` prints it |
| rewards  | held as sBTC                    | a mistyped Bitcoin address is rewards nobody can recover, and it is not checkable until the first payout |
| period   | one cycle, about two weeks      | the shortest period pox-5 takes — and a stake can be ended before it is up, without penalty |
| amount   | yours                           | the only field on the screen                         |

Fast Pool wrote this and runs some of the pools it lists, which is why the
first row is a rule and not a preference: applied to every pool the same way,
blind to who deployed anything, stated on screen, and one tap from the full
list. `default-pool.test.ts` holds it to that.

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

Both preferences are read off the device before anything is drawn and written
back the moment they change. Neither goes anywhere: there is no server to send
them to.

## Two palettes, one set of roles

`src/theme.ts` holds `PALETTES.dark` and `PALETTES.light`, and every colour in
them is a role rather than a hue — `accent` is bitcoin and so is every figure
paid in sats, `stx` is every amount of STX, `muted` is anything that qualifies
a number without being one. A palette is a complete set of answers to those
roles, so a new one cannot half-exist; a test asserts the two have the same
keys.

Light is not dark inverted. `#F7931A` is legible as a 44-point figure on white
and is not legible as 13-point body text on white, and this app puts the accent
colour on both — so the light palette darkens it to a shade that clears 4.5:1
and keeps the hue.

Layout lives in a `StyleSheet` because it never changes; colour is applied
inline from `useColors()`, because it does. Switching to light re-renders with
different colours over the same geometry rather than rebuilding a stylesheet.

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
