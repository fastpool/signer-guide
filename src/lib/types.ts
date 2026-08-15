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
  /** The implementation it runs, when we recognise the code. */
  implementationName: string | null;
  registered: boolean;
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
}

/**
 * Static inputs and outputs for the STX-only rewards estimate card.
 *
 * Written by scripts/generate-stx-only-calculations.ts in the hourly refresh.
 * Values are strings where the page uses bigint arithmetic.
 */
export interface StxOnlyCalculations {
  cycle: number;
  distributionBlocks: number;
  blocksIntoCycle: number | null;
  blocksLeftInCycle: number | null;
  currentBurnHeight: number | null;
  nextRewardBurnHeight: number | null;
  totalStakedUstx: string;
  bondStakedUstx: string;
  stxOnlyStakedUstx: string;
  stxPriceSats: string | null;
  sbtcBalanceSats: string | null;
  bondShareSats: string | null;
  foundationShareSats: string | null;
  stxOnlySoFarSats: string | null;
  projectedCycleSats: string | null;
  rateSatsPer1000Stx: string | null;
  generatedAt: string;
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
