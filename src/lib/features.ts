/**
 * What a signer contract lets you do, read from its own source.
 *
 * Only two things are decided here, because only two are actually written
 * into the contract. Fees are NOT: every implementation reviewed so far lets
 * the operator change the fee at any time, and the only on-chain limit is
 * `MAX_BIPS = u10000`, i.e. 100%. So the fee is read live per signer instead
 * (see `fetchFeeBips`) and always presented as "right now", never as a cap.
 *
 * Each detector returns the snippet it matched on, so a claim on the page can
 * always be traced back to a line of Clarity.
 */

export interface FeatureEvidence {
  value: boolean;
  /** The contract text the decision was made from, for display and audit. */
  evidence: string | null;
}

export interface SourceFeatures {
  /** Rewards can be paid to a Bitcoin address on L1. */
  bitcoinRewards: FeatureEvidence;
  /** Anyone may stake with this signer; no allowlist or pool membership. */
  openToAnyone: FeatureEvidence;
  /** The contract exposes a per-cycle fee that can be read. */
  hasFeeFunction: boolean;
}

/** Pull one top-level `define-public` form out by balancing parentheses. */
export function extractPublicFunction(
  source: string,
  name: string,
): string | null {
  const start = source.indexOf(`(define-public (${name}`);
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const stripComments = (source: string) => source.replace(/;;[^\n]*/g, '');

export function detectFeatures(source: string): SourceFeatures {
  const validateStake = stripComments(
    extractPublicFunction(source, 'validate-stake!') ?? '',
  );

  // pox-5 hands the signer an optional `signer-calldata`. A manager that
  // supports Bitcoin payouts decodes a pox-addr from it and records it, so
  // rewards can be sent to L1 instead of as sBTC on Stacks.
  const poxAddrMatch = /\(\s*(?:try!\s*\()?\s*check-pox-addr[^\n]*/.exec(
    validateStake,
  );
  const recordsPoxAddr =
    /pox-addr/.test(validateStake) &&
    /check-pox-addr|map-set\s+pox-addrs/.test(validateStake);

  // A gate only counts as "you may not join" if it tests the staker.
  //
  // Not every `asserts!` is a door: managers also assert that the caller is
  // pox-5, or that the pool is not paused. Those apply to everyone equally
  // and say nothing about who is welcome. Contracts differ in whether the
  // caller check sits in a helper (`authorize-pox-5`) or is inlined, so
  // counting bare asserts misreads the inlined ones as invite-only.
  const gates = [...validateStake.matchAll(/\(asserts!\s+([^\n]+)/g)]
    .map((m) => m[1].trim())
    .filter((gate) => /\bstaker\b/.test(gate));

  return {
    bitcoinRewards: {
      value: recordsPoxAddr,
      evidence: recordsPoxAddr ? (poxAddrMatch?.[0]?.trim() ?? null) : null,
    },
    openToAnyone: {
      value: validateStake.length > 0 && gates.length === 0,
      // For a gated signer the evidence is the gate itself.
      evidence: gates.length > 0 ? gates[0] : null,
    },
    hasFeeFunction: /define-read-only \(get-fee-bips-for-cycle/.test(source),
  };
}
