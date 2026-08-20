import { describe, expect, it } from 'vitest';
import {
  canonicalizeClaritySource,
  matchSource,
  strictCanonicalizeClaritySource,
} from './canonical';
import { detectFeatures } from './features';

/*
 * These decide what the guide tells people about their money, so the cases
 * are taken from contracts actually deployed on mainnet.
 */

const wrap = (validateStakeBody: string) => `
;; a signer manager
(define-constant ERR_STAKER_NOT_ALLOWED (err u2000))
(define-public (validate-stake!
    (staker principal)
    (first-index uint)
    (num-indexes uint)
    (amount-ustx uint)
    (amount-sats uint)
    (is-bond bool)
    (signer-calldata (optional (buff 500)))
  )
  ${validateStakeBody}
)
`;

describe('openToAnyone', () => {
  it('is open when nothing tests the staker', () => {
    // the reference contract: caller check lives in a helper
    const src = wrap('(begin (try! (authorize-pox-5)) (ok true))');
    expect(detectFeatures(src).openToAnyone.value).toBe(true);
  });

  it('is still open when the caller check is inlined rather than a helper', () => {
    // juice-pool-stx-signer inlines it, and adds a pause flag. Neither says
    // anything about who may join, so counting bare asserts would be wrong.
    const src = wrap(`(begin
      (asserts! (is-eq contract-caller POX5) ERR_NOT_POX5)
      (asserts! (not (var-get paused)) ERR_PAUSED)
      (ok true))`);
    expect(detectFeatures(src).openToAnyone.value).toBe(true);
  });

  it('is closed when an allowlist tests the staker', () => {
    const src = wrap(`(begin
      (asserts! (is-allowed-staker staker) ERR_STAKER_NOT_ALLOWED)
      (ok true))`);
    const features = detectFeatures(src);
    expect(features.openToAnyone.value).toBe(false);
    expect(features.openToAnyone.evidence).toContain(
      'is-allowed-staker staker',
    );
  });

  it('is closed when joining requires membership of a pool', () => {
    const src = wrap(`(begin
      (asserts! (contract-call? .native-pool-v1 is-delegating staker current-contract) ERR_STAKER_NOT_ALLOWED)
      (ok true))`);
    expect(detectFeatures(src).openToAnyone.value).toBe(false);
  });
});

describe('bitcoinRewards', () => {
  it('is true when the contract records a Bitcoin address for the staker', () => {
    const src = wrap(`(begin
      (try! (authorize-pox-5))
      (ok (match signer-calldata calldata
        (let ((pox-addr (unwrap! (from-consensus-buff? { pox-addr: { version: (buff 1), hashbytes: (buff 32) }, max-fee: uint } calldata) ERR_INVALID_CALLDATA)))
          (try! (check-pox-addr (get pox-addr pox-addr)))
          (map-set pox-addrs staker pox-addr)
          true)
        (map-delete pox-addrs staker))))`);
    const features = detectFeatures(src);
    expect(features.bitcoinRewards.value).toBe(true);
    expect(features.bitcoinRewards.evidence).toContain('check-pox-addr');
  });

  it('is false when the contract never touches a Bitcoin address', () => {
    const src = wrap('(begin (try! (authorize-pox-5)) (ok true))');
    expect(detectFeatures(src).bitcoinRewards.value).toBe(false);
  });
});

describe('canonicalizeClaritySource', () => {
  it('ignores comments and indentation', () => {
    const a = '(define-public (f)\n    ;; a note\n    (ok true))';
    const b = ';; a different note\n(define-public (f) (ok true))';
    expect(canonicalizeClaritySource(a)).toBe(canonicalizeClaritySource(b));
  });

  /*
   * Lexical, not semantic: whitespace becomes a single space rather than
   * disappearing, so a newline before a closing paren survives as one. Two
   * contracts can therefore be functionally identical and still hash
   * differently.
   *
   * Kept deliberately, because this mirrors signer-sidekick byte for byte —
   * "tidying" it would silently stop our hashes matching theirs.
   */
  it('does not normalise spacing before a closing paren', () => {
    expect(canonicalizeClaritySource('(f (ok true)\n)')).toBe('(f (ok true) )');
    expect(canonicalizeClaritySource('(f (ok true))')).toBe('(f (ok true))');
  });

  it('keeps string contents intact, including ;; inside them', () => {
    const src = '(define-constant NOTE "keep ;; this  spacing")';
    expect(canonicalizeClaritySource(src)).toBe(
      '(define-constant NOTE "keep ;; this  spacing")',
    );
  });

  it('refuses an unterminated string rather than hashing nonsense', () => {
    expect(() =>
      canonicalizeClaritySource('(define-constant A "oops'),
    ).toThrow();
  });
});

