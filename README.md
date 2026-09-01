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
pnpm generate:totals    # refresh src/data/totals.json — what each pool holds,
                        # this cycle and the next
pnpm generate:history   # refresh src/data/signers/ — cycles and members per signer
pnpm dev

pnpm members max500     # who stakes with a pool, and how much each of them has
pnpm movement max500 141 142   # who joined and left between two cycles, and where they went
pnpm addresses --file addresses.txt --token sbtc   # what a list of addresses holds

pnpm card:lesson        # a shareable card of something the chain taught us
pnpm film:lesson        # the same lesson as a nine-second film, with a score
```

The two lesson commands are the odd ones out: they draw pictures rather than
read the chain, and they need `blender`, `ffmpeg` and `magick` rather than a
node. See [scripts/lesson/README.md](scripts/lesson/README.md).

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

**A fee of 95% or more** is the one filter that narrows to pools a reader should
walk away from, and it exists because four of them charge **99.99%** today while
holding a million STX each — `SP1PHZZW24DHBA4SJB27XEAD0Z4HTG7219S428RFA`'s
`signer-manager`, `signer-manager-hashkeycloud-2`, `signer-manager-bd-contract`
and `signer-manager-stakin-1`. None of them is capped, because the Standard
contract's `MAX_BIPS u10000` allows anything below 100%. The threshold is 95
rather than 100 for the same reason the ceiling above is not counted as one: a
pool keeping ninety-five percent of the rewards has done the same thing to the
staker as a pool keeping all of them, and rounding is not a defence. The same
rule as low-fee applies at the other end — a fee the page could not read is not
evidence of a fee this high, so a pool with no fee of its own is neither.

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

The cycle filling behind it is read too, and shown under the first as _still
filling_. It is not a copy: pox-5 answers for a future cycle with what is
delegated for it **so far**, so somebody who has unstaked is already out of it
while still counting in the current one — 392 million STX for cycle 141 against
341 million for 142, the day this was written. Only the one cycle ahead, though.
A cycle beyond that answers exactly the same as the next one, since nothing can
have moved between them yet, and printing one number under two headings would
tell a reader something untrue. When the fallback above has run, the cycle being
shown is already the one filling, and no second line appears.

An amount is only ever carried forward onto the cycle it was read for. A pool
the node refused this hour keeps the last figure for *that same cycle* — which,
at a rollover, is the one the previous run recorded as next — and otherwise
reads as _amount not known_ rather than being given a neighbouring cycle's
number.

The cycle *before* the current one is kept too, and never read from the chain:
a cycle that is over cannot change, so `previous` is whatever the last file had
as its current cycle. At a rollover it simply moves across. That is what lets
the list tell a pool nobody has used for two cycles from one that emptied
yesterday.

### Which pools the list shows

Fifteen of the forty-five registered signers hold nothing and never have. They
are real contracts with real pages, but a reader choosing where to stake is not
helped by scrolling past them, so **_In use_ is the one filter that starts on**
— and the count above the list says how many of the total are showing.

Hiding is the strongest thing this page does to a pool, so it takes more than an
absence to earn it:

- **Every cycle on file says empty, and every one of them was read.** A `null`
  is the node refusing to answer and a missing entry is a pool the file has
  never covered; hiding a pool on either would be a rate limit deciding what a
  reader sees. Three cycles are checked — the one before, the current one, and
  the one filling — so a pool that emptied yesterday and a pool taking its first
  stake both stay.
- **And the guide has had a cycle in which somebody could have staked with it.**
  Stacking for a cycle is locked in before that cycle begins, so a pool first
  seen during 141 could not appear in 141's amounts however popular it is.
  Those carry a _New_ badge and are never hidden.

"First seen" is the guide's own record, not the chain's — nothing on chain says
when a signer registered. `generate-signers.ts` keeps `firstSeenCycle` from the
previous file and sets it to the current cycle for a pool it has not seen
before, so it says when this guide first noticed a pool and never moves again.
The existing entries were backfilled from the commit history of `signers.json`:
43 pools were first seen in cycle 140, two in 141.

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
| `/extended/v3/staking/signers/{signer}/stakers` (Hiro) | who stakes with this signer contract right now |
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

## Whether the signer turns up

Weight is what a signer is owed a say over. It says nothing about whether the
node does the job, and the two are not close: one signer holds **2.7%** of the
vote in cycle 142, has answered a quarter of what it was asked, and takes half
a minute to do it. Another holds a seat with a million STX behind it and has
never answered anything at all.

Every block a miner proposes goes to every seated signer, and each one accepts
it, rejects it, or says nothing. `pnpm generate:performance` writes that down,
from Hiro's signer-metrics API:

```
src/data/performance.json        the current cycle, every seated signer
src/data/performance/<key>.json  one key, every cycle it was seated for
```

The split is the member history's, for the same reason. The summary is
twenty-six rows and ships with the pool list, because "does this signer turn
up" belongs on the page a reader is already on. The history behind it is
fifty-nine cycles — back to **cycle 84**, the first Nakamoto one — and costs a
request only when somebody opens it. A first run reads every cycle at one
request each; after that it reads two, the cycle being signed and the one that
just closed, whose row was written mid-flight. A cycle that is over cannot
move, so it is read once and never again — and a cycle that went unread is
picked up by the next run rather than left as a hole, which is not
hypothetical: cycle 140 answered nothing on the backfill.

Three distinctions carry the whole feature, and they all live in
`src/lib/performance.ts`:

**Rejecting is not failing.** A signer that reads a proposal and refuses it is
doing exactly what it is there for; one that says nothing is not. So the
headline is `answeredRate` — accepted *or* rejected, over everything it was
asked — and what it said is a second number underneath. Leading with acceptance
would rank a node that rubber-stamps above one that checks.

**A mean over nothing is not a fast mean.** The API reports
`average_response_time_ms: 0` for a signer that answered nothing, which sorts
to the top of any list of the quick. `responseMs` is `null` for that case and
the page prints words, not a number. `neverAnswered` is its own state for the
same reason: it is an absence, not a bad score.

**An open cycle is a cycle so far.** The counts are cumulative, so `final` is
false while the cycle is still being signed and every figure says which cycle
it covers. A hundred missed blocks two hours in is not a hundred missed in a
fortnight.

The figures are somebody else's observation — Hiro's node watched the proposals
go out and the answers come back — and the page says so. Unlike the fee or the
amount staked, it is not something this guide could read off the chain, and a
run against a local node leaves these files alone rather than emptying them.

## Key rotations

Nothing on chain announces one. `signers.json` holds the key a contract has
*now*, and every refresh overwrites it — so a pool that swapped keys on a
Tuesday looked, on Wednesday, exactly like a pool that had always had the new
one.

It matters because a cycle's signer set is fixed before the cycle begins.
Rotate, and the old key keeps the seat — signing, or not signing, for a
fortnight — while the new one holds nothing until the next set is computed.
Read one cycle at a time that is a pool with no weight beside a weight with no
pool, and nothing distinguishes it from one signer leaving and another
arriving.

`src/data/key-rotations.json` is therefore a **log, not a snapshot**: entries
are appended and never rewritten. The refresh writes one down when it sees the
key under a contract change; `pnpm backfill:rotations` recovers everything from
before that existed by walking the commits of `signers.json` — the same trick
that backfilled `firstSeenCycle`, and for the same reason. Merging is by what
happened rather than by when it was noticed, so the two writers cannot record
one rotation twice.

`observedAt` is when the guide *saw* it, not when it happened. The refresh runs
hourly, so the truth is somewhere in the hour before; claiming a block height
would be inventing precision the record does not have. And a contract that
would not answer is never a rotation — `signerKey` is absent for a bad minute,
and a node having one must not enter the permanent record as an operator
changing keys, nor as changing them back when it recovers.

One rotation is on file, and it is the whole argument in a single row:
`signer-manager-stakin-1` rotated on 28 August 2026, mid-cycle-142. The key it
left behind holds the seat, has been asked about every block in the cycle, and
has answered none of them — `last_seen` is null, it has never been heard from.
The pool charges 99.99%.

## Who holds the vote

A signer node is one key. A **group** is a set of nodes with one entity behind
them, and that is the number worth knowing: three keys at six percent each read
as three small signers until somebody says they are one company, at which point
they are a fifth of a veto. `#/groups` lists every group, largest share first,
and `#/group/<id>` opens one.

