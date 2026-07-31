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
and always shown as *right now*. Where it lives differs by contract, so the
source says which to read rather than the reader assuming:

- a no-argument getter when there is one (`get-fee-bips`, as Juice Pool has),
- otherwise the `fees-bips` data var, read straight from the node,
- otherwise nothing, and the pool reads as "not set in this contract" — which
  for `native-pool-signer-manager` is the truth, since its fee is taken through
  `.native-pool-v1`.

Explicitly **not** `get-fee-bips-for-cycle`, which is the trap here. It looks
like the obvious call and is a snapshot: the Standard contract writes that map
when a cycle's rewards are crystallised, and reads it back with
`(default-to u0 ...)`. No pox-5 cycle had settled, so it answered 0 for every
pool and the guide printed "no fee right now" across the board — including for
one pool charging 10%.

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

## What each pool is looking after

The amount staked with each pool is the one number here that moves by the
minute, so it is not baked into `signers.json` — it is read from pox-5
(`get-amount-delegated-for-signer`) in the reader's own browser and kept in
`localStorage` for an hour. Come back within the hour and it costs the node
nothing.

Two consequences worth knowing:

- **No `@stacks/*` dependency.** The node wants its arguments hex-encoded, which
  is a contract principal and a uint — a few dozen lines in `src/lib/clarity.ts`
  against about half a megabyte of library, on a page people open on a phone.
  Those encodings are pinned in `clarity.test.ts` against output from the real
  library, and checked against all 22 registered signers.
- **A first visit asks about every pool**, and the node allows roughly 50
  requests a minute per IP. Reads go two at a time and retry a 429 rather than
  giving up, because the alternative is telling someone we do not know what a
  pool holds when we do. A pool that still cannot be read shows as *amount not
  known* — never as zero, which would be a lie about somebody's money.

Amounts are shown for the current reward cycle, falling back to the cycle being
filled while the current one is empty — during the pox-5 changeover, cycle 140
read as zero for every pool, which tells a reader nothing.

## Refreshing

`pnpm generate:signers` rewrites `src/data/signers.json`. Any pool whose
canonical hash matches no profile is printed at the end — read its code, then
add it to `src/lib/profiles.ts`.

`.github/workflows/refresh-signers.yml` does that daily and commits the result,
so the guide does not quietly go stale between releases. Three things make the
commits worth reading:

- **The timestamp alone is not a change.** `scripts/describe-signer-changes.ts`
  compares the new file with the old and skips the commit unless a pool, a fee
  or a feature actually moved. Otherwise the history would be one commit a day
  saying nothing.
- **The tests run against the new data before it is committed.** They assert
  that filters still match something and that the pools they name are still
  registered, so a refresh that breaks a claim on the page fails the run
  instead of shipping.
- **Code nobody has read opens an issue.** A newly registered pool matching no
  profile gets one issue, once, naming the contract. Until someone reads it the
  page says so rather than guessing.

The commit message is the list of what moved — a fee going from 0% to 2.5%, a
pool registering, a feature reading that changed under us (which can only mean
a detector here changed, since a deployed contract cannot).