describe('matchSource', () => {
  const h = (source: string, canonical: string, group = 'ggg') => ({
    sourceSha256: source,
    canonicalSha256: canonical,
    groupSha256: group,
  });
  const reviewed = h('aaa', 'bbb');

  it('reports an exact match on identical bytes', () => {
    expect(matchSource(h('aaa', 'bbb'), reviewed)).toBe('exact');
  });

  it('reports a canonical match when only comments differ', () => {
    expect(matchSource(h('zzz', 'bbb'), reviewed)).toBe('canonical');
  });

  it('reports unknown otherwise', () => {
    expect(matchSource(h('zzz', 'yyy'), reviewed)).toBe('unknown');
  });
});

describe('strictCanonicalizeClaritySource', () => {
  /*
   * Fast Pool's signer is the Standard contract with three spaces moved. The
   * sidekick-compatible hash sees two contracts; the group key sees one.
   */
  it('ignores whitespace beside a paren, which the canonical form keeps', () => {
    const a = '(f (ok true)\n)';
    const b = '(f (ok true))';
    expect(canonicalizeClaritySource(a)).not.toBe(canonicalizeClaritySource(b));
    expect(strictCanonicalizeClaritySource(a)).toBe(
      strictCanonicalizeClaritySource(b),
    );
  });

  it('keeps whitespace between tokens, so (a b) never collides with (ab)', () => {
    expect(strictCanonicalizeClaritySource('(a b)')).not.toBe(
      strictCanonicalizeClaritySource('(ab)'),
    );
  });
});

describe('maxFeeBips', () => {
  const feeContract = (constants: string, assertion: string) => `
${constants}
(define-public (propose-fee-bips (new-fee uint))
  (begin
    ${assertion}
    (ok new-fee)))
`;

  it('finds a real ceiling and resolves the constant', () => {
    // Juice Pool: MAX_FEE_BIPS u2000 asserted in propose-fee-bips
    const src = feeContract(
      '(define-constant MAX_FEE_BIPS u2000)',
      '(asserts! (<= new-fee MAX_FEE_BIPS) ERR_INVALID_FEE)',
    );
    const features = detectFeatures(src);
    expect(features.maxFeeBips).toBe(2000);
    expect(features.maxFeeEvidence).toContain('MAX_FEE_BIPS');
  });

  it('treats a 100% limit as no ceiling at all', () => {
    // The Standard contract only stops a fee of 100% or more, which promises
    // a staker nothing — reporting it as a cap would be misleading.
    const src = feeContract(
      '(define-constant MAX_BIPS u10000)',
      '(asserts! (< new-fees MAX_BIPS) ERR_INVALID_FEES_BIPS)',
    );
    expect(detectFeatures(src).maxFeeBips).toBeNull();
  });

  it('reports no ceiling when the contract has no fee function', () => {
    expect(
      detectFeatures('(define-public (validate-stake!) (ok true))').maxFeeBips,
    ).toBeNull();
  });
});

describe('feeReading', () => {
  /*
   * The trap this exists to avoid: `get-fee-bips-for-cycle` reads a snapshot
   * map written when a cycle's rewards are crystallised, and defaults to u0.
   * Before any pox-5 cycle had settled it answered "0%" for every pool, so
   * the guide told readers that pools charging a fee were free.
   */
  it('reads the live data var, not the per-cycle snapshot', () => {
    const src = `
(define-data-var fees-bips uint u0)
(define-map fee-bips-for-cycle { reward-cycle: uint } uint)
(define-read-only (get-fee-bips-for-cycle (reward-cycle uint) (bond-index (optional uint)))
  (default-to u0 (map-get? fee-bips-for-cycle { reward-cycle: reward-cycle })))
`;
    expect(detectFeatures(src).feeReading).toEqual({
      kind: 'data-var',
      name: 'fees-bips',
    });
  });

  it('prefers the getter that reports the rate actually in force', () => {
    // max500 keeps `fees-bips` at the old rate while a rise is queued, so the
    // var is not the live number — `get-active-fee-bips` is.
    const src = `
(define-data-var fees-bips uint u0)
(define-read-only (get-active-fee-bips) (var-get fees-bips))
`;
    expect(detectFeatures(src).feeReading).toEqual({
      kind: 'read-only',
      name: 'get-active-fee-bips',
    });
  });

  it('prefers a no-argument getter, which may compute rather than store', () => {
    // Juice Pool's shape.
    const src = `
(define-data-var fee-bips uint u0)
(define-read-only (get-fee-bips) (var-get fee-bips))
`;
    expect(detectFeatures(src).feeReading).toEqual({
      kind: 'read-only',
      name: 'get-fee-bips',
    });
  });

  it('reports nothing when the fee is not kept in this contract', () => {
    // native-pool-signer-manager takes its fee through .native-pool-v1.
    expect(
      detectFeatures('(define-public (validate-stake!) (ok true))').feeReading,
    ).toBeNull();
  });
});

