import type { SourceMatch } from './canonical';
import type { FeeChangeNotice, FeeExemption } from './features';

/** One deployed signer contract, as the generator records it. */
export interface Signer {
  contractId: string;
  /** The pool's own name, tidied up from the contract name. */
  displayName: string;
  /**
   * Where `displayName` came from.
   *
   * `contract` is the generator making the best it can of the contract's own
   * name — `signer-manager-pox5` becomes "Pox5", which is not what anyone
   * calls that pool. A guess, in other words, and the page says so by setting
   * those names in italic rather than printing them like a fact.
   *
   * `manual` means a person put the name in `signers-manual.json` and said in
   * the entry's note where they got it. Those carry a tick on the page. The
   * distinction is the whole reason this field exists: a reader deciding where
   * to stake should be able to tell a pool that told us its name from a string
   * we made up out of its contract id.
   *
   * Written by `applyManualData`, never by hand — see scripts/manual-data.ts.
   */
  displayNameSource: 'manual' | 'contract';
  /**
   * The implementation it runs, when we recognise the code.
   *
   * A copy of the profile's name, taken when this file was written — the
   * generator writes `profile?.name` and nothing may set it by hand. Nothing
   * should render it directly: it goes stale between a rename and the next
   * refresh, and it is only ever the English name. Ask `contractTypeName`,
   * which prefers the profile and keeps this as the fallback for a build that
   * does not know the profile yet.
   */
  implementationName: string | null;
  registered: boolean;
  /**
   * The reward cycle this pool was first seen in.
   *
   * The guide's own record, not the chain's: nothing on chain says when a
   * signer registered. Kept from the previous file once set, so it says when
   * the guide first noticed a pool and never moves afterwards. Absent on a
   * pool last written before this field existed — which is itself evidence
   * that it is not new.
   */
  firstSeenCycle?: number;
  signerKey?: string;

  sourceSha256: string;
  canonicalSha256: string;
  /** Grouping key — canonical, ignoring whitespace beside parens. */
  groupSha256: string;
  /**
   * SIP-043's identicon hash: SHA-512/256 of the standardised source, which
   * is what `clarinet format` makes of the deployed source. Not one of the
   * three above — those are ours and mean something only here, this one is
   * the number every implementation of the SIP computes. Null when the
   * formatter would not take the contract. See scripts/identicon.ts.
   */
  identiconHash: string | null;
  /** How it compares to a reviewed implementation. */
  match: SourceMatch;
  /** Reviewed implementation this shares code with, when known. */
  profileId: string | null;

  bitcoinRewards: boolean;
  openToAnyone: boolean;
  /** Fee in basis points right now; null when the contract has no fee call. */
  feeBips: number | null;
  /** Ceiling the contract enforces on its fee, in bips; null when it has none. */
  maxFeeBips: number | null;
  /** Warning a fee change must give; null when a new fee is immediate. */
  feeChangeNotice: FeeChangeNotice | null;
  /** Stakers charged nothing whatever the fee is; null when all pay alike. */
  feeExemption: FeeExemption | null;

  /**
   * sBTC the contract is holding for its stakers and has not paid out, in
   * sats. `get-unclaimed-staker-rewards` in the Standard contract, and
   * whatever the equivalent no-argument getter is called elsewhere.
   *
   * A pool empties this out as each staker is paid, so a large one means
   * money is sitting in the contract that belongs to the people in it. It
   * never reaches exactly zero — the per-token maths truncates on every
   * share and the last few sats stay behind — so read a few sats as done and
   * only a real number as outstanding.
   *
   * Null when the contract publishes no such total, or the node would not
   * answer. Not zero: a pool shown as holding nothing when it is holding
   * somebody's rewards would be a lie about their money.
   *
   * Optional, like the two below it, because the page reads `signers.json`
   * from the published branch at runtime as well as from its own bundle — so
   * an installed app will meet files written before these were recorded.
   * Absent means the same as null to every reader of it.
   */
  undistributedSats?: string | null;
  /**
   * sBTC pox-5 has earned for this signer that no `claim-rewards` has pulled
   * in yet, in sats — the STX leg, across every cycle pox-5 has.
   *
   * This is the answer to "has this pool claimed the last distribution?".
   * pox-5 zeroes it when the pool claims and it grows again at the next
   * distribution, so zero means caught up and anything else is a payout the
   * pool's stakers cannot reach yet. Read from pox-5 rather than from the
   * signer manager, so it means the same thing for every implementation.
   *
   * Every cycle, not the current one: `get-earned` is keyed by the cycle the
   * rewards were earned in, and a cycle's second distribution lands on its
   * last block — so asking about the cycle we are standing in answers zero for
   * a pool sitting on last cycle's payout, which is the pool this exists to
   * catch.
   */
  unclaimedFromPoxSats?: string | null;
  /**
   * The earliest cycle this pool might still be owed for. Generator
   * bookkeeping, not a fact about the pool.
   *
   * A settled cycle a pool has emptied can never owe it anything again, so the
   * refresh stops asking about it and records where to start next time. Absent
   * on a file written before this existed, which costs a run that asks from
   * the beginning — a slower answer, never a wrong one.
   */
  unclaimedFromCycle?: number;
  /**
   * Fees this contract has taken and the operator has not withdrawn, in sats.
   *
   * A balance, not a lifetime total: `withdraw-fees` subtracts from it. So
   * this is what the pool is holding for itself, next to `undistributedSats`,
   * which is what it is holding for everybody else. Null when the contract
   * keeps no fee, which is not the same as a fee of nothing — see `feeBips`.
   */
  earnedFeesSats?: string | null;