Nothing on chain says who is behind a key, so `src/data/signer-groups.json` is
written by hand and every entry carries a `source` — evidence a reader can
follow, a shared deployer address or a published statement, not "we know". Two
kinds, and the difference is real: an **operator** runs the nodes, so its weight
is every contract on every key it holds; a **stake** group's nodes belong to
other people, and what it controls is the STX behind the contracts named. A node
can be in both, and one is, which is why the percentages on the index do not sum
to a hundred and are not meant to.

The last row of the index is the honest one: **Not grouped**, how much of the
cycle no group here claims, carried in the same column of percentages as the
rest because it is the size of a large group. It sits below the groups rather
than sorted in among them — it is not an entity — and it is a gap in the file
rather than a finding about the chain: the signers in it may well be related to
each other, and nobody has written it down. Counted by contract, not by key:
three keys today carry one contract a group claims and one it does not, so
"this key is ungrouped" would be false of all three while "this contract is"
stays true.

One group is named for its evidence rather than for an entity. `same-funder`
holds two contracts, deployed a day apart in August 2026 by two addresses that
had one transaction each beforehand, both from the same funder, and between them
they carry more than a third of the vote under no name at all. The same funder
also paid for a deployment that is *not* in the group, which the entry says so a
reader can weigh it. It is the thinnest claim in the file, and it is in the file
because two anonymous nodes at a third of the signer set is exactly the thing a
reader should be told about.

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
  first. If a signer's total is what it was when its member list was made,
  nobody joined, nobody left and nobody changed their stake — so the list still
  stands and the walk is skipped entirely. The comparison is against
  `walkedUstx`, the total as it stood at that walk, not against last run's
  amounts: those are refreshed hourly whether or not the members are, so a
  run-to-run comparison would notice a move once and then find the amounts
  agreeing with each other for ever.
