import type { SourceMatch } from './canonical';
import type { FeeChangeNotice, FeeExemption } from './features';

/** One deployed signer contract, as the generator records it. */
export interface Signer {
  contractId: string;
  /** The pool's own name, tidied up from the contract name. */
  displayName: string;
  /** The implementation it runs, when we recognise the code. */
  implementationName: string | null;
  registered: boolean;
  signerKey?: string;

  sourceSha256: string;
  canonicalSha256: string;
  /** Grouping key — canonical, ignoring whitespace beside parens. */
  groupSha256: string;
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
