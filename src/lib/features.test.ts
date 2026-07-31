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
    expect(features.openToAnyone.evidence).toContain('is-allowed-staker staker');
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
    expect(() => canonicalizeClaritySource('(define-constant A "oops')).toThrow();
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
    expect(detectFeatures('(define-public (validate-stake!) (ok true))').maxFeeBips).toBeNull();
  });
});
