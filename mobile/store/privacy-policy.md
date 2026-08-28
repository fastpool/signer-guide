# Privacy policy — Signer Guide

_Last updated 28 August 2026._

Signer Guide collects nothing about you. There is no account, no sign-up, no
analytics, no advertising identifier, no crash reporting and no telemetry of
any kind. Nothing you do in the app is sent anywhere that we can read.

That is the whole policy. The rest of this page is the detail behind it,
because "we collect nothing" is a claim worth being able to check.

## What stays on your phone

| What                         | Where                        | Why                                     |
| ---------------------------- | ---------------------------- | --------------------------------------- |
| The Stacks address you last looked at | the app's own storage | so it is still there when you reopen the app |
| The last copy of the pool data | the app's own storage       | so the app works with no signal          |
| Whether you have seen the welcome screen | the app's own storage | so it is shown once                  |

All three are removed when you uninstall the app. The address is also removed
the moment you press **Forget**. None of it leaves the phone.

Your wallet's session is **not** kept. It lives only while the app is open.

## What the app asks the internet for

Three hosts, and nothing else.

**`raw.githubusercontent.com`** — the pool data: which contracts are deployed,
what each pool holds, what the last payouts paid. These are plain files in a
public repository. The request carries no information about you beyond what any
web request carries: your IP address, at GitHub's end, under
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

**`api.hiro.so`** — a public Stacks node, asked what a given address has staked
and what its balance is. **This request contains the Stacks address you are
looking at**, because there is no way to ask about an address without naming
it. That address is already public — it is on a public blockchain — but the
fact that *this phone* asked about *that address at this moment* is visible to
Hiro, under [Hiro's privacy policy](https://www.hiro.so/privacy). If you would
rather not, point the app at your own node with
`EXPO_PUBLIC_STACKS_API_URL`, or run the [web guide](https://signer-guide.fastpool.org)
against one.

**A WalletConnect relay** — only when you connect a wallet, and only to carry
the request to your wallet app and its answer back. What travels over it is the
transaction you are being asked to sign. The relay is operated by
[Reown](https://reown.com/privacy-policy).

The app talks to no server of ours. There is no server of ours.

## Your keys

Signing happens inside Leather, Xverse or OKX. Signer Guide never sees a
private key, a seed phrase or a password, and has no screen that asks for one.
If anything calling itself Signer Guide asks you for a seed phrase, it is not
this app.

## Children

The app is not directed at children and collects nothing from anyone,
including them.

## Changes

If this policy ever changes, the change will be in the app's public repository
with the rest of its history: <https://github.com/fastpool/signer-guide>.

## Contact

Open an issue at <https://github.com/fastpool/signer-guide/issues>.