  /** Contract text the feature decisions came from. */
  evidence: {
    bitcoinRewards: string | null;
    openToAnyone: string | null;
    maxFee: string | null;
  };
  callApi?: 'pox5' | 'nativePool';
}

export interface SignerData {
  generatedAt: string;
  /** Reward cycle current when this was generated. */
  cycle: number;
  /**
   * The `clarinet --version` that produced the identicon hashes below, so the
   * icons on the page can be reproduced. Null before anything has been
   * standardised. Not what ran most recently: an hourly refresh carries the
   * hashes forward without a formatter, and carries this with them.
   */
  standardisedWith: string | null;
  signers: Signer[];
}

/**
 * What each pool is looking after, as `src/data/totals.json` holds it.
 *
 * Deliberately no timestamp. The refresh commits this file, so a "read at"
 * that moved every hour would be a commit every hour saying nothing — the
 * same noise `describe-signer-changes.ts` exists to keep out of the history.
 * The cycle is what a reader needs, and it is in here.
 */
export interface LockedTotals {
  /** Reward cycle the amounts are for. */
  cycle: number;
  /** uSTX per contract id as a string; null for a pool we could not read. */
  ustx: Record<string, string | null>;
  /**
   * The cycle after it, which is still filling — same shape, one cycle on.
   *
   * Absent rather than empty when it could not be read, and absent from the
   * files written before it existed, so a reader that has one of those in
   * local storage keeps working.
   */
  next?: {
    cycle: number;
    ustx: Record<string, string | null>;
  };
  /**
   * The cycle before it, which is over and cannot change again.
   *
   * Never read from the chain: a settled cycle's amounts are whatever the last
   * refresh recorded while it was the current one, so this is carried forward
   * from the previous file rather than asked for again. It is what lets the
   * page tell a pool nobody has used for two cycles from one that emptied
   * yesterday.
   */
  previous?: {
    cycle: number;
    ustx: Record<string, string | null>;
  };
}

/**
 * Static inputs and outputs for the STX-only rewards estimate card.
 *
 * Written by scripts/generate-stx-only-calculations.ts in the hourly refresh.
 * Values are strings where the page uses bigint arithmetic.
 */
/**
 * One pox-5 distribution, as `src/data/stx-only-history.json` holds it.
 *
 * pox-5 computes rewards every 1050 burn blocks — half a reward cycle — so a
 * cycle has two of these, and what a staker was paid for the cycle is the two
 * added together.
 */
export interface StxOnlyDistribution {
  /** The reward cycle it belongs to. */
  cycle: number;
  /** pox-5's own distribution index, two to a reward cycle. */
  distributionIndex: number;
  /** First of the cycle's two, or second. */
  firstOfCycle: boolean;
  /** Burn height of the computation that closed it. */
  burnHeight: number;
  /**
   * pox-5's `rewards-per-token-for-cycle` at that point, which accumulates
   * across the cycle — so the second of a pair carries the first as well.
   */
  cumulativeRewardsPerUstx: string;
  /**
   * What this one distribution paid, in sats per 1000 STX.
   *
   * Null is "not worked out", never "nothing". The second of a pair is the
   * cumulative figure minus the first, and the first is only ever seen by a
   * run that happened between the two payouts; a refresh that missed that
   * window cannot recover it afterwards, and says so rather than printing the
   * pair's total as though one payout had paid it.
   */
  rateSatsPer1000Stx: string | null;
}

