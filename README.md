# Signer Guide

A plain-language guide for people choosing where to stake their STX, at
[signer-guide.fastpool.org](https://signer-guide.fastpool.org).

Made by [Fast Pool](https://fastpool.org), which runs some of the pools it
lists. They get the same treatment as everyone else's — described by the same
detectors, ranked by the same size — and the page says so in its footer. That
is what all of this being public is for.

The 23 pools registered on pox-5 run only six distinct **signer contracts**
between them, so the guide leads with those: one page per contract explaining
what it does and which pools run it, then the full pool list with filters for
what actually matters to you. Each pool has a page of its own as well — its
signer key, the other contracts registered against that key, and what it held
cycle by cycle with the members who held it.

```bash
pnpm install
pnpm generate:signers   # refresh src/data/signers.json from mainnet
pnpm generate:totals    # refresh src/data/totals.json — what each pool holds
pnpm generate:history   # refresh src/data/signers/ — cycles and members per signer
pnpm dev

pnpm members max500     # who stakes with a pool, and how much each of them has
pnpm movement max500 141 142   # who joined and left between two cycles, and where they went
pnpm addresses --file addresses.txt --token sbtc   # what a list of addresses holds
```

The generators, `members` and `addresses` read `STACKS_API_URL` and
`HIRO_API_KEY` — see
[Which node it asks](#which-node-it-asks). `generate:signers` uses
[`clarinet`](https://github.com/hirosystems/clarinet/releases) when it is on
the `PATH`, and only for contracts nobody has hashed yet — see
[The icon beside the name](#the-icon-beside-the-name).

## How a pool is identified

Not by its name. Anyone can deploy a contract called `…signer-manager`, so the
guide identifies a pool by what its **code** hashes to.

Each contract is reduced to a canonical form — comments removed, whitespace
collapsed, strings left intact — and hashed. This mirrors
[`manager-adapter.ts`](https://github.com/stx-labs/signer-sidekick/blob/main/packages/protocol/src/manager-adapter.ts)
in signer-sidekick byte for byte, so a hash produced here means the same thing
there. Two hashes are kept:

| hash              | meaning                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `sourceSha256`    | the raw bytes as deployed, reproducible with `curl … \| jq -r .source \| sha256sum` |
| `canonicalSha256` | the same code ignoring comments and formatting                                      |

A third hash does the grouping. The canonical form is lexical, not semantic: a
newline before a closing paren survives as a space, so the same contract
reformatted still hashes differently — Fast Pool's signer is the Standard
contract with three spaces moved, and nothing else. Rather than "tidy" the
canonical form and lose sidekick compatibility, grouping uses `groupSha256`,
which additionally drops whitespace _beside a paren_. Whitespace between tokens
is kept, or `(a b)` would collide with `(ab)`.

| hash              | used for                                  |
| ----------------- | ----------------------------------------- |
| `sourceSha256`    | exact identity of the deployed bytes      |
| `canonicalSha256` | sidekick-compatible recognition           |
| `groupSha256`     | grouping pools that run the same contract |

That leaves 21 pools running five signer contracts. Reviewed contracts live in
`src/lib/profiles.ts`, keyed by group hash, and each gets its own page at
`#/contract/<id>`. A pool whose hash is not listed is shown as _not reviewed
yet_ rather than being given badges it has not earned.

### The icon beside the name

The three hashes above are ours. They answer "have we read this code before",
they mean something only here, and no reader is going to compare 64 characters
by eye anyway. So each contract also carries a small icon, drawn from its code,
that says the same thing at a glance: two pools showing the same icon run the
same contract.

The icon follows [SIP-043](https://github.com/stacksgov/sips/pull/266), which
exists so that it is the _same_ icon in a wallet, in an explorer and here.
Three things have to match for that, and the SIP pins all three:

| step        | what                                                                |
| ----------- | ------------------------------------------------------------------- |
| standardise | the byte-for-byte output of `clarinet format`, default settings     |
| hash        | `SHA-512/256` over its UTF-8 bytes, lowercase hex — `identiconHash` |
| draw        | `minidenticons`, seeded with that hex and nothing else              |

**The standardised code, not the deployed code.** That is the whole point of
the first step: the same contract deployed twice, laid out differently, is one
contract and should be one icon. It is also why this is a fourth hash rather
than one of ours — `canonicalSha256` strips comments and `groupSha256` moves
whitespace beside parens, and neither is what anyone else computes.

They agreed on the pools registered until recently — same partition, no group
split between two icons — and then `SP21D6BW….signer-manager-bd-contract`
arrived: the Standard contract, deployed with its twelve-line header comment
stripped and indented four spaces instead of two. `clarinet format` puts the
indentation back and keeps the missing comment missing, so it shares the group
and not the icon.

A group that holds two icons is not a group that is wrong, then, and
`src/lib/templates.ts` shows the majority one and counts the pools it does not
speak for. Requiring agreement was the earlier rule and it failed badly: one
pool in twenty-two took the icon off the Standard contract page and the front
page card, and took it off by showing the _new code, nobody has standardised
it yet_ placeholder — of the most-deployed, most-read contract on the page.
The contract page now says which pools the icon is speaking for instead of
letting a blank stand in for a sentence. A tie between two icons is the one
case left with no majority to show, and keeps the placeholder.

Two notes on following the SIP literally, both worth raising against the draft:

- It names the renderer's function `minidenticonSvg`. In `minidenticons` 4.x
  that export is a custom element registered as a side effect; the function
  that returns SVG is `minidenticon`.
- It calls saturation 50 and lightness 50 the library's defaults. They are 95
  and 45. The guide passes the SIP's numbers explicitly, so which of the two
  is "default" cannot change what is on the page.

**The hourly refresh does not run the formatter.** A deployed contract's
source cannot change, so its icon is worked out once and then carried by
`signers.json` itself, keyed on `sourceSha256` — nine distinct sources have
appeared across the whole history of that file, so the formatter has nine runs
of work to do rather than thirty-eight an hour. That is a cache and not the
merge the generator was rid of in _[what a person
decided](#what-a-person-decided-and-where-it-lives)_: the key is the deployed
bytes, so a byte's difference is a miss and gets standardised properly, and
nothing that can go stale is carried by it.

So clarinet is wanted only when code nobody has hashed appears — which is the
same moment somebody is being asked to read that contract anyway, and the
issue the refresh opens says so. Until then that pool shows a dashed
placeholder rather than an icon: **new code, no claim made yet**, in the same
amber the page uses everywhere else for what it has not checked. Never an
invented pattern — an icon is a claim about which code this is, and there is
no claim to make yet.

Because the icon comes from a formatter's output it is only as stable as the
formatter, and `clarinet format` is beta. `signers.json` records which version
drew the icons in `standardisedWith`, and a run whose local clarinet differs
re-standardises every contract rather than leaving the file holding two
formatters' work — so a bump is somebody's commit, arriving as
`~ identiconHash` per contract in the refresh summary, and never a Tuesday.

## Where the badges come from

Two of the three come from the contract itself, and the generator records the
line of Clarity each decision was made from (visible under _Show the details_):

- **Anyone can join** — `validate-stake!` contains no `asserts!` that tests the
  `staker`. Checks on the _caller_ being pox-5, or on a pause flag, do not
  count: they apply to everyone and say nothing about who is welcome. Some
  contracts hide the caller check in a helper and others inline it, so counting
  bare asserts would misread the inlined ones as invite-only.
- **Rewards in Bitcoin** — `validate-stake!` decodes a `pox-addr` from the
  signer calldata and records it, which is what lets rewards go to L1.

## Fees: what is a promise and what is not

Two separate things, deliberately not conflated.

**The fee today** is a stored value the operator can change, so it is read live
and always shown as _right now_. Where it lives differs by contract, so the
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
exceed 20% whatever the operator does. Those pools get a _fee capped_ badge.
The Standard contract's `MAX_BIPS u10000` only stops a fee of 100% or more,
which promises a staker nothing, so it is reported as no ceiling at all.

**Notice before a change** is the other promise: a contract that makes a new fee
wait gives you time to move your STX before it applies. Two contracts do it, and
they do not agree on the unit, so the unit travels with the number:

- Juice Pool waits out **burn blocks** —
  `(asserts! (>= burn-block-height (+ (var-get pending-fee-height) FEE_COOLDOWN)))`
  with `FEE_COOLDOWN u144`, about a day.
- Fast Pool's `max500` queues by **reward cycle** —
  `(var-set pending-fees-cycle (+ cycle FEE_ACTIVATION_DELAY_CYCLES))` with
  `FEE_ACTIVATION_DELAY_CYCLES u2`, about a month, and
  `(if (>= (current-cycle) (var-get pending-fees-cycle)) ...)` deciding which
  rate is live. A cut applies at once; only a rise waits.

Both are matched on shape rather than on function names, so a contract that
calls its steps something else is still picked up. The queued form additionally
requires the contract to _read the stored point back_ before applying the new
rate — storing a number proves nothing on its own, and a contract that only
pretends to queue should not earn the badge.

A pool with no fee code of its own is not counted as low-fee: the fee may simply
be taken elsewhere, as with `native-pool-signer-manager`, which routes through
`.native-pool-v1`.

**Stakers who pay nothing** are the third thing, and Juice Pool is the only
contract with any: it keeps an `og-stakers` map and charges them no fee at all,
whatever the rate is for everyone else.

```clarity
(define-read-only (get-effective-fee-bips (staker principal))
  (if (is-og staker) u0 (var-get fee-bips)))
```

Detected on shape — a test on one `staker` choosing between no fee and the fee —
so a contract that calls its favoured stakers something else is picked up too.
Two things must hold before the page says anything: the branch _not_ taken has
to be about the fee, since contracts are full of `u0` branches that are just
arithmetic; and the test has to resolve to a map the contract keeps, so the page
can say where the answer comes from. A test that cannot be traced is left
unreported rather than guessed at.

The page also records **who decides**. `set-og` is a public, admin-gated
function, so the pool picks who is exempt and can take someone off the list
again. That makes it a discount in the pool's gift, not a promise the contract
holds it to — a real difference to anyone choosing on the strength of it, and
the contract page says which it is.

## What each pool is looking after

The amount staked with each pool is the one number here that moves by the
minute. It lives in its own file, `src/data/totals.json`, read from pox-5
(`get-amount-delegated-for-signer`) by `pnpm generate:totals` and committed
alongside `signers.json`.

It used to be read in the reader's own browser and cached in `localStorage` for
an hour. Moving it into the refresh is the whole of the guide's "backend":
**one read an hour for every reader, rather than one per reader.** Read it in
the browser and the guide's entire readership lands on a public endpoint to
fetch a number that barely moves between blocks — which needs a proxy, an API
key on a server, and something to run it, all to serve an hour-stale number
either way. A committed file needs none of that, and the page makes no network
requests at all.

Three consequences worth knowing:

- **No `@stacks/*` dependency.** The node wants its arguments hex-encoded, which
  is a contract principal and a uint — a few dozen lines in `src/lib/clarity.ts`
  against about half a megabyte of library, on a page people open on a phone.
  Those encodings are pinned in `clarity.test.ts` against output from the real
  library, and checked against all 22 registered signers.
- **Reads are paced**, one at a time and 300ms apart, because the node allows
  roughly 50 requests a minute per IP. Two at a time with no gap got nine pools
  in and earned a 429 for the remaining fourteen — a rate limit the page would
  have shown as _amount not known_, which is a rate limit dressed up as
  ignorance about somebody's money. A pool that genuinely cannot be read after
  its retries shows as _amount not known_ — never as zero.
- **The file carries no timestamp.** A "read at" that moved every hour would be
  an hourly commit saying nothing, which is exactly what
  `describe-signer-changes.ts` exists to keep out of the history. Any diff to
  `totals.json` is a real change in what a pool holds.

Amounts are shown for the current reward cycle, falling back to the cycle being
filled while the current one is empty — during the pox-5 changeover, cycle 140
read as zero for every pool, which tells a reader nothing.

### Who is in a pool

Each pool's own page shows this — see
[The page for one pool](#the-page-for-one-pool) below. `pnpm members` answers
the same question on the command line, against the chain rather than against
committed data, which is what to reach for when you want it now:

```bash
pnpm members max500              # by name, contract id, or any part of either
pnpm members "fast pool" --top 20
pnpm members fastpool-1 --json   # every member, for piping somewhere else
```

Two sources, answering different questions:

| source                                                 | says                                          |
| ------------------------------------------------------ | --------------------------------------------- |
| `/extended/v3/staking/signers/{signer}/stakers` (Hiro) | who has ever staked with this signer contract |
| `pox-5.get-signer-cycle-membership` (the chain)        | who is with it this cycle, and for how much   |

The index says who to ask about; the chain says what is true. That ordering is
the only one that can be checked, and the script checks it: the members'
amounts are summed and compared against `get-amount-delegated-for-signer` for
the same cycle — both from pox-5, so they should agree to the microstack. A
staker the index has never heard of would be invisible otherwise, and this is
what says so. Fast Pool Max500 reconciled at 41,530,653.232810 STX across 89
members in cycle 141; Fast Pool v1 at 1,193,883.160843 STX across 20.

Being indexed is not being a member, and the report keeps the three ways that
can fail apart: **gone** (indexed, holding nothing this cycle), **elsewhere**
(staking, but with another signer now), and **unanswered** (the node would not
say). Anyone still unanswered at the end of a run is asked about once more —
on a long run it is the rate limit catching up, and one pass clears it — and
whoever is left is named, because the total is short by exactly what they hold.
An empty answer from Hiro's index is never printed as an empty pool: a refused
page and a pool nobody stakes with look identical, and the report says which
one it is looking at.

The index is keyed by the signer _contract_, not the signer key, so the two
contracts sharing a key — `.hiro` with `.signer-manager-stackslabs-3`, and
`.signer-manager-bd-contract` with `.signer-manager-blockdaemon-v1` — do not
get one another's members. The report says when a pool's key is shared, since
anything keyed on the key counts them together.

Reading amounts costs one node call per indexed staker, paced like every other
read here, so a large pool takes a minute anonymously. `--no-amounts` prints
the index alone and asks the chain nothing.

### What changed between two cycles

`pnpm members` says who is in a pool now. `pnpm movement` says what moved, which
is the question behind a member count that changed — 127 to 140 could be
thirteen arrivals, or thirty arrivals and seventeen departures to a competitor,
and those are not the same news.

```bash
pnpm movement max500 141 142
pnpm movement "fast pool" --from 141 --to 142 --json
pnpm movement max500 141 142 --fresh   # ignore the committed rosters
```

For every leaver it asks pox-5 where they stand in the later cycle, and keeps
four answers apart, because collapsing them is how a rate limit gets reported as
an exodus:

| answer                    | means                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| with another signer       | they moved, and it is named                                          |
| stopped                   | no pox-5 position, and nothing locked either                         |
| locked, no position       | their stake starts in a later cycle — not a leaver at all            |
| the node would not say    | unknown, and never filed under any of the above                      |

That third row is not a corner case. Stacking a few blocks after a cycle begins
takes effect from the next one, so somebody who re-staked slightly late is
absent from the cycle they meant to join and present in the one after. Counted
as gone, they are a headline about people who never left.

Joiners get the same treatment against the earlier cycle, so "new to stacking"
and "taken from another pool" are told apart.

Rosters come from `src/data/signers/<slug>/<cycle>.json` when the refresh has
built them and from the chain when it has not, and which was used is printed. A
mover the chain then places with **this** signer in both cycles never moved —
the committed roster is simply behind — so it is reported as that rather than as
a destination, with a warning that the counts are off by however many there are.
`--fresh` walks both cycles on the chain and settles it.

### Where is my STX staked

`#/status` is the one page in the guide that asks a node about something a
reader typed. Everything else comes from the two committed files; this cannot,
because the question is about an address nobody knew existed until it was
pasted in.

Addresses arrive two ways, and both end in the same place:

```
#/status                                       the box, empty
#/status/SP2C2…                                one address
#/status/friedger.btc                          a BNS name
#/status/friedger.btc,SP2C2…                   a whole list in one link
```

Contract principals and BNS v2 names work as well as wallets. The box takes a
pasted list — one per line or comma-separated, up to 20 — and looking it up
rewrites the hash, so what comes back is a link that can be sent to somebody
else.

**Names are resolved against the BNS v2 registry itself**, with
`can-resolve-name(namespace, name)` on
`SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF.BNS-V2`, which answers with the
owner or errors `u106` for a name nobody holds. An indexer would be quicker to
reach for, but the page uses what comes back to look up somebody's stake — so a
stale owner would report one person's position under another person's name,
silently. The registry decides who owns a name, so the registry is what is
asked.

A name and a contract principal both have a dot in them, and telling them apart
is a case rule: a Stacks address is upper-case c32 and a BNS name is lower
case, so `SP2C2….my-contract` cannot be read as a name and `friedger.btc`
cannot be read as a contract. Three answers are kept apart — resolved, nobody
owns it, and the registry would not say — because a lapsed name and a rate
limit are not the same news. It shares
`parseAddressList` with `pnpm addresses`, so a file that works on the command
line works in the box: quotes, trailing commas, `#` comments kept as names.

It says what the staking dialog says, in the dialog's own words — the
`stake.position.*` messages, which already describe a stake that exists. One
vocabulary for one thing, rather than a second set of sentences drifting away
from the first.

Three answers are kept apart, for the reason they are kept apart everywhere
else here:

| what it shows       | means                                                        |
| ------------------- | ------------------------------------------------------------ |
| a position          | staking, with whom, how much, until which cycle, rewards where |
| not staking         | pox-5 has no position — and if STX is locked anyway, it says so |
| could not read      | the node would not answer; **never** shown as not staking     |

Reads are paced. One address costs up to four requests — `get-staker-info`, a
payout getter or two, then the balance — so twenty fired at once is eighty
requests in a second, which earns a 429 for most of them and would report a
page of people as staking nothing. They go in order, 350ms apart, and each row
is filled in as it lands: a limit that bites late costs the last few rows
rather than all of them.

### Which of my addresses needs attention

The other direction: `pnpm addresses` takes a list of addresses and says which
of them somebody has to do something about.

```bash
pnpm addresses SP2C2… SP3VR…
pnpm addresses --file addresses.txt --token sbtc
pnpm addresses --file addresses.txt --min-stx 1000 --ending-in 3 --json
```

Two reads per address — `/extended/v1/address/{principal}/balances` for STX,
every fungible token and every NFT collection in one request, and
`pox-5.get-staker-info` for the stake. The report is the difference between
them, because neither one alone is a decision:

| flag          | what it means                                                       |
| ------------- | ------------------------------------------------------------------- |
| `ending`      | the stake unlocks within `--ending-in` cycles (default 2)           |
| `not staking` | `--min-stx` or more sitting unlocked, staking nothing (default 100) |
| `idle`        | the same, but beside a stake it could be added to                   |
| `not pox-5`   | STX locked that pox-5 has no position for — stacked elsewhere       |
| `token`       | holds none of `--token`, or less than `--min-token`                 |
| `unread`      | this run could not find out                                         |

`unread` is a flag rather than a blank because an address nothing is known
about must not read as an address with nothing wrong. `not pox-5` is the one
worth knowing during the changeover: locked STX with no pox-5 position is a
pox-4 stack, which "not staking" would describe wrongly and "staking" would
describe worse.

`--token` takes an asset identifier or any part of one. A fragment matching
two assets — `sbtc` is both `sbtc-token` and `sbtc-token-locked` — is reported
rather than resolved, but one the query names in full wins over one that
merely contains it. A full identifier is taken as itself even when nobody in
the list holds it, since "which of these is missing it" is the question.

The script writes nothing to disk. The list of addresses is yours, and where
it lives is not a script's decision.

## The page for one pool

`#/signer/<contract-id>` is a page about one deployed signer contract, reached
from a pool's name anywhere in the guide. It is a different page from
`#/contract/<profile>`, and the difference is worth keeping straight: a
**contract** is a piece of reviewed code that a dozen pools may share, and a
**signer** is one deployment of it, with its own key, its own money and its own
members. "Is this code safe" is the first page; "who am I actually staking
with" is this one.

Most of what is on it is about the signer rather than the contract, because a
signer key can have several signer-manager contracts registered against it, and
the stake behind the key, its weight and the slots it holds are decided on them
together. Somebody looking at `.signer-manager-bd-contract` is looking at half a
signer — its other half is `.signer-manager-blockdaemon-v1`, deployed by a
different address, so nothing about the contract id hints that the two are one.
The page names the siblings and links between them.

### Making it affordable

An amount is one call per contract per cycle. A member list is one call _per
staker_, because pox-5 answers "who is this staker with" and not "who is with
this signer" — so a signer with two thousand members costs two thousand calls
for one cycle. Anonymously Hiro allows about fifty a minute. Walking every
signer's every cycle every hour is not slow, it is impossible.

Four things make it cheap, and they are the whole design of
`scripts/generate-signer-history.ts`:

- **A cycle that is behind us cannot move, so it is read once.** Stacking for a
  cycle is locked in before the cycle begins, so only the cycle being filled is
  really live. The generator still re-reads the current one — a cycle of
  insurance against that reasoning, costing a few calls an hour, against
  freezing a number that later moved. Everything strictly past is written once
  and never asked about again. **In the steady state a run reads two cycles,
  not forty.**
- **A cheap number decides whether the expensive walk runs.** The amounts come
  first. If a signer's total is exactly what it was last run, nobody joined,
  nobody left and nobody changed their stake — so the member list on file still
  stands and the walk is skipped entirely. Only a signer whose money actually
  moved pays for its members, and most hours most signers do not.
- **The unit is the signer key, not the contract.** Walking the signer once
  rather than each of its contracts reads a staker who moved between two of them
  once, and gets the arithmetic right as a side effect.
- **A run can be given a budget.** `--budget N` caps the per-staker calls and
  spends them on the signers checked longest ago, so an hourly run that cannot
  afford everything still makes progress and comes back to the rest next time.
  A signer that will not fit is left whole rather than half-walked — half a
  member list is a list that does not add up, which is worse than no list. The
  exception is a run that has spent nothing yet, so the largest signer can never
  be starved by a budget smaller than it is.

### Why none of it is bundled

The rest of the guide ships as two committed files every reader downloads, which
works because they are small and everybody wants all of them. History is
neither, so it is split and fetched only when asked for:

| file                                   | fetched when                |
| -------------------------------------- | --------------------------- |
| `src/data/signers/<slug>.json`         | a reader opens a pool       |
| `src/data/signers/<slug>/<cycle>.json` | they open one of its cycles |

A reader on the list page pays for neither, and that is nearly all of them. The
slug is the signer key without its `0x`, or the contract id for a signer with no
key on file — the two cannot collide, since a key is lower-case hex and a
contract id starts with an upper-case address.

A cycle nobody staked in gets no members file at all: `memberCount: 0` in the
summary says everything an empty file would. `memberCount: null` is the
different statement that nobody has walked it yet, and the page keeps the two
apart rather than reporting one as the other.

### Two kinds of final

Each cycle in a summary carries two flags, and they are not the same claim:

| flag         | means                                              | true when              |
| ------------ | -------------------------------------------------- | ---------------------- |
| `fileFinal`  | this record is done with; never read again         | `cycle < currentCycle` |
| `cycleFinal` | the cycle itself is shut; nobody can join it        | `cycle <= currentCycle` |

They differ for exactly one cycle — the current one — and that is why there are
two. Stacking for a cycle locks in before that cycle begins, so the cycle a
reader is standing in takes no more stakers: it is earning, not filling. The
record for it is still re-read each run all the same, as one cycle of insurance
against that reasoning being wrong.

Collapsing them is a bug this repo has already shipped once. The page read
`fileFinal` — false for the current cycle, because the generator still looks —
and rendered "still filling" on the cycle a reader was in, inviting them to join
something that had closed before it started. The page now speaks from
`cycleFinal` alone, `SignerHistory.currentCycle` separates the two closed states
(earning now, versus done), and `signer-history.test.ts` asserts against the
committed data that the current cycle is never offered as one to join.

Both are optional as far as the page is concerned: a file written before they
existed reports its standings as unknown and shows no badge, rather than
guessing or being thrown away whole.

`membersAddUp` carries the same check `pnpm members` prints, so the page can
say when a list is short instead of presenting it as everybody. Where it is
true, the members in the file really do sum to what pox-5 says the signer holds
— `signer-history.test.ts` proves that against the committed data.

Because the page reads the published branch, a working copy shows the published
history rather than one you have just generated. To see your own:

```bash
pnpm generate:history --only "fast pool"
VITE_DATA_BASE_URL=/src/data pnpm dev
```

## Refreshing

### Which node it asks

Every generator takes its endpoint from the environment, in `scripts/node.ts`:

| variable                       | default               | meaning                                              |
| ------------------------------ | --------------------- | ---------------------------------------------------- |
| `STACKS_API_URL`               | `https://api.hiro.so` | the node to read                                     |
| `HIRO_API_KEY`                 | _(none)_              | sent as `x-api-key` when set, omitted when not       |
| `VITE_SIGNER_UPDATES_FORM_URL` | _(none)_              | optional POST endpoint used by the email signup form |

```bash
STACKS_API_URL=http://localhost:3999 pnpm generate:signers   # your own node
STACKS_API_URL=localhost:3999 pnpm generate:history          # http:// assumed
HIRO_API_KEY=… pnpm generate:totals                          # or a key
```

The scheme is filled in when it is left off, because `new URL('localhost:3999')`
does not throw — it reads `localhost:` as the scheme and leaves no hostname —
so the mistake used to survive every check and reach `fetch`, which failed with
_unknown scheme_, which each caller here turned into "the node would not
answer". A typo then read as an unresponsive chain. Anything that is still not
http(s) after that is refused by name.

They also decide **how fast to go** from that. Anonymous against Hiro the
requests are 300ms apart, because the limit is roughly 50 a minute per IP and a
refresh asks about every pool twice over. With a key, or against a node of your
own, there is nothing to wait for and the gap drops to 50ms — a full signer
refresh takes about ten seconds instead of a minute.

The key is optional and the workflow treats it as such: set a `HIRO_API_KEY`
repository secret and the hourly runs get quicker and stop competing with every
other anonymous caller sharing the runner's IP; leave it unset and they take the
slow road. Nothing else changes, and the data comes out byte-identical either
way.

`.env` is gitignored, for `node --env-file=.env`.

**The key never reaches the browser.** Every _refresh_ that talks to a node
lives under `scripts/`, which is why `locked.ts` sits there rather than in
`src/lib/` despite the page using its output. `src/lib/types.ts` holds the shape
they share, so nothing in `src/` needs to import anything that knows an endpoint
from a key.

The page itself does make requests, and it is worth being precise about which.
Nothing is asked of a node to _read the guide_: the pool list, the fees and the
amounts all come from the two committed JSON files. Requests happen for two
things only — the data refresh described under [Installing it](#installing-it),
which reads those same two files from this branch anonymously, and staking,
where a connected wallet's balance and position are read from a public node.
Neither carries a key.

### The refresh

`pnpm generate:signers` rewrites `src/data/signers.json`, in three steps: read
every registered signer from the chain, lay `src/data/signers-manual.json` over
the result, write the file. Any pool whose canonical hash matches no profile is
printed at the end — read its code, then add it to `src/lib/profiles.ts`.
`pnpm generate:totals` then rewrites `src/data/totals.json` for exactly the
pools that file lists, and `pnpm generate:history` updates `src/data/signers/`
for exactly the signers they make up — reading only what can still have moved,
per [Making it affordable](#making-it-affordable). The hourly workflow gives
that last one a `--budget`, so a run it cannot finish picks up where it left
off rather than overrunning.

Only the first of the three can fail the run. The amounts and the history are
the softest things on the site, they keep their previous values rather than
blanking, and losing an hour of either should not stop a fee change reaching
the page.

### What a person decided, and where it lives

`signers.json` is written from scratch every run, so nothing hand-written
survives in it. Anything a person decided goes in
[`src/data/signers-manual.json`](src/data/signers-manual.json) instead, keyed
by contract id and laid over the generated record afterwards. To see everything
anyone has ever decided about the pools, read that one short file.

Almost always a name. A contract called `signer-manager-pox5` is run by
Senseinode, and no amount of reading the code will say so; one called
`signer-manager` carries no name at all, and the page says `(anonymous)` rather
than printing the plumbing as though it were a pool. Each entry carries a
`note` saying why, next to the value rather than in a commit message nobody
will find again.

The page then says which of the two a reader is looking at. Most names on it
are not the pool's — they are the contract id tidied up, which gives `Pox5` for
Senseinode and a bare `signer-manager` for three others. A guess, in other
words, and one printed in the same type as a confirmed name is a claim to know
something we do not. So a name from this file is printed plainly with a tick,
and a name read off the contract id is set in italic. `applyManualData` records
which by setting `displayNameSource` on the record; an entry may not set that
field itself, or it could claim a name was confirmed when nobody confirmed
anything.

A **feature reading** may also be corrected, where a detector is known to be
wrong about one specific contract. Fast Pool's own `max500` is the case:
`validate-stake!` hands the calldata to `store-payout-config`, and the pox-addr
is decoded and recorded in there, while the detector only looks inside
`validate-stake!` itself — so it reads a contract that pays rewards to L1 as one
that does not. The note on that entry says as much, and says to delete it once
the detector follows a helper one level down.

Those entries are the ones to keep an eye on, because they are a claim the code
is no longer being asked about. The generator prints any manual value that has
come to match what it works out on its own — the sign that a detector has been
fixed and the override has done its job — so a stale one shows up in the hourly
log rather than sitting there for years looking load-bearing. It cannot be a
test: `signers.json` is what came out _after_ the overrides were applied, so
comparing the two would call every entry redundant. Only the generator holds the
record as the chain gave it.

What never belongs there is a **fee**, a hash, a profile or a signer key.
A fee changes under us, and a hash is the identity of the code itself; a value
written by hand would go on being stated as fact long after it stopped being
true. `scripts/manual-data.test.ts` fails the build if an entry writes one, if
an entry names a contract that is no longer registered, or if a name merely
restates what the generator already works out.

This replaced a merge. The generator used to keep whatever was already recorded
for a contract and only append ones it had not seen, which is how the
hand-written names survived — and how every fee and feature reading survived
too, read once when the pool first appeared and never looked at again. Nothing
in the file said which of the two had put a value there.

`.github/workflows/refresh-signers.yml` does both **hourly** and commits the
result, so the guide does not quietly go stale between releases. Hourly rather
than daily because a pool can change its fee at any moment, and until the
refresh has run again the page states the old one as fact. Three things make
the commits worth reading:

- **The timestamp alone is not a change.** `scripts/describe-signer-changes.ts`
  compares the new file with the old and skips the commit unless a pool, a fee
  or a feature actually moved. Otherwise the history would be one commit an
  hour saying nothing. The amounts are committed whenever they differ, which,
  having no timestamp of their own, means whenever they really differ.
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

## Installing it

The guide also installs to a phone's home screen, as **Bitcoin Staking**. It is
a PWA rather than a store app: the same build, plus a manifest, an icon and a
service worker.

### Its data does not age with the build

A browser tab always has current data, because the site is rebuilt whenever the
hourly refresh commits. An installed app is not — it holds whatever build it
last downloaded. So `src/lib/data-source.ts` reads the same two files from this
branch at runtime and keeps them on the device. Three copies, best first:

| copy    | where                                  | when it is used                                         |
| ------- | -------------------------------------- | ------------------------------------------------------- |
| network | `raw.githubusercontent.com/…/src/data` | whenever it answers                                     |
| cache   | `localStorage`                         | offline, and on every cold start before the fetch lands |
| bundled | compiled into the build                | the very first launch, and if the cache is unreadable   |

The bundled copy is a floor, never a ceiling: a saved copy older than the build
running against it is discarded rather than shown. A saved copy is also checked
before it is believed — a total that is not a plain uSTX count is rejected here
rather than thrown at the first render. When the fetch fails, the dot beside
"Last update" turns amber and the line says the reader is looking at a saved
copy, so the age of what is on screen is never implied to be now.

### What the service worker will not do

`public/sw.js` caches the _application_ and nothing the application _says_.
Every cross-origin request goes to the network, always:

- **`api.hiro.so`** — a cached balance is a wrong balance, and somebody is
  about to stake against it.
- **`raw.githubusercontent.com`** — the pool data has its own copy above, and
  the page tells the reader when it is showing it. Answering from a second
  cache here would make that notice a lie.

`src/lib/sw.test.ts` loads the worker into a sandbox and asserts both refusals,
because a negative rule is the kind that rots quietly.

### Checking it in a real browser

A service worker cannot be unit-tested — whether it registers, whether it takes
control on the next visit, and what the app does with the network cut are facts
about a browser. Neither can the wallet picker, which is a web component, and
which has to keep listing the injected wallets while no longer offering
WalletConnect. So those eleven things are checked by driving a real browser:

```bash
pnpm build && pnpm preview &
pnpm check:pwa                  # CHROME_PATH=… if it cannot find a browser
```

It is deliberately **not** part of `pnpm test`: it needs a build, a server and
a browser, none of which the unit tests do. Run it before shipping anything
that touches the shell, the data layer or the wallet.

A new version is **offered, not applied**: the worker waits, a bar appears, and
the reload happens when the reader says so. An app that reloads itself could do
it in the middle of approving a transaction.

### Signing from a phone

On a desktop browser `connect()` finds Leather or Xverse injected into the page.
On a phone there is no extension to inject anything, so the wallet is another
app and the route to it is WalletConnect — `@stacks/connect` already carries
that provider and lists it in the same picker as the injected ones, so nothing
downstream of `connect()` changes.

**That route is switched off at the moment.** Approving over WalletConnect does
not end in a session this app can use: `@stacks/connect` reads addresses out of
the session rather than asking the wallet, and without a public key in there
the staking dialog cannot build a transaction — so the user approves in their
wallet and is met with an error. Offering a route that fails after somebody has
already committed to it is worse than not offering it, so the project id in
`src/lib/wallet-connect.ts` is commented out and the picker shows the injected
wallets only. [`WALLETCONNECT.md`](WALLETCONNECT.md) has the whole analysis and
the question that is open with Xverse and Leather.

Uncommenting that one line puts WalletConnect back; so does setting
`VITE_WALLETCONNECT_PROJECT_ID`, which is how a deployment can re-enable it
without touching the source. The id itself is a public client identifier, not a
secret: it ships inside the bundle of every site that uses WalletConnect and can
be read straight out of it. What stops somebody else spending the quota is the
**allowed-domains list in the Reown dashboard** — so that list is the thing to
keep current, and a deployment on another domain should set its own id rather
than borrow Fast Pool's.

| variable                        | default                      | meaning                                        |
| ------------------------------- | ---------------------------- | ---------------------------------------------- |
| `VITE_WALLETCONNECT_PROJECT_ID` | unset — WalletConnect is off | turns WalletConnect back on, with this id      |
| `VITE_DATA_BASE_URL`            | this branch's `src/data`     | where the installed app re-reads the data from |
| `VITE_STACKS_API_URL`           | `https://api.hiro.so`        | node the staking dialog reads balances from    |