describe('undistributedReading', () => {
  it('finds the no-argument total the Standard contract publishes', () => {
    const src = `
      (define-data-var unclaimed-staker-rewards uint u0)
      (define-read-only (get-unclaimed-staker-rewards)
        (var-get unclaimed-staker-rewards)
      )`;
    expect(detectFeatures(src).undistributedReading).toEqual({
      kind: 'read-only',
      name: 'get-unclaimed-staker-rewards',
    });
  });

  it('falls back to the data var when nothing publishes it', () => {
    const src = '(define-data-var unclaimed-staker-rewards uint u0)';
    expect(detectFeatures(src).undistributedReading).toEqual({
      kind: 'data-var',
      name: 'unclaimed-staker-rewards',
    });
  });

  it('ignores a getter that takes a cycle, which asks pox-5 a different question', () => {
    // juice-pool-stx-signer. This forwards to pox-5 and answers what pox-5
    // still owes the pool — the opposite of what the pool is already holding.
    // Reading it as the same number would show a pool that has paid everybody
    // as one sitting on their money.
    const src = `
      (define-read-only (get-unclaimed-signer-rewards
          (reward-cycle uint)
          (bond-index (optional uint))
        )
        (contract-call? 'SP000000000000000000002Q6VF78.pox-5
          get-signer-unclaimed-rewards-for-cycle current-contract reward-cycle
          bond-index))`;
    expect(detectFeatures(src).undistributedReading).toBeNull();
  });

  it('reports nothing when the contract keeps no such total', () => {
    expect(detectFeatures('(define-public (noop) (ok true))')
      .undistributedReading).toBeNull();
  });
});

describe('earnedFeesReading', () => {
  it('prefers the getter', () => {
    const src = `
      (define-data-var earned-fees uint u0)
      (define-read-only (get-earned-fees) (var-get earned-fees))`;
    expect(detectFeatures(src).earnedFeesReading).toEqual({
      kind: 'read-only',
      name: 'get-earned-fees',
    });
  });

  it('reads the var when the contract publishes no getter', () => {
    const src = '(define-data-var earned-fees uint u0)';
    expect(detectFeatures(src).earnedFeesReading).toEqual({
      kind: 'data-var',
      name: 'earned-fees',
    });
  });

  it('reports nothing when the contract takes no fee at all', () => {
    // native-pool-signer-manager takes its fee somewhere else entirely.
    expect(detectFeatures('(define-public (noop) (ok true))')
      .earnedFeesReading).toBeNull();
  });
});