/** Every distribution the refresh has seen, as its own committed file. */
export interface StxOnlyHistory {
  generatedAt: string;
  /** Oldest first. */
  distributions: StxOnlyDistribution[];
}

export interface StxOnlyCalculations {
  cycle: number;
  distributionBlocks: number;
  blocksIntoCycle: number | null;
  blocksLeftInCycle: number | null;
  currentBurnHeight: number | null;
  /** Burn height of the last `calculate-rewards`, which is when the accrual
   * window `accruedRewardsSats` covers began. */
  lastRewardBurnHeight: number | null;
  nextRewardBurnHeight: number | null;
  totalStakedUstx: string;
  bondStakedUstx: string;
  stxOnlyStakedUstx: string;
  stxPriceSats: string | null;
  /** Everything pox-5 holds in sBTC: the accrual below, plus rewards earned
   * and not yet claimed, plus the reserve, plus sBTC staked against bonds.
   * Context only — nothing is computed from it, see the note in
   * scripts/generate-stx-only-calculations.ts. */
  sbtcBalanceSats: string | null;
  /** pox-5's `get-new-rewards`: sBTC that has arrived since the last
   * `calculate-rewards` and is not yet accounted to anyone. The base every
   * figure below is derived from. */
  accruedRewardsSats: string | null;
  bondShareSats: string | null;
  foundationShareSats: string | null;
  stxOnlySoFarSats: string | null;
  projectedCycleSats: string | null;
  /** What this cycle's own accrual so far works out to, extrapolated. Noisy
   * in the first blocks after a payout, which is why it is not the headline. */
  projectedRateSatsPer1000Stx: string | null;
  /** The reward cycle the last `calculate-rewards` paid out for. */
  lastPayoutCycle: number | null;
  /** What that payout actually paid, from pox-5's own rewards-per-token. Not
   * an estimate. */
  lastPayoutRateSatsPer1000Stx: string | null;
  /** pox-5's cumulative rewards-per-token for `lastPayoutCycle`. Bookkeeping:
   * a cycle holds two payouts, so the next run subtracts this to read the
   * second one on its own. See scripts/generate-stx-only-calculations.ts. */
  cumulativeRewardsPerUstx: string | null;
  /** The published rate: `projectedRateSatsPer1000Stx` weighted by how far
   * the cycle has run, `lastPayoutRateSatsPer1000Stx` for the rest. */
  rateSatsPer1000Stx: string | null;
  generatedAt: string;
}

/**
 * What is known about the signer nodes, as `src/data/signer-nodes.json`.
 *
 * The pools are one thing and the nodes behind them another. This is the
 * second: what each signer key weighs in the signer set, what it says it is
 * running, and how it has behaved. Written by the refresh — see
 * scripts/generate-signer-nodes.ts, which also sets out what could not be
 * found and why, region being the one people ask for.
 */
export interface SignerNodeRecord {
  /** Bare hex, no 0x — the one spelling three sources had between them. */
  signerKey: string;
  /** What the guide calls the pools on this key; empty for a key it cannot name. */
  pools: string[];
  /** Groups those pools belong to — see src/data/signer-groups.json. */
  groups: string[];
  /** What the guide's own committed amounts say this key holds, as uSTX. */
  ourUstx: string | null;
  /** Its seat in the cycle's signer set, or null for a key with none. */
  seat: {
    /** Whole slots. Their total is `slots` below, never a constant. */
    weight: number;
    weightPercent: number;
    stackedUstx: string;
    signerAddress: string;
  } | null;
  /**
   * The signer protocol version it broadcasts, not the version of the binary —
   * nothing publishes that. `local` under `active` is a node behind the
   * network.
   */
  version: { local: number; active: number; observedAt: string | null } | null;
  /** How it behaved over `blocks` blocks. Null when it could not be read. */
  behaviour: {
    participationRate: number;
    degradationRate: number;
    signedCount: number;
    missedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    preCommitRate: number;
  } | null;
}

export interface SignerNodesData {
  generatedAt: string;
  cycle: number;
  /** How many blocks the behaviour figures cover. */
  blocks: number;
  /** Slots the cycle shared out. Read, never assumed: it has changed before. */
  slots: number;
  /**
   * uSTX per slot: the seated STX over the slots.
   *
   * The number that decides who is in the signer set. Slots are shared in
   * proportion and rounded, so under half a slot is no seat at all — which is
   * how a pool holding 50,020 STX kept its seat in cycle 141 at 0.5097 slots
   * and lost it in 142 at 0.4746, without moving a single STX.
   */
  ustxPerSlot: string | null;
  /** Every uSTX pox-5 counts as stacked. What the guide divides by. */
  stackedUstx: string;
  /** The uSTX that got a seat. What the signer set divides by. */
  seatedUstx: string;
  nodes: SignerNodeRecord[];
}

