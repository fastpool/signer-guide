import type { SourceMatch } from './canonical';

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

  /** Contract text the feature decisions came from. */
  evidence: {
    bitcoinRewards: string | null;
    openToAnyone: string | null;
    maxFee: string | null;
  };
}

export interface SignerData {
  generatedAt: string;
  /** Cycle the fees were read for. */
  feeCycle: number;
  signers: Signer[];
}
