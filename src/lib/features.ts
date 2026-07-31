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

export interface FeeChangeNotice {
  amount: number;
  /** Burn blocks (~10 minutes) or reward cycles (~2 weeks). */
  unit: 'blocks' | 'cycles';
  /** The Clarity that enforces the wait. */
  evidence: string;
}

export interface SourceFeatures {
  /** Rewards can be paid to a Bitcoin address on L1. */
  bitcoinRewards: FeatureEvidence;
  /** Anyone may stake with this signer; no allowlist or pool membership. */
  openToAnyone: FeatureEvidence;
  /**
   * Where the fee in force *right now* is kept, or null when this contract
   * does not hold one.
   *
   * Not `get-fee-bips-for-cycle`, which is the trap here: in the Standard
   * contract that reads a map written only when a cycle's rewards are
   * crystallised, and it is `(default-to u0 ...)`. No pox-5 cycle has settled
   * yet, so it answers "0%" for every pool no matter what the operator has
   * set — which the guide then printed as "no fee right now". The live rate
   * is the `fees-bips` data var; Juice Pool exposes its own through a
   * no-argument read-only instead.
   */
  feeReading:
    | { kind: 'read-only'; name: string }
    | { kind: 'data-var'; name: string }
    | null;
  /**
   * Ceiling the contract itself puts on its fee, in basis points, or null
   * when it has none worth the name. A limit of 100% is not a limit, so it is
   * reported as null.
   */
  maxFeeBips: number | null;
  /** The assertion that enforces the ceiling. */
  maxFeeEvidence: string | null;
  /**
   * How much warning the contract makes a pool give before a fee change
   * applies, or null when a new fee can take effect at once. Contracts count
   * in different units, so the unit travels with the number.
   */
  feeChangeNotice: FeeChangeNotice | null;
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
  for (const m of source.matchAll(
    /\(define-constant\s+([A-Z0-9_]+)\s+u(\d+)\)/g,
  )) {
    constants.set(m[1], Number(m[2]));
  }

  let best: { bips: number; evidence: string } | null = null;

  for (const fn of source.matchAll(
    /\(define-public \(([a-z0-9!-]*fee[a-z0-9!-]*)/gi,
  )) {
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

/**
 * How much warning a pool has to give before a fee change bites.
 *
 * Two shapes in the wild, and the unit differs:
 *
 *   Juice Pool waits out burn blocks —
 *     (asserts! (>= burn-block-height (+ (var-get pending-fee-height) FEE_COOLDOWN)))
 *     with FEE_COOLDOWN u144, about a day.
 *
 *   Fast Pool's max500 queues by reward cycle —
 *     (var-set pending-fees-cycle (+ cycle FEE_ACTIVATION_DELAY_CYCLES))
 *     with FEE_ACTIVATION_DELAY_CYCLES u2, about a month, and
 *     (if (>= (current-cycle) (var-get pending-fees-cycle)) ...) deciding
 *     which rate is live.
 *
 * Matched on the shape rather than on names, so a contract that calls its
 * steps something else is still picked up. The queued form additionally
 * requires the contract to read the stored point back before applying the new
 * rate: storing a number proves nothing on its own.
 */
function detectFeeChangeNotice(source: string): FeeChangeNotice | null {
  const constants = new Map<string, number>();
  for (const m of source.matchAll(
    /\(define-constant\s+([A-Z0-9_]+)\s+u(\d+)\)/g,
  )) {
    constants.set(m[1], Number(m[2]));
  }

  /** A named constant or an inline `uN` from a fragment of Clarity. */
  const resolve = (fragment: string): number | undefined => {
    const named = /\b([A-Z0-9_]+)\b/.exec(fragment);
    if (named) return constants.get(named[1]);
    const inline = /\bu(\d+)\b/.exec(fragment);
    return inline ? Number(inline[1]) : undefined;
  };

  const clean = stripComments(source);

  for (const fn of clean.matchAll(
    /\(define-public \(([a-z0-9!-]*fees?[a-z0-9!-]*)/gi,
  )) {
    const body = extractPublicFunction(clean, fn[1]);
    if (!body) continue;

    // Waits out blocks before the change may be applied.
    const guard =
      /\(asserts!\s+\(>=?\s+(?:burn-block-height|stacks-block-height)\s+\(\+\s+([\s\S]{0,120}?)\)\s*\)/.exec(
        body,
      );
    if (guard) {
      const amount = resolve(guard[1]);
      if (amount !== undefined && amount > 0) {
        return {
          amount,
          unit: 'blocks',
          evidence: guard[0].replace(/\s+/g, ' ').trim(),
        };
      }
    }

    // Queues the change for a cycle some way off.
    const queued =
      /\(var-set\s+([a-z0-9-]*(?:pending|activation)[a-z0-9-]*)\s+\(\+\s+([\s\S]{0,80}?)\)\s*\)/.exec(
        body,
      );
    if (!queued) continue;

    const amount = resolve(queued[2]);
    if (amount === undefined || amount <= 0) continue;

    // The stored point has to be read back, or it is decoration.
    const honoured = new RegExp(
      `\\(>=?\\s+\\(current-cycle\\)\\s+\\(var-get\\s+${queued[1]}\\)`,
    ).test(clean);
    if (!honoured) continue;

    return {
      amount,
      unit: 'cycles',
      evidence: queued[0].replace(/\s+/g, ' ').trim(),
    };
  }

  return null;
}

/**
 * Where to read the fee a pool charges today.
 *
 * A no-argument read-only getter wins when there is one — Juice Pool has
 * `get-fee-bips`, and a getter may compute rather than simply store. Failing
 * that, the fee lives in a data var, which the node will hand over directly.
 *
 * Deliberately not `get-fee-bips-for-cycle`: see the note on `feeReading`.
 * A pool with neither reads as "not set in this contract", which is honest —
 * `native-pool-signer-manager` really does take its fee elsewhere.
 */
function detectFeeReading(source: string): SourceFeatures['feeReading'] {
  // `get-active-fee-bips` in max500: the rate in force once a queued change
  // has matured, which is not always what the `fees-bips` var still says.
  const getter = /\(define-read-only \((get-(?:active-)?fees?-bips)\s*\)/.exec(
    source,
  );
  if (getter) return { kind: 'read-only', name: getter[1] };

  const variable = /\(define-data-var\s+([a-z0-9-]*fees?-bips)\s+uint/i.exec(
    source,
  );
  if (variable) return { kind: 'data-var', name: variable[1] };

  return null;
}

export function detectFeatures(source: string): SourceFeatures {
  const maxFee = detectMaxFeeBips(source);
  const feeChangeNotice = detectFeeChangeNotice(source);
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
    feeReading: detectFeeReading(source),
    maxFeeBips: maxFee.bips,
    maxFeeEvidence: maxFee.evidence,
    feeChangeNotice,
  };
}