/**
 * One signer's history, as `src/data/signers/<slug>.json` holds it.
 *
 * The unit is the signer key rather than the contract, for the reason set out
 * at the top of scripts/signer-members.ts: a key can have several
 * signer-manager contracts registered against it, and everything the key
 * decides is decided on them together. Read per contract, half a signer looks
 * like a small pool and the other half like another one.
 *
 * Not bundled with the build and not part of the snapshot — the page fetches
 * it when a reader opens one signer, because nobody opening the list needs
 * the other forty-five. See src/lib/signer-history.ts.
 */
export interface SignerHistory {
  /** Null for a contract with no key on file, which stands on its own. */
  signerKey: string | null;
  /** Contract ids registered against this key at the last refresh. */
  contractIds: string[];
  /** Newest first, so the cycle a reader wants is the one they land on. */
  cycles: SignerCycleSummary[];
  /**
   * The cycle the chain was in when this was written.
   *
   * What each cycle *is* to a reader is a comparison against this and nothing
   * else: the one above it is filling and can still be joined, this one is
   * locked and earning now, the ones below are done. That is a different
   * question from `SignerCycleSummary.final`, which is only about what the
   * generator will bother to read again — see the note there.
   *
   * Optional because the page reads the published branch, so it will meet
   * files written before this field existed. Absent means the standings cannot
   * be worked out, which is a reason to leave the labels off — not a reason to
   * throw away the amounts and member counts in the same file, and not a
   * reason to guess. See `cycleStanding`.
   */
  currentCycle?: number;
  generatedAt: string;
}

/**
 * What one signer held in one cycle, and how much is known about who held it.
 *
 * The members themselves are not in here. A busy signer has thousands of them
 * and a reader opening the page wants the shape of the thing, not four
 * megabytes of addresses — so each cycle's list is its own file, fetched only
 * if somebody asks for that cycle. What is here is what the summary needs:
 * the amounts, and enough about the list to say whether it can be trusted.
 */
export interface SignerCycleSummary {
  cycle: number;
  /** uSTX per contract id; null for one the node would not answer for. */
  ustx: Record<string, string | null>;
  /**
   * How many members the list for this cycle has, or null when no list has
   * been built yet. Zero is a signer nobody staked with, which is a fact; null
   * is one we have not walked, which is not the same and must not read as one.
   */
  memberCount: number | null;
  /**
   * True when the members' amounts add up to what pox-5 says the signer holds.
   *
   * The one check worth carrying to the page. Both numbers come from pox-5, so
   * they agree unless somebody staking here is missing from Hiro's index or the
   * walk was cut short — either way the list below is short, and the page says
   * so rather than presenting it as everybody.
   */
  membersAddUp: boolean;
  /**
   * How many times the members have been walked.
   *
   * The generator's business, not the page's. A list that does not add up is
   * usually a rate limit and is worth asking about again — but not for ever,
   * and a frozen cycle retried every hour is a bill that never stops. See
   * MAX_WALKS in scripts/generate-signer-history.ts.
   */
  walks: number;
  /**
   * When the members were last walked, as an ISO timestamp.
   *
   * Shown to the reader, unlike the two flags below: a member list for a cycle
   * that is still open is a photograph rather than a fact, and how old the
   * photograph is decides how much to read into it. Also what the generator
   * rates the once-a-day limit against — see REWALK_AFTER_MS.
   *
   * Null for a cycle nobody has walked, and absent in files written before
   * this was recorded, which the page and the generator both read as "long
   * enough ago that it is worth asking again".
   */
  walkedAt: string | null;
  /**
   * What the signer held at the moment the members were walked.
   *
   * The list is only as true as this number: while the two agree, nobody has
   * joined, left or changed their stake since it was made. It cannot be
   * inferred from `ustx`, which is refreshed every hour whether or not the
   * members are — comparing this run's amounts against last run's would mean a
   * move that happens while a walk is being held back is never noticed again,
   * because the next run finds the amounts already agreeing with each other.
   */
  walkedUstx: string | null;
  /**
   * True once **this record** is finished: the generator will not read the
   * cycle from the chain again.
   *
   * The generator's business, like `walks`, and not a statement about the
   * cycle. Deliberately conservative — it stays false for the current cycle,
   * which is almost certainly settled, as one cycle of insurance against that
   * reasoning being wrong. `cycle < currentCycle`.
   */
  fileFinal: boolean;
  /**
   * True once **the cycle** is finished: nobody can join it any more.
   *
   * A fact about the chain rather than about our data, and the one the page
   * speaks from. Stacking for a cycle is locked in before that cycle begins,
   * so exactly one cycle is ever open — the next one. The cycle a reader is
   * standing in is closed and earning, not filling. `cycle <= currentCycle`.
   *
   * The two flags differ for exactly one cycle, the current one, and that is
   * the whole reason there are two: the record is still being re-read while
   * the cycle itself is shut. Collapsing them is what once labelled the cycle
   * a reader was in as one they could still join.
   */
  cycleFinal: boolean;
}

