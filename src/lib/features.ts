/**
 * What a signer contract lets you do, read from its own source.
 *
 * Three things are decided here, all of them written into the contract:
 * whether rewards can go to Bitcoin, whether anyone may join, and whether the
 * fee has a real ceiling.
 *
 * The fee a pool charges *today* is not decided here — it is a stored value
 * the operator can change, so it is read live per signer (see `fetchFeeBips`)
 * and always shown as "right now". A ceiling is different: Juice Pool caps
 * its fee at 20% in code, so that one is a genuine promise and is detected
 * from the source. Most contracts only stop a fee of 100% or more, which is
 * no promise at all and is reported as no ceiling.
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
  /**
   * Name of the read-only that reports the current fee, when there is one.
   * Contracts differ: the Standard one takes a cycle and a bond index,
   * Juice Pool takes nothing. Assuming a single name reported a real fee as
   * "not set in this contract", so the name is detected rather than guessed.
   */
  feeFunction: 'get-fee-bips-for-cycle' | 'get-fee-bips' | null;
  /**
   * Ceiling the contract itself puts on its fee, in basis points, or null
   * when it has none worth the name. A limit of 100% is not a limit, so it is
   * reported as null.
   */
  maxFeeBips: number | null;
  /** The assertion that enforces the ceiling. */
  maxFeeEvidence: string | null;
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

const BIPS_100_PERCENT = 10_000;

/**
 * The ceiling the contract puts on its own fee, if any.
 *
 * Looks in every public function whose name mentions a fee for an assertion
 * comparing the proposed fee against a named constant, then resolves that
 * constant. Juice Pool does this with `MAX_FEE_BIPS u2000`, so its fee can
 * never exceed 20% however the operator behaves.
 *
 * A ceiling of 100% is reported as none: `MAX_BIPS u10000` in the Standard
 * contract stops a fee of 100% or more and nothing else, which is no promise
 * to a staker.
 */
function detectMaxFeeBips(source: string): {
  bips: number | null;
  evidence: string | null;
} {
  const constants = new Map<string, number>();
  for (const m of source.matchAll(/\(define-constant\s+([A-Z0-9_]+)\s+u(\d+)\)/g)) {
    constants.set(m[1], Number(m[2]));
  }

  let best: { bips: number; evidence: string } | null = null;

  for (const fn of source.matchAll(/\(define-public \(([a-z0-9!-]*fee[a-z0-9!-]*)/gi)) {
    const body = extractPublicFunction(source, fn[1]);
    if (!body) continue;

    for (const assertion of stripComments(body).matchAll(
      /\(asserts!\s+\((<=?)\s+([a-z0-9-]+)\s+([A-Z0-9_]+)\)[^\n]*/g,
    )) {
      const limit = constants.get(assertion[3]);
      if (limit === undefined || limit >= BIPS_100_PERCENT) continue;
      if (!best || limit < best.bips) {
        best = { bips: limit, evidence: assertion[0].trim() };
      }
    }
  }

  return { bips: best?.bips ?? null, evidence: best?.evidence ?? null };
}

export function detectFeatures(source: string): SourceFeatures {
  const maxFee = detectMaxFeeBips(source);
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
    feeFunction: /define-read-only \(get-fee-bips-for-cycle/.test(source)
      ? 'get-fee-bips-for-cycle'
      : /define-read-only \(get-fee-bips[\s)]/.test(source)
        ? 'get-fee-bips'
        : null,
    maxFeeBips: maxFee.bips,
    maxFeeEvidence: maxFee.evidence,
  };
}
