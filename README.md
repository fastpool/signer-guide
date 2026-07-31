# Signer Guide

A plain-language guide for people choosing where to stake their STX.

The 22 pools registered on pox-5 run only five distinct **signer contracts**
between them, so the guide leads with those: one page per contract explaining
what it does and which pools run it, then the full pool list with filters for
what actually matters to you.

```bash
pnpm install
pnpm generate:signers   # refresh src/data/signers.json from mainnet
pnpm dev
```

## How a pool is identified

Not by its name. Anyone can deploy a contract called `…signer-manager`, so the
guide identifies a pool by what its **code** hashes to.

Each contract is reduced to a canonical form — comments removed, whitespace
collapsed, strings left intact — and hashed. This mirrors
[`manager-adapter.ts`](https://github.com/stx-labs/signer-sidekick/blob/main/packages/protocol/src/manager-adapter.ts)
in signer-sidekick byte for byte, so a hash produced here means the same thing
there. Two hashes are kept:

| hash | meaning |
| --- | --- |
| `sourceSha256` | the raw bytes as deployed, reproducible with `curl … \| jq -r .source \| sha256sum` |
| `canonicalSha256` | the same code ignoring comments and formatting |

A third hash does the grouping. The canonical form is lexical, not semantic: a
newline before a closing paren survives as a space, so the same contract
reformatted still hashes differently — Fast Pool's signer is the Standard
contract with three spaces moved, and nothing else. Rather than "tidy" the
canonical form and lose sidekick compatibility, grouping uses `groupSha256`,
which additionally drops whitespace *beside a paren*. Whitespace between tokens
is kept, or `(a b)` would collide with `(ab)`.

| hash | used for |
| --- | --- |
| `sourceSha256` | exact identity of the deployed bytes |
| `canonicalSha256` | sidekick-compatible recognition |
| `groupSha256` | grouping pools that run the same contract |

That leaves 21 pools running five signer contracts. Reviewed contracts live in
`src/lib/profiles.ts`, keyed by group hash, and each gets its own page at
`#/contract/<id>`. A pool whose hash is not listed is shown as *not reviewed
yet* rather than being given badges it has not earned.

## Where the badges come from

Two of the three come from the contract itself, and the generator records the
line of Clarity each decision was made from (visible under *Show the details*):

- **Anyone can join** — `validate-stake!` contains no `asserts!` that tests the
  `staker`. Checks on the *caller* being pox-5, or on a pause flag, do not
  count: they apply to everyone and say nothing about who is welcome. Some
  contracts hide the caller check in a helper and others inline it, so counting
  bare asserts would misread the inlined ones as invite-only.
- **Rewards in Bitcoin** — `validate-stake!` decodes a `pox-addr` from the
  signer calldata and records it, which is what lets rewards go to L1.

## Fees: what is a promise and what is not

Two separate things, deliberately not conflated.

**The fee today** is a stored value the operator can change, so it is read live
and always shown as *right now*. The contracts do not agree on how to expose
it — the Standard one takes a cycle and a bond index, Juice Pool takes no
arguments — so the getter is detected from the source rather than assumed.
Assuming one name reported Juice Pool's real fee as "not set in this contract".

**A ceiling** is a promise, and one contract makes it: Juice Pool asserts
`(<= new-fee MAX_FEE_BIPS)` with `MAX_FEE_BIPS u2000`, so its fee can never
exceed 20% whatever the operator does. Those pools get a *fee capped* badge.
The Standard contract's `MAX_BIPS u10000` only stops a fee of 100% or more,
which promises a staker nothing, so it is reported as no ceiling at all.

**Notice before a change** is the other promise: a contract that makes a new fee
wait gives you time to move your STX before it applies. Juice Pool asserts
`(>= burn-block-height (+ (var-get pending-fee-height) FEE_COOLDOWN))` with
`FEE_COOLDOWN u144`, about a day. The detector matches that *shape* — a fee
function refusing to act until the chain passes a stored height plus a delay —
rather than the function names, so the Fast Pool contract still to be published
is picked up on the day it deploys, whatever it calls its steps. The delay may
be a named constant or written inline; both are resolved and shown in blocks and
in hours.

A pool with no fee code of its own is not counted as low-fee: the fee may simply
be taken elsewhere, as with `native-pool-signer-manager`, which routes through
`.native-pool-v1`.

## Refreshing

`pnpm generate:signers` rewrites `src/data/signers.json`. Any pool whose
canonical hash matches no profile is printed at the end — read its code, then
add it to `src/lib/profiles.ts`.