/** One cycle's members, as `src/data/signers/<slug>/<cycle>.json` holds it. */
export interface SignerCycleMembers {
  signerKey: string | null;
  cycle: number;
  /** Largest first: the question behind "who is in this pool" is who most of it is. */
  members: CycleMember[];
}

export interface CycleMember {
  /** An address, or `address.name` for a contract that stakes. */
  staker: string;
  ustx: string;
  /** Which of the signer's contracts they are with. */
  contractId: string;
}

/**
 * How one signer answered the miners for one cycle.
 *
 * pox-5 weights a signer by the STX behind it and says nothing about whether
 * it does the job. This is the other half: every block a miner proposed, the
 * signer either accepted it, rejected it, or was not there — and when it did
 * answer, how long the miner waited. From Hiro's signer-metrics API, which
 * keeps it per cycle back to the first Nakamoto one.
 */
export interface SignerCyclePerformance {
  cycle: number;
  accepted: number;
  rejected: number;
  /** Proposals it never answered at all. */
  missed: number;
  /**
   * Mean milliseconds from proposal to answer, or null.
   *
   * Null is "it answered nothing, so nothing was timed". The API reports 0 for
   * that, which reads as instant — the fastest signer on the page — when what
   * happened is that the node was never there. A zero that means its opposite
   * is worse than a gap, so it is stored as a gap.
   */
  responseMs: number | null;
  /** When anything was last heard from it, or null for never. */
  lastSeen: string | null;
  /** Its seat that cycle: whole slots, and what share of the set that is. */
  weight: number;
  weightPercent: number;
  /**
   * False while the cycle is still running.
   *
   * The counts are cumulative, so an open cycle's row is a cycle so far. A
   * signer that has missed a hundred blocks of a cycle two hours old is not a
   * signer that missed a hundred blocks of a fortnight.
   */
  final: boolean;
}

/** One key's whole record, as `src/data/performance/<key>.json` holds it. */
export interface SignerPerformance {
  /** Bare hex, no 0x — the spelling the node files use. */
  signerKey: string;
  /** Newest first, like the signer history files. */
  cycles: SignerCyclePerformance[];
}

/**
 * The current cycle's conduct for every seated signer, as
 * `src/data/performance.json` holds it.
 *
 * Small enough to ship with the pool list — twenty-six rows — because the
 * question "is this signer doing the job" belongs on the page a reader is
 * already on, not behind a request they have to know to make. The history
 * behind it is per key and fetched only when somebody opens one.
 */
export interface PerformanceData {
  generatedAt: string;
  /** The cycle `signers` describes. */
  cycle: number;
  /** Every cycle with a file, oldest first. */
  cycles: number[];
  /** By bare signer key. A seated signer with no row was not in the answer. */
  signers: Record<string, SignerCyclePerformance>;
}

/**
 * A signer key that changed under a contract.
 *
 * Nothing on chain announces one, and nothing in this guide would have shown
 * it: `signers.json` holds the key a contract has now and has never held what
 * it had before. So the refresh writes down what it sees change, and the file
 * is a log rather than a snapshot — the one record of a rotation there is.
 *
 * It matters because a cycle's signer set is fixed before the cycle starts.
 * Rotate, and the old key keeps the seat until the next set is computed while
 * the new one holds nothing — a pool with no weight beside a weight with no
 * pool, which is one operator and not two problems.
 */
export interface KeyRotation {
  contractId: string;
  /** Bare hex with the 0x, as `signers.json` spells them. */
  from: string | null;
  to: string | null;
  /** When the guide saw it, which is the only timestamp there is. */
  observedAt: string;
  /** The cycle it was seen in, or null when that could not be read. */
  cycle: number | null;
}

export interface KeyRotations {
  generatedAt: string;
  /** Oldest first. */
  rotations: KeyRotation[];
}