- **A re-walk happens at most once a day.** The cycle being filled changes
  constantly, so the rule above fires nearly every hour for the big signers —
  the three Xverse ones are eleven hundred members between them, and re-reading
  them hourly was the whole of a thirty-minute refresh. A member list for a
  cycle that is still open is provisional anyway, so once a day is enough, and
  the page prints when the list was made rather than implying it is current. In
  the steady state a run walks nothing at all and takes about twenty seconds.
- **Except once, before a record is frozen.** The daily rule has a hole at the
  cycle boundary: a stake that changes in a cycle's last day is on file as an
  amount while the list is the one walked before it moved, and when the cycle
  rolls over the record turns final — after which a list that adds up is "as
  good as it is going to get" and nothing would ever walk it again. It would
  freeze a member short of the total it is filed with, for good. So a final
  record whose `walkedUstx` no longer matches its amounts is walked once more,
  whatever the clock says. It terminates by construction: a walk writes
  `walkedUstx` from the amounts, and a settled cycle's amounts do not move
  again. Live cycles are left to the daily rule — one where the money moves
  every hour would be walked every hour, which is the bill the rule exists to
  stop, and a live list catches up on its own tomorrow.

  It is `walkedUstx` that says this, not `membersAddUp`. That flag describes
  the walk, not the present: fastpool-1's cycle 142 was walked at 10:54 on 26
  August, between an unstake and a 99 STX increase forty-five minutes later,
  and the list it made added up to the amounts as they stood at 10:54. Both
  facts were true. The staleness is only visible in the two totals.
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

