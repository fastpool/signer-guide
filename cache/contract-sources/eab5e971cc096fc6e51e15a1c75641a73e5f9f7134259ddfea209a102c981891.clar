(impl-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)
(define-constant ERR_UNAUTHORIZED_ADMIN (err u30001))
(define-constant ERR_STAKER_NOT_ALLOWED (err u30002))
(define-constant ERR_RECIPIENT_NOT_SET (err u30003))
(define-constant ERR_INVALID_CALLDATA (err u30004))
(define-constant ERR_INVALID_POX_ADDR (err u30005))
(define-constant ERR_UNAUTHORIZED_CALLER (err u30006))
(define-constant MAX_ADDRESS_VERSION u6)
(define-constant MAX_ADDRESS_VERSION_BUFF_20 u4)
(define-map allowed-stakers principal bool)
(define-data-var rewards-recipient (optional principal) none)
(define-map pox-addrs
  principal
  {
    pox-addr: {
      version: (buff 1),
      hashbytes: (buff 32),
    },
    max-fee: uint,
  }
)
(define-read-only (is-admin (who principal))
  (contract-call? .signer-admin-v1 is-admin current-contract who)
)
(define-read-only (is-allowed-staker (who principal))
  (default-to false (map-get? allowed-stakers who))
)
(define-read-only (get-rewards-recipient)
  (var-get rewards-recipient)
)
(define-read-only (get-pox-addr (staker principal))
  (map-get? pox-addrs staker)
)
(define-read-only (check-pox-addr (pox-addr {
    version: (buff 1),
    hashbytes: (buff 32),
  }))
  (let (
    (version (buff-to-uint-be (get version pox-addr)))
    (expected-len (if (<= version MAX_ADDRESS_VERSION_BUFF_20) u20 u32))
  )
    (ok (asserts!
      (and
        (<= version MAX_ADDRESS_VERSION)
        (is-eq (len (get hashbytes pox-addr)) expected-len)
        (is-eq (len (get version pox-addr)) u1)
      )
      ERR_INVALID_POX_ADDR
    ))
  )
)
(define-public (validate-stake!
    (staker principal)
    (first-index uint)
    (num-indexes uint)
    (amount-ustx uint)
    (amount-sats uint)
    (is-bond bool)
    (signer-calldata (optional (buff 500)))
  )
  (begin
    (try! (authorize-pox-5))
    (asserts! (is-allowed-staker staker) ERR_STAKER_NOT_ALLOWED)
    (ok (match signer-calldata
      calldata
        (let (
          (pox-data (unwrap! (from-consensus-buff? {
              pox-addr: {
                version: (buff 1),
                hashbytes: (buff 32),
              },
              max-fee: uint,
            } calldata) ERR_INVALID_CALLDATA))
        )
          (asserts!
            (is-eq (some calldata) (to-consensus-buff? pox-data))
            ERR_INVALID_CALLDATA
          )
          (try! (check-pox-addr (get pox-addr pox-data)))
          (map-set pox-addrs staker pox-data)
          true
        )
      (map-delete pox-addrs staker)
    ))
  )
)
(define-private (authorize-pox-5)
  (ok (asserts! (is-eq contract-caller 'SP000000000000000000002Q6VF78.pox-5) ERR_UNAUTHORIZED_CALLER))
)
(define-private (authorize-admin)
  (ok (asserts! (and (is-eq contract-caller tx-sender) (is-admin tx-sender)) ERR_UNAUTHORIZED_ADMIN))
)
(define-public (register-self
    (signer-manager <signer-manager-trait>)
    (signer-key (buff 33))
    (auth-id uint)
    (signer-sig (buff 65))
  )
  (begin
    (try! (authorize-admin))
    (try! (as-contract?
      ()
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 grant-signer-key signer-key current-contract auth-id signer-sig))
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 register-signer signer-manager signer-key))
    ))
    (print { action: "register-self", data: { signer-key: signer-key, block-height: stacks-block-height } })
    (ok true)
  )
)
(define-public (claim-rewards
    (bond-periods (list 6 uint))
    (reward-cycle uint)
  )
  (let (
    (info (try! (as-contract? ()
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 claim-rewards bond-periods reward-cycle))
    )))
    (total (get total-rewards info))
    (recipient (unwrap! (var-get rewards-recipient) ERR_RECIPIENT_NOT_SET))
  )
    (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" total))
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer total tx-sender recipient none
      ))
    ))
    (print { action: "claim-rewards", data: { total: total, recipient: recipient, reward-cycle: reward-cycle, block-height: stacks-block-height } })
    (ok info)
  )
)
(define-public (set-allowed-staker (staker principal) (allowed bool))
  (begin
    (try! (authorize-admin))
    (map-set allowed-stakers staker allowed)
    (print { action: "set-allowed-staker", data: { staker: staker, allowed: allowed, block-height: stacks-block-height } })
    (ok true)
  )
)
(define-public (set-rewards-recipient (recipient principal))
  (begin
    (try! (authorize-admin))
    (var-set rewards-recipient (some recipient))
    (print { action: "set-rewards-recipient", data: { recipient: recipient, block-height: stacks-block-height } })
    (ok true)
  )
)