describe('feeChangeNotice', () => {
  it('finds the wait Juice Pool puts on a fee change, in blocks', () => {
    const src = `
(define-constant FEE_COOLDOWN u144)
(define-data-var pending-fee (optional uint) none)
(define-data-var pending-fee-height uint u0)
(define-public (confirm-fee-bips)
  (let ((new-fee (unwrap! (var-get pending-fee) ERR_NO_PENDING_FEE)))
    (try! (assert-admin))
    (asserts! (>= burn-block-height (+ (var-get pending-fee-height) FEE_COOLDOWN))
      ERR_COOLDOWN)
    (ok new-fee)))
`;
    const features = detectFeatures(src);
    expect(features.feeChangeNotice).toMatchObject({
      amount: 144,
      unit: 'blocks',
    });
    expect(features.feeChangeNotice?.evidence).toContain('FEE_COOLDOWN');
  });

  it('reads the guard, not the names, so a differently written contract counts', () => {
    // Fast Pool's next signer is not written yet. Matching the shape means it
    // is picked up on the day it deploys, without a change here.
    const src = `
(define-data-var pending-fee-at uint u0)
(define-public (announce-fee (bips uint))
  (begin (var-set pending-fee-at burn-block-height) (ok bips)))
(define-public (apply-fee-change)
  (begin
    (asserts! (>= burn-block-height (+ (var-get pending-fee-at) u288)) ERR_TOO_EARLY)
    (ok true)))
`;
    expect(detectFeatures(src).feeChangeNotice).toMatchObject({
      amount: 288,
      unit: 'blocks',
    });
  });

  it('reports no wait when a new fee applies immediately', () => {
    const src = `
(define-public (set-fee-bips (new-fee uint))
  (begin
    (try! (assert-admin))
    (var-set fee-bips new-fee)
    (ok new-fee)))
`;
    expect(detectFeatures(src).feeChangeNotice).toBeNull();
  });

  it('finds a rise queued by reward cycle, as max500 does it', () => {
    // Fast Pool's max500 has no height assertion at all: it queues the new
    // rate for a cycle two ahead, and the getter decides which rate is live.
    const src = `
(define-constant FEE_ACTIVATION_DELAY_CYCLES u2)
(define-data-var fees-bips uint u0)
(define-data-var pending-fees-bips uint u0)
(define-data-var pending-fees-cycle uint u0)
(define-read-only (get-active-fee-bips)
  (if (>= (current-cycle) (var-get pending-fees-cycle))
    (var-get pending-fees-bips)
    (var-get fees-bips)))
(define-public (update-fees (new-fees uint))
  (let ((cycle (current-cycle)))
    (var-set pending-fees-bips new-fees)
    (var-set pending-fees-cycle (+ cycle FEE_ACTIVATION_DELAY_CYCLES))
    (ok true)))
`;
    const features = detectFeatures(src);
    expect(features.feeChangeNotice).toMatchObject({
      amount: 2,
      unit: 'cycles',
    });
    expect(features.feeChangeNotice?.evidence).toContain('pending-fees-cycle');
  });

  it('ignores a queued cycle the contract never reads back', () => {
    // Storing an activation point proves nothing if nothing honours it.
    const src = `
(define-constant FEE_ACTIVATION_DELAY_CYCLES u2)
(define-data-var pending-fees-cycle uint u0)
(define-public (update-fees (new-fees uint))
  (begin
    (var-set fees-bips new-fees)
    (var-set pending-fees-cycle (+ (current-cycle) FEE_ACTIVATION_DELAY_CYCLES))
    (ok true)))
`;
    expect(detectFeatures(src).feeChangeNotice).toBeNull();
  });
});

describe('feeExemption', () => {
  /** Juice Pool's OG stakers, as the contract writes it. */
  const juiceOg = `
(define-data-var fee-bips uint u0)
(define-map og-stakers principal bool)
(define-read-only (is-og (staker principal))
  (default-to false (map-get? og-stakers staker)))
(define-read-only (get-effective-fee-bips (staker principal))
  (if (is-og staker) u0 (var-get fee-bips)))
(define-public (set-og (staker principal) (og bool))
  (begin
    (try! (assert-admin))
    (if og (map-set og-stakers staker true) (map-delete og-stakers staker))
    (ok og)))
`;

  it('finds the stakers Juice Pool charges nothing', () => {
    const exemption = detectFeatures(juiceOg).feeExemption;
    expect(exemption).toMatchObject({ test: 'is-og', source: 'og-stakers' });
    expect(exemption?.evidence).toContain('u0');
  });

  it('says the pool picks who, because a public function writes the list', () => {
    // The difference between a rule and a favour, and the page says which.
    expect(detectFeatures(juiceOg).feeExemption?.operatorChooses).toBe(true);
  });

  it('does not call it operator-chosen when nothing public writes the list', () => {
    const src = juiceOg.replace(
      /\(define-public \(set-og[\s\S]*?\(ok og\)\)\)/,
      '',
    );
    expect(detectFeatures(src).feeExemption?.operatorChooses).toBe(false);
  });

  it('reports none when every staker pays the same', () => {
    const src = `
(define-data-var fee-bips uint u0)
(define-read-only (get-fee-bips) (var-get fee-bips))
`;
    expect(detectFeatures(src).feeExemption).toBeNull();
  });

  it('ignores a zero that has nothing to do with the fee', () => {
    // Contracts are full of `u0` branches. Only one that stands in for the
    // fee is an exemption; the rest are arithmetic.
    const src = `
(define-map paused-stakers principal bool)
(define-read-only (is-paused (staker principal))
  (default-to false (map-get? paused-stakers staker)))
(define-read-only (get-shares (staker principal))
  (if (is-paused staker) u0 (get-staker-shares staker)))
`;
    expect(detectFeatures(src).feeExemption).toBeNull();
  });

  it('leaves a test it cannot trace to a list unreported', () => {
    // An exemption is a claim about somebody's money; if the page cannot say
    // where the answer comes from, it should not make the claim.
    const src = `
(define-data-var fee-bips uint u0)
(define-read-only (get-effective-fee-bips (staker principal))
  (if (is-favoured staker) u0 (var-get fee-bips)))
`;
    expect(detectFeatures(src).feeExemption).toBeNull();
  });
});