`pnpm generate:performance` is the fourth, and reads a different kind of thing
entirely — see [Whether the signer turns up](#whether-the-signer-turns-up). It
asks Hiro's indexer rather than a Stacks node, because only an indexer keeps
the record of who answered which proposal, so a run against a local node has
nothing to read and leaves the files alone.

Only the first of the four can fail the run. The amounts, the history and the
conduct are the softest things on the site, they keep their previous values
rather than blanking, and losing an hour of any of them should not stop a fee
change reaching the page.

The refresh also writes down anything it sees change that a snapshot cannot
hold: a contract whose signer key is not the one it had last hour goes in
`src/data/key-rotations.json` — a log rather than a snapshot, and the only
record of a rotation there is. See [Key rotations](#key-rotations).

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

## What a staker sent, and what the pool made of it

The stake panel shows two things that usually agree, and are worth telling
apart when they do not: the Bitcoin payout the pool holds for you, and the
**user data** you sent yourself.

pox-5 does not keep the user data. `stake` and `stake-update` take it as their
last argument, `signer-calldata (optional (buff 500))`, and pass it straight to
the signer manager's `validate-stake!` through a reentrancy guard. There is no
map for it, no `print` carries it, and `get-staker-info` returns only
`{amount-ustx, first-reward-cycle, num-cycles, signer}`. What survives on chain
is whatever the signer manager chose to keep — fastpool's stores the parsed
tuple in its own `payout-configs` map, read back with `get-payout-config`.

So the sent bytes are only readable from the transaction. The page walks the
address's transactions newest-first for a successful pox-5 `stake` or
`stake-update` and decodes that last argument. The type to decode it against
comes from the signer manager, not pox-5: `parse-payout-calldata` accepts
exactly two shapes and nothing else —

    {pox-addr: {version, hashbytes}, max-fee, min-claim}   this contract's
    {pox-addr: {version, hashbytes}, max-fee}              v1's

and a `none` argument is a request, not a blank: it deletes the address on file
and asks to be paid in sBTC.

The two can disagree in a way a staker should see. Send the two-field shape and
the pool accepts it, then fills in `default-min-claim` — `max-fee + 546 + 1` —
so `get-payout-config` reports a floor you never chose. The page reports the
sent floor as absent rather than substituting the pool's, and says the pool
used its own.

## What a cycle pays

pox-5 computes rewards every 1050 burn blocks — half a reward cycle — so **a
cycle is paid in two goes**, and `rewards-per-token-for-cycle` accumulates
across both of them. Everything on `#/rewards/stx-only` follows from that.

The rate the page leads with is a blend: this cycle's own accrual counts for as
much of it as the cycle has run, and the last payout — settled, not projected —
covers the rest. An hour after a payout, five blocks of sBTC deposits
multiplied by 1050 is not an estimate anybody should act on; by the end of the
cycle it is the only figure that describes the cycle at all. The arithmetic is
`scripts/stx-only-rate.ts`, tested on its own.

### Why the last payout can name the cycle before this one

_Last payout, as paid (cycle 141)_ beside a page that says the current cycle is
142 looks like an off-by-one and is not. Cycle 142 begins at burn height
964,250; the last computation ran at 964,249, the block before it, closing the
second of cycle 141's two payouts. Cycle 142's first payout is due at 965,299.
The label names **the cycle whose rewards were paid**, not the cycle a reader is
standing in, and until 965,299 those are different numbers. `pox-5` settles it
either way: `burn-height-to-reward-cycle` answers 141 for 964,249 and 142 for
964,250.

### What every distribution has paid

`#/rewards/stx-only/history` lists them, two to a cycle, at the rate each one
actually paid. It reads `src/data/stx-only-history.json`, fetched when the page
is opened rather than shipped to every reader.

That file exists because **the chain does not keep this**. A cycle's cumulative
figure is the two payouts added together, so once the second has landed there
is no way to recover what the first one paid — the only witness is a refresh
that ran between the two. So the hourly job writes each payout down as it sees
it, the record is append-only, and a rate that was never worked out reads as
_not known_ rather than as a zero. The first entry, cycle 141's first half at
350 sats per 1000 STX, was recovered from the committed history of
`stx-only-calculations.json`, which had recorded the intermediate figure hourly
before this file existed.

A cycle's total comes from the chain's cumulative figure rather than from
adding its two halves: each half is rounded down to a whole sat on its own, so
cycle 141 reads 350 + 407 and paid 758.

## Where the rewards are sitting

Rewards do not arrive; they are fetched, in two hops, neither of which happens
on its own:

    pox-5  --claim-rewards-->  signer manager  --claim-staker-rewards-->  you

pox-5 accrues per cycle against the signer's shares. `claim-rewards` on the
signer manager pulls that across as real sBTC; until somebody calls it, the
money is in pox-5 and the pool's own balance does not show it. Then each
staker's share sits pooled in the manager until `claim-staker-rewards` moves
it. Both calls are permissionless — anyone may make them for anyone — which is
exactly why nobody does.

    pnpm report:unclaimed --skip-stakers      the amounts, in a couple of minutes
    HIRO_API_KEY=… pnpm report:unclaimed      the amounts and the head count

Each pool's own page carries the first of those numbers — _Still waiting at
pox-5_ — from `signers.json`, and it is asked of pox-5 rather than of the signer
manager on purpose: every implementation wraps `claim-rewards` in its own way,
but the money they are all reaching for is in one map that pox-5 zeroes when
the claim lands.

**Across every cycle, not the current one.** `get-earned` is keyed by the cycle
the rewards were earned in, so asking only about the cycle we are standing in
answers 0 for a pool sitting on an uncollected payout from the cycle before —
which is exactly the pool the number exists to catch. Cycle 141's second
distribution landed hours into cycle 142, and until this was fixed the page told
a reader Fast Pool Max500 had collected everything while pox-5 held 22 million
sats for it.

**But not the same cycles for ever.** That would be a call per pool per cycle,
growing by one a fortnight with no end, so each pool carries a floor —
`unclaimedFromCycle` — and the refresh asks from there. A cycle moves under the
floor when two things are true of it:

- **it is settled** — `last-reward-compute-height` has reached the cycle's final
  burn block, so every distribution in it has been computed. Before that a zero
  means "not worked out yet" and will become something later; the current cycle
  is never settled, because its second distribution lands on its last block.
- **and the pool read zero for it** — it has collected, and pox-5 zeroed the
  entry. A settled zero cannot become anything else.

Only a leading run moves the floor, never a gap in the middle: it is a floor,
not a verdict on each cycle. A cycle that could not be read moves nothing, and
the pool's total reads as _not known_ rather than short — a floor moved on an
answer nobody got would skip a cycle for good. The total stays complete, because
everything below the floor was read as zero on the run that set it.

The Capped Fee implementation adds a stage the others do not have.
`settle-staker-rewards` moves a share out of the pooled bucket into that
staker's `pending-payouts`, so small cycles can accumulate and pay one Bitcoin
fee between them. Standard and Xverse have no such stage — `claim-staker-rewards`
pays out on the spot — and no such getter, which is why every read is probed
for rather than assumed. Native Pool, the invite-only bond managers and Juice
Pool keep no per-staker sBTC at all and are reported as such, not as zero.

Two piles are deliberately not counted as owed to stakers: the withdrawal
liability, which has already left the balance into an sBTC withdrawal (in
flight, or refused and stuck — see below), and the operator's earned fees.

The head count was the slow half. Nothing enumerates a Clarity map, so who
staked with whom has to be assembled, and no single list has all of it:

- **The committed rosters** — `src/data/signers/<key>/<cycle>.json`, which the
  refresh already writes: who was in each signer each cycle, with the contract
  each of them was with. This is the half that remembers. A staker who moved
  pools is still owed by the old one for the cycles they were there, and the
  roster for that cycle still has them. It costs nothing — the files are on
  disk.
- **Hiro's staking index** (`/extended/v3/staking/signers/{contract}/stakers`)
  — who is with each signer *now*, which is what catches somebody who staked an
  hour ago. Keyed by the signer contract, so it also has the wrapper joins that
  pox-5's transaction results never name: 165 stakers of Native Pool alone.
  One request per pool.

Together they are about fourteen seconds. What they replaced was a walk through
pox-5's whole transaction history — every successful `stake` and `stake-update`,
whose result names the staker and the signer they ended up with. That is ten
thousand transactions at the endpoint's hard limit of fifty a page, and asking
for the pages together does not help: anonymous, the limit is about fifty
requests a minute, so the walk takes four minutes either way (252 seconds
sequential, 202 in parallel, most of that spent being told to slow down).

`--deep` still runs it, because it is the one source that is neither generated
by this repo nor indexed by anybody — the chain's own record. It finds 2,023
memberships against the other two's 2,173. Of its 45 extras, every one was put
back to `get-signer-cycle-membership` for both cycles and not one had ever been
a member of that pool: they staked and moved again before the cycle they would
have counted in began. The transaction says what somebody asked for; the roster
says what happened.

`--skip-stakers` gives the amounts alone, which need only a handful of calls.

Everything reads the STX-only side (`bond-index: none`). Bond-period rewards
are keyed per bond index and would each need their own read, so rather than
quietly reporting a subset the script checks `total-sbtc-staked` first and says
plainly when there is a subset to miss.

The two halves are counted from different ends — contract totals on one side,
person by person on the other — and they do not quite agree. A share is
computed with integer division, so the shares of a pooled bucket never add back
up to it exactly; the dust stays in the bucket and belongs to nobody in
particular. The report prints the gap rather than leaving a reader to find it.

### Native Pool keeps no books

Most managers keep their own ledger. Native Pool keeps none at all: `claim-rewards`
pulls a whole cycle's sBTC into the contract, and each staker then pulls their
own share out with `claim-staker-rewards`, which reads what they are owed
straight from pox-5 and takes no fee. So there is no `get-unclaimed-staker-rewards`
to ask, and three things have to be read from somewhere else:

    the pile          the contract's plain sBTC balance
    what you're owed  pox-5's get-earned-staker-rewards(signer, cycle, none, staker)
    who has claimed   the contract's own `claim-staker-rewards` print events

That last one is the only record there is, which is why the claim list is
parsed off the event log rather than read from a map. The report names them
with `--list-claims`.

Its members are invisible to the pox-5 walk, too. They never call pox-5
themselves: `native-pool-v1 delegate` calls `stake` for them inside the same
transaction, so the transaction's result is the wrapper's and names nobody.
pox-5's own print event does name them, but its event log cannot be paged back
far enough to reach. So a gated pool is enumerated from its membership roll
instead — and which contract that is comes out of the manager's deployed
source rather than a hardcoded address, since `validate-stake!` has to name its
gate for pox-5 to admit anyone:

    (asserts! (contract-call? .native-pool-v1 is-delegating staker …) …)

Everyone who has *ever* delegated is counted, not only those still delegating:
leaving does not forfeit what a cycle already earned you.

One thing worth knowing before offering to help: `claim-staker-rewards` takes
the staker from `tx-sender`, so **only they can claim it**. Both hops are
permissionless everywhere else in pox-5 — this one is not, and no operator can
sweep it out to people on their behalf.

The shape is detected, not hardcoded: a manager with a public
`claim-staker-rewards` but no read-only getters is holding stakers' money
without books, whoever deployed it.

### Unread is not empty

Under a rate limit the interface read is what fails first, and a pool that
cannot be read must never print as a pool that keeps nothing — those look
identical through a boolean, and the difference was five million sats the first
time this ran. So a pool is one of four things — it keeps its own books, it
holds without books (above), it genuinely keeps nothing, or it could not be
read — and a single unread pool makes the totals unknown rather than low.

## Did everybody get their share?

`report-unclaimed` answers how much is waiting and for how many people.
`pnpm rewards` answers the question behind it, pool by pool and staker by
staker:

```bash
pnpm rewards "native pool" 141 142     # Stacking DAO's ststxBTC product
pnpm rewards max500 --cycles 141 --json
```

For each member of a cycle it puts three numbers side by side — what pox-5
counted for them, what they have taken (from the pool's own
`claim-staker-rewards` prints, the only record there is), and what
`get-earned-staker-rewards` still holds for them — and divides the last two by
the first to get a rate per 1000 STX. **Every member of a cycle should have the
same one**, because pox-5 pays per share, so the report prints the spread and
says what a real one would mean.

Two things it will not do. It will not read a cycle from before pox-5: the
chain says which was its first (`get-first-pox-5-reward-cycle` answers 141), and
asking about 140 prints one line saying so rather than a page of zeros that
looks like a pool which paid nobody. And it will not count a member it could
not read as a member who earned nothing — the first version of this script
asked for all of them at once, earned a 429 for a dozen, and reported paid
stakers as unpaid with a rate that looked like a fee. The reads are paced, one
at a time, and an unread member makes the cycle's totals _not known_ rather than
smaller.

## What am I owed?

`#/rewards/mine` is the address check's sibling: a box, a link you can share,
and one address at a time. It asks the chain — nothing about an address anybody
types can come from a committed file — and looks in both places a staker's sBTC
can be:

- **at pox-5**, `get-earned-staker-rewards(signer, cycle, none, staker)` per
  cycle. Theirs, and only they can move it: the claim reads `tx-sender`, so no
  operator can take it and none can take it for them.
- **at the pool**, once a signer has run `claim-rewards` and that cycle's sBTC
  has left pox-5. Which getter holds it depends on the implementation, so the
  manager is probed for the two that exist and a contract that has neither is
  reported as not saying rather than as holding nothing.

Both, because either alone reads as "you are owed nothing" when the truth is "it
has moved". A cycle the node would not answer for says so; the page never
converts a busy endpoint into an empty balance.

## Recovering a failed distribution

An L1 payout does not always land. The signer manager hands the whole amount
to sBTC as a withdrawal request with the staker's `max-fee` budget attached,
and the sBTC signers either fulfil it on Bitcoin or refuse it. A refusal is not
a loss — the sBTC stays with the pool, reserved against that request — but
nothing hands it back on its own. Until somebody calls
`reclaim-failed-withdrawal`, the money shows as neither pending payout nor
refund, because it is neither.

The usual cause is a fee cap no Bitcoin transaction could be built with.
`check-payout-config` polices only `min-claim > max-fee + DUST_LIMIT`, so a
`max-fee` of 1 sat passes every check on the Stacks side and fails on the
Bitcoin side, one cycle later.

    pnpm plan:recovery
    HIRO_API_KEY=… pnpm plan:recovery --from 2500 --sender SP…

This walks the sBTC registry and writes a Clarinet deployment plan holding one
`reclaim-failed-withdrawal` per rejection. What it keeps is exactly what the
contract will accept: the registry's `status` is `(some false)`, and the pool's
`get-withdrawal-request-staker` still names somebody, so the entry has not
already been reclaimed.

The scan is one read-only call per request ever issued — there is no index of
rejections to ask for — so it is slow anonymously and quick with a key or a
node of your own. `--from` bounds it, since a rejection never un-rejects.

Nothing in it signs or sends. It writes a file and prints what is in it;
applying it is a deliberate second step:

    clarinet deployments apply -p deployments/recover-failed-distributions.mainnet-plan.yaml

Each transaction is expected from the staker it pays, which says plainly whose
money it is and needs their key. `reclaim-failed-withdrawal` is permissionless
and pays the staker whoever sends it, so `--sender` rewrites them all to one
operator — a change in who pays the fees, not in who gets the sats. Every call
carries a comment naming the request, the staker and the sats, because a plan
nobody can read before running it is not a safeguard.

An *accepted* withdrawal nobody has settled is a different thing and not in the
plan. Those distributions worked; only the unused fee budget is outstanding,
recovered with `settle-accepted-withdrawal` then `claim-refund` — and that pair
has an ordering caveat the reclaim does not, since it infers the refund from a
balance rather than reading it off the request.

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

### The wallet's own browser, offered at the top

With WalletConnect off there is no route at all from Safari or Chrome on a
phone: no extension to inject a provider, and nothing in the picker. Leather
and Xverse each ship a browser of their own, and inside one the page reaches
the wallet the ordinary way — for Leather that is the **only** route, since it
does not support WalletConnect at all.

That was said only inside the staking dialog, which is several taps past the
point where somebody has decided the site is no use to them on a phone. So a
small bar now sits at the top of every page with the two links on it — in
`Chrome`, which wraps whichever page is showing and holds both of the bars
that belong to the site rather than to a route. `UpdateBanner` had been
written into all nine route branches by hand; a second bar beside it would
have been nine more copies of a line, which is the point at which a thing on
every page should stop being pasted onto every page. The links come from
`src/lib/wallet-browser.ts` — shared with the phone app, so both ends of the
round trip use the same table — and were fired at a real device:

```
leather://browser?url=…                   the scheme it registers
https://connect.xverse.app/browser?url=…  an app link Xverse verifies
```

Three things about it are decisions rather than details:

- **It is hidden inside a wallet's own browser**, and the test is whether a
  provider has been injected rather than what the user-agent claims. Offering
  "open in Xverse" from inside Xverse is a loop with a worse ending, and a
  wallet browser that does not announce itself in its user-agent would walk
  straight through a sniff. `hasInjectedWallet` is a fact about the page.
- **The decision is made after mount, not during render.** A wallet injects
  while the page is still loading; asking too early sees a page with no wallet
  in it and offers the banner to somebody already inside one.
- **They are anchors, not buttons.** iOS refuses a custom-scheme navigation
  that did not come from a gesture, and a gesture on an anchor is the one it
  always accepts — which is exactly what `leather://` needs.

It closes, and stays closed for that session only. Nothing is written to
storage for it: a banner dismissed on a phone that has since had a wallet
installed on it should come back, and a preference that outlives the reason
for it is worse than one asked twice.

## The phone app

There is also a native app, in [`mobile/`](mobile/) — React Native under Expo,
built against the same `src/lib` this page is built against rather than a copy
of it.

It asks the guide's two questions in the order somebody standing at a bus stop
asks them: **what is a staked STX earning right now**, and **what have I got
staked**. Those are the whole first screen. Everything else the guide knows —
the pool list, the contract pages, the record of every payout, the data's own
provenance — is under a heading below them and one tap away. That placement is
the layout decision: a tab bar would have put "every pool" at equal weight with
"your stake", and they are not of equal weight.

Somebody with nothing staked is asked which **contract** first and which pool
second, for the reason [the contract pages](#how-a-pool-is-identified) exist:
twenty-five of the forty-five deployed signer contracts are the same code, and
that code is what decides how rewards are distributed. It decides nothing about
the STX itself, which stays locked in the staker's own wallet whichever
contract they pick.

### It signs where this page cannot

[`WALLETCONNECT.md`](WALLETCONNECT.md) sets out why the WalletConnect route is
switched off here: the approved session carries no public key, and a page that
builds the transaction itself and asks for a signature has nothing to build
with. It also names the answer if the wallets will not publish one — let the
wallet build and sign, through `stx_callContract` — and that is what the phone
app does. An address-only session is everything it needs, so the route that
fails here works there.

The staking package still returns whole transactions, so a public key goes in
to build one and everything built around it is thrown away: only the contract,
the function name and the arguments are read back out, and the wallet fills in
the spending condition from its own key. The value used is the generator point
of secp256k1, which belongs to nobody, and a test asserts the call is identical
whichever key built it.

### What is shared, and what is not

The staking rules, the rate's arithmetic, the contract grouping, the STX
parsing, the snapshot validators, the payout grouping, the identicon, the fee
thresholds and the signer groups are imported out of `src/lib` by both. Several
of them were moved there for it — `rate-view.ts`, `stx-amounts.ts`,
`snapshot-shape.ts` and `stx-only-cycles.ts` were extracted from the component
or the browser module that used to hold them, with the browser half left
behind, and `pool-filters.ts` followed them out of `App.tsx` the moment the
phone had to answer "is this fee ruinous" too. An app and a site disagreeing
about what somebody earns is not a rounding difference; it is two answers to
the same question — and a threshold copied into two files is how one of them
ends up at 90% for a release nobody notices.

What each app keeps is its own chips, copy and layout. The website offers all
six filters as chips above the list; the phone has one switch, for the fee that
is not a preference, and draws the fee itself in the warning colour instead.
The group pages are the same arithmetic over the same hand-written file, laid
out twice.

What is not shared is anything that reaches for a browser. `data-source.ts`
reads `import.meta.env` and `localStorage`, so the app keeps the same three
copies in the same order of preference in `AsyncStorage` instead.

### Two screens to a first stake

The long way round — read the contracts, compare the pools, set a payout
address and a fee cap and a floor — is six screens and about eleven decisions,
and it is the right way for somebody who wants it. It is also six screens more
than most people will get through the first time, so the app has a short way in
that makes four of those decisions, says which four, and lets each be changed:

| decision | default                         | why that one                                      |
| -------- | ------------------------------- | ------------------------------------------------- |
| pool     | Fast Pool Max500                | a preference, and the screen says so in those words |
| rewards  | as sBTC, in the same wallet     | a mistyped Bitcoin address is rewards nobody gets back, and is not checkable until the first payout |
| period   | the whole of pox-5's maximum    | a stake ends at the close of the cycle whatever period was chosen, so the longest asks the least afterwards |
| amount   | theirs                          | the only field on the screen                      |

Fast Pool wrote the app and runs some of the pools in it, and the pool it
offers first is its own. That is stated on the screen as a preference rather
than dressed up as a neutral filter that happened to land there — which is the
one thing a guide that ranks its rivals cannot do. What can be said for it is
checkable on its own page: the Capped Fee contract, so the fee cannot pass 5%
and a rise has to be announced a month ahead. Changing it is one tap, and if it
ever stops taking stakes the app falls back to the rule it used to use and
prints the rule's reason instead.

```bash
cd mobile
npm install
npm test                 # 187 tests, no device needed
npx expo run:android     # build and install on a connected device
npm run e2e              # Maestro flows, against that device
```

`mobile/README.md` has the rest, including why the on-device tests use a stand-in
wallet: neither Leather nor Xverse nor OKX can be driven by a test runner,
because approving happens in another application.

### It looks like this page now

The app was built dark-only in its own palette, and has moved onto the site's:
cream, ink, grape, mint, amber, out of `src/index.css`, with the same 24px
cards and the same rounded type. Nothing in it is a colour this page does not
already own. It also has a mark of its own — two overlapping circles, a sibling
of `public/fastpool-logo.svg` — instead of Fast Pool's glyph, which made the
guide look like a Fast Pool product rather than a guide that lists Fast Pool
among forty-four others. The new icon set is in `public/` too.

### It speaks Korean, and it turns the lights on

The guide has spoken Korean since `src/locales/ko.ts`, and the app does too —
including the contract descriptions, which come straight out of that file
through `localizeProfile`. The app's own two hundred strings are a catalogue of
their own under `mobile/src/i18n`, because the guide ships its bundle to every
reader on every page load and strings only a phone renders would be paid for by
everybody. Amounts are shared either way: English groups by millions and Korean
by 만 and 억, and both apps ask `@guide/lib/amounts`.

Appearance is light, dark or the phone's, defaulting to the phone's. The light
palette is not the dark one inverted — bitcoin's `#F7931A` is legible as a
44-point figure on white and not as 13-point body text on white, and this app
puts the accent colour on both.

### Shipping it

`mobile/store/` holds the listing for all three stores as files, so a change to
one is reviewable in a pull request rather than retyped into a web form — Play
and App Store Connect in the layouts `fastlane supply` and `fastlane deliver`
expect, Zapstore as the nostr manifest it publishes from. The screenshots in it
are taken from the app actually running against mainnet, and can be taken again
with one command.

[`bitrise.yml`](bitrise.yml) at the root builds it. `check` runs on every push:
types, 187 tests, and a Metro bundle — that last one because the app resolves
`@guide/*` across the project root, and a module that resolves under Node and
not under Metro is exactly the failure that cannot be typechecked. A `mobile-v*`
tag builds an AAB for Play's internal track and a signed APK for Zapstore, and
pushes both listings from those files. Promoting to production stays a decision
somebody makes after looking at the build.
