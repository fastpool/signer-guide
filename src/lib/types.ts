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
  callApi?: "pox5" | "nativePool" ;
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
