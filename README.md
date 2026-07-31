# Signer Guide

A plain-language guide for people choosing where to stake their STX.

The 21 pools registered on pox-5 run only six distinct **signer contracts**
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

That distinction earns its keep: of 21 registered pools there are only six
distinct signer contracts, and two implementations differ solely in their
comments. Reviewed contracts live in `src/lib/profiles.ts`, keyed by canonical
hash, and each gets its own page at `#/contract/<id>`. A pool whose hash is not
listed is shown as *not reviewed yet* rather than being given badges it has not
earned.

The canonicalisation is lexical, not semantic — a newline before a closing
paren survives as a space, so functionally identical contracts can still hash
differently. That is deliberate, to stay byte-compatible with sidekick.

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

## Why fees are not a badge

**No implementation caps its fee.** The only on-chain limit is
`MAX_BIPS = u10000`, i.e. 100%, and the operator can change the fee at any time
with `update-fees`. So the fee is read live per pool and always shown as
*right now*, never as a guarantee.

A pool with no fee code of its own is not counted as low-fee either: the fee may
simply be taken elsewhere, as with `native-pool-signer-manager`, which routes
through `.native-pool-v1`.

## Refreshing

`pnpm generate:signers` rewrites `src/data/signers.json`. Any pool whose
canonical hash matches no profile is printed at the end — read its code, then
add it to `src/lib/profiles.ts`.
