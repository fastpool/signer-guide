;; signer-manager -- PoX-5 signer manager with an OFAC blocklist.
;;
;; Copyright notices and licence
;; -----------------------------
;; Derived from:
;;   * the stacks-core reference `signer-manager.clar` for pox-5 (as vendored
;;     in stx-labs/signer-sidekick), licensed GPL-3.0; and
;;   * Fast Pool's v2 / "max500" signer manager by Friedger
;;     (`fastpool-max500-signer-manager`, mainnet publish height 8674707),
;;     which is itself a derivative of that reference.
;; This file is distributed under the GNU General Public License v3.0 (GPL-3.0).
;; It comes with NO WARRANTY. Full licence text: the LICENSE file shipped with
;; this source, or <https://www.gnu.org/licenses/gpl-3.0.html>.
;;
;; Changes vs Fast Pool max500 (2026-10-09). All max500 logic (5% fee cap,
;; last-admin guard, per-cycle accounting,
;; min-claim, sweep exclusions for staker-owed funds) is kept unchanged except:
;;   * Unused sBTC withdrawal fee budget (`max-fee - actual-fee`) returned on
;;     an ACCEPTED withdrawal goes to the POOL, as in the stacks-core
;;     reference: `settle-accepted-withdrawal` only releases the request's
;;     liability, leaving the dust in the unattributed balance for
;;     `sweep-fee-refunds`. max500's per-staker refund credit (`staker-refunds`,
;;     `credited-refunds`, `claim-refund`, `get-staker-refund`,
;;     `get-credited-refunds`) is removed.
;;   * OFAC blocklist in a SEPARATE contract, `.blocklist` (same deployer;
;;     see blocklist.clar). This contract asks it `check-principal` /
;;     `check-pox-addr`; the list answers only authorized callers (this pool).
;;     Runtime checks call `.blocklist` by default (Clarity cannot dispatch to
;;     a principal in a data-var inside `validate-stake!`'s fixed pox-5
;;     signature). Active list / discounts principals are pool settings: an
;;     admin PROPOSES a switch, it activates after INPUT_SWITCH_DELAY_BLOCKS
;;     (1008, ~1 week; testnet-scaled), and can be cancelled while pending --
;;     all logged. Callers that pass a trait must match the saved active
;;     principal (ERR_WRONG_INPUT_CONTRACT). After a switch, public `*-with`
;;     entry points take the new contract; `validate-stake!` keeps calling
;;     `.blocklist` (redeploy the pool to change that static path). A list
;;     admin who de-authorizes this pool can only FREEZE payouts (see
;;     fail-safe below); the list has no path to move or redirect funds.
;;   * A staker is "blocked" if their principal is listed OR their stored
;;     payout address is listed. Blocked stakers cannot stake / extend /
;;     add to a stake / register for a bond (`validate-stake!`), cannot
;;     set or clear their payout config, and are refused by `payout` and
;;     `reclaim-failed-withdrawal` (the latter also refuses if the rejected
;;     withdrawal's own recipient address is listed). A listed address can
;;     never be set as a payout address.
;;   * At `settle-staker-rewards`, if the staker is listed: fee = 0 and 100%
;;     of that cycle's reward is credited to a frozen held ledger
;;     (per staker per cycle). Nothing accrues to earned-fees / admin.
;;     `sweep-fee-refunds` cannot touch held funds. Cycles already settled
;;     with a fee before listing keep that fee. No automatic release on
;;     delisting: admin-only propose-release -> RELEASE_DELAY_BLOCKS (144,
;;     same scale as input-switch; testnet 62) -> execute-release, or cancel.
;;     Destination: staker's own principal / L1 payout config, or an
;;     arbitrary admin-specified principal (OFAC-directed). Automation key
;;     and strangers are refused. Backstops never pay held funds.
;;   * Fail-safe if the list does not answer (pool not authorized there):
;;     every path that moves value or changes a payout destination FAILS
;;     CLOSED with ERR_BLOCKLIST_UNAVAILABLE (funds stay reserved); staking
;;     itself FAILS OPEN (nobody is turned away) but the staker's payout
;;     config is left unchanged and a `blocklist-unavailable` event is printed.
;;   * Funds of a blocked staker stay reserved: unsettled cycle buckets,
;;     pending payouts from earlier clear settles, withdrawal liabilities,
;;     and the held ledger (post-listing settles). All of these are reserved
;;     from `sweep-fee-refunds`. Unblocking re-enables normal payout of
;;     pending (pre-hold) balances only; held funds still need admin release.
;;     Release may send to the staker or to an admin-chosen address.
;;   * Payout timing: an ADMIN (or the automation key) may settle and pay out any time (intended
;;     flow: check OFAC, update lists, then pay). Anyone
;;     else, including the staker, may settle a cycle or trigger a payout only
;;     once BACKSTOP_DELAY_BLOCKS (1008, ~7 days) Bitcoin blocks have passed
;;     since the cycle's rewards first became claimable in pox-5
;;     (`get-rewards-start-height`, cycle start + L/2) -- the same start point
;;     as the 432-block pool-claim window. A late pool claim does not push it
;;     back. Worst case for a staker: 1008 blocks (~7 days) from that point.
;;   * `withdraw-fees` / `sweep-fee-refunds` refuse a blocked recipient.
;;   * Pool-level `claim-rewards` (pulls sBTC from pox-5): ADMIN-only until
;;     CLAIM_BACKSTOP_BLOCKS (432, ~3 days) Bitcoin blocks after the reward
;;     portion became claimable in pox-5, then anyone. pox-5 keeps no per-cycle
;;     "computed at" height (`last-reward-compute-height` is global and holds
;;     the calculation height, not the call height), so the reference is the
;;     earliest height the claim can succeed: the distribution boundary at
;;     which `calculate-rewards` can first credit the portion -- mid-cycle
;;     (cycle start + L/2) for the first half, the next cycle's start for the
;;     second half. See `get-claim-anchor-height`.
;;   * Base fee / CAP fixed at 500 bps HERE. FLOOR (default 300, admin-settable
;;     0..500) also lives HERE: cuts from the next cycle, raises from the
;;     SECOND cycle after the change (never the running cycle).
;;     At settle: fee = min(500, max(floor, ladder - size - staker-discount)).
;;     Ladder + size settings and the per-staker EXTRA discount (bps) come from
;;     `.fee-discounts`. Referrals and early-bird are OFF-CHAIN (server writes
;;     one discount). If `.fee-discounts` does not answer, charge 500; payouts
;;     are never blocked by it.
;;       - Ladder: consecutive cycles in this pool (join recorded in
;;         `validate-stake!`; pox-5 unstake caught at settle).
;;       - Size: uSTX locked FOR the charged cycle (pox-5, cached at settle).
;;       - Staker discount: bips from `.fee-discounts`; gained or lost, it
;;         applies from the next cycle, never the running one.
;;   * ONE automation key: `.blocklist` list-keeper (also writes discounts).
;;     Early powers over claim/settle/payout/payout-many; nothing else.
;;     Single grant: `set-list-keeper`. Direct signer only.
;;   * `payout-many`: settle one reward cycle (optional) and pay up to 50
;;     stakers in one transaction. Every entry is checked against the blocklist and is
;;     SKIPPED, never failing the batch, when blocked / list unavailable /
;;     nothing to pay / below min-claim or dust / before the backstop for a
;;     non-operator caller. All checks run before any state change and the
;;     sBTC transfer runs before the bookkeeping, so a skipped entry changes
;;     nothing. Per-entry events: `settle-staker-rewards`, `settle-skipped`,
;;     `payout`, `payout-skipped`; one `payout-many` summary.
;;   * No pause switch and no stake caps: nobody except blocklisted stakers is
;;     ever turned away.
;;
;; ---------------------------------------------------------------------------
;; Original max500 header follows.
;;
;; Reference implementation for the signer manager trait, to be used with pox-5.
;;
;; v2 of `signer-manager.clar`. Same shape as v1 -- stakers may register an L1
;; `pox-addr` so their rewards are paid out over sBTC withdrawals, and admins
;; may take a bips fee from rewards -- with the following changes:
;;
;;   * [reverted in this version -- see top] Unused sBTC withdrawal fee budget
;;     (`max-fee - actual-fee`) is credited back to the staker who earned it
;;     instead of pooling for an admin sweep.
;;   * Settling rewards is split from paying them out
;;     (`settle-staker-rewards` / `payout`), so a staker whose reward in any
;;     one cycle is too small to withdraw can accumulate across cycles and pay
;;     one Bitcoin fee instead of one per cycle. `claim-staker-rewards` remains
;;     as the one-shot convenience path.
;;   * Stakers set a `min-claim` floor; only the staker may trigger a payout
;;     below it, so a third party cannot burn their reward on L1 fees.
;;   * [changed 2026-10-09g] The base fee is FIXED at 500 bps (= MAX_FEE_BIPS,
;;     the hard cap); `update-fees` and the fee queue are removed. Incentives
;;     (`.fee-discounts`) can only lower it. Any fee INCREASE -- a staker losing
;;     a discount, or an admin change to discount settings -- applies from the
;;     SECOND cycle after the change; cuts from the NEXT cycle [2026-10-10].
;;     Staker-side changes (stake size, discounts) count from the first cycle
;;     the new STX is locked for.
;;   * L1 payouts are checked against the sBTC dust limit up front, so a claim
;;     that cannot succeed fails with a legible error instead of an opaque
;;     `(err u502)` from the sBTC contracts.
;;   * Stakers can set/clear their payout config directly here, without having
;;     to re-drive `stake` / `stake-update` on pox-5.
;;   * Unclaimed rewards are tracked per `(reward-cycle, bond-index)` rather
;;     than as one global counter, so a claim against one cycle can never be
;;     funded out of another cycle's reserve.
;;   * An admin cannot remove themselves, so the contract can never be left
;;     with no admin at all.
;;   * v1's two-field payout calldata is still accepted, so stakers rolling
;;     over from a v1 signer are not rejected.
;;
;; Fees are still snapshotted per cycle when `claim-rewards` crystallizes it,
;; so a rate change never applies to a cycle that has already been pulled.

(impl-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)
(use-trait blocklist-trait .blocklist-trait.blocklist-trait)
(use-trait fee-discounts-trait .fee-discounts-trait.fee-discounts-trait)

;; A staker tried to claim rewards, but they had none available
(define-constant ERR_NO_CLAIMABLE_REWARDS (err u1001))
;; Attempted to call an admin function
(define-constant ERR_UNAUTHORIZED_ADMIN (err u1002))
;; the calldata provided when staking was invalid
(define-constant ERR_INVALID_CALLDATA (err u1003))
;; The pox-addr provided as calldata isn't valid
(define-constant ERR_INVALID_POX_ADDR (err u1004))
;; The fees provided when updating fees is invalid
(define-constant ERR_INVALID_FEES_BIPS (err u1005))
;; A pox-5 callback (validate-stake!) was invoked by a
;; principal other than the pox-5 contract.
(define-constant ERR_UNAUTHORIZED_CALLER (err u1006))
;; Attempted to withdraw more fees than have accrued.
(define-constant ERR_INSUFFICIENT_FEES (err u1007))
;; The given withdrawal-request id is not tracked by this contract.
(define-constant ERR_UNKNOWN_WITHDRAWAL_REQUEST (err u1008))
;; The withdrawal request has not been rejected, so its full
;; `amount + max-fee` is not reclaimable for the staker.
(define-constant ERR_WITHDRAWAL_NOT_REJECTED (err u1009))
;; No refunds available to sweep.
(define-constant ERR_NO_REFUNDS (err u1010))
;; The withdrawal request has not been accepted, so it cannot be
;; settled via `settle-accepted-withdrawal`.
(define-constant ERR_WITHDRAWAL_NOT_ACCEPTED (err u1011))
;; The L1 payout after `max-fee` would be at or below the sBTC dust
;; limit, so `initiate-withdrawal-request` cannot succeed. Let rewards
;; accrue further, or clear the payout config to be paid in sBTC.
(define-constant ERR_BELOW_DUST_LIMIT (err u1012))
;; A third party tried to claim rewards for a staker whose L1 payout
;; would be below the `min-claim` floor that staker set.
(define-constant ERR_BELOW_MIN_CLAIM (err u1013))
;; `min-claim` must leave a spendable (non-dust) output after `max-fee`.
(define-constant ERR_INVALID_MIN_CLAIM (err u1014))
;; An admin tried to remove themselves.
(define-constant ERR_CANNOT_REMOVE_SELF (err u1015))
;; The staker has nothing settled to pay out.
(define-constant ERR_NO_PENDING_PAYOUT (err u1016))
;; u1017 (ERR_NO_REFUND_CREDIT) retired with `claim-refund`; codes not reused.
;; [added] The staker, their payout address, or a recipient is on the blocklist.
(define-constant ERR_BLOCKED (err u1018))
;; u1019 retired (list-keeper role moved to the blocklist contract).
;; [added] A non-operator tried to settle or pay out before the backstop delay.
(define-constant ERR_BACKSTOP_NOT_REACHED (err u1020))
;; [added] The blocklist contract did not answer (this pool is not an
;; authorized caller there). Value-moving paths fail closed with this.
(define-constant ERR_BLOCKLIST_UNAVAILABLE (err u1021))
;; [added] A non-admin called pool-level `claim-rewards` inside the admin window.
(define-constant ERR_CLAIM_BACKSTOP_NOT_REACHED (err u1022))
(define-constant ERR_INVALID_FLOOR (err u1023))
(define-constant ERR_CYCLE_NOT_CACHED (err u1024))
;; [added] Caller passed a list/discounts trait that is not the active setting.
(define-constant ERR_WRONG_INPUT_CONTRACT (err u1025))
;; [added] activate-* before the INPUT_SWITCH_DELAY_BLOCKS (1008) delay, or no pending switch.
(define-constant ERR_SWITCH_NOT_READY (err u1026))
(define-constant ERR_NO_PENDING_SWITCH (err u1027))
;; [added] Held-funds release (admin two-step).
(define-constant ERR_NO_HELD (err u1028))
(define-constant ERR_NO_PENDING_RELEASE (err u1029))
(define-constant ERR_RELEASE_NOT_READY (err u1030))
(define-constant ERR_INVALID_RELEASE (err u1031))
(define-constant ERR_RELEASE_PENDING (err u1037)) ;; [added 2026-10-10] cancel the pending release first
(define-constant ERR_RELEASE_DEST_BLOCKED (err u1038)) ;; [added 2026-10-10] destination (or staker) on the sanctions list
(define-constant ERR_DEST_NOT_APPROVED (err u1039))
(define-constant ERR_DEST_APPROVAL_PENDING (err u1040))
(define-constant ERR_NO_PENDING_DEST_APPROVAL (err u1041))

;; Highest fee an admin may set, in basis points. Inclusive: `u500` is
;; exactly 5%, and 5% is settable.
(define-constant MAX_FEE_BIPS u500)
(define-constant BIPS_DENOMINATOR u10000)

;; [changed] No fee queue here: the base fee is fixed at the cap. Discount
;; changes (.discounts-test-g): raises apply from the NEXT cycle, cuts at once.

;; Mirrors `DUST_LIMIT` in `.sbtc-withdrawal`. `initiate-withdrawal-request`
;; asserts `(> amount DUST_LIMIT)`; we check the same bound before calling in
;; so the failure is attributable to this contract.
(define-constant DUST_LIMIT u546)

;; [added] Backstop: Bitcoin blocks after the cycle's rewards first became
;; claimable in pox-5 (`get-rewards-start-height`, shared with the pool-claim
;; window) before ANYONE (not just an admin) may settle/pay that
;; cycle. 1008 = 7 days x 144 blocks/day (Bitcoin's 10-minute target). Measured in
;; `burn-block-height`, not Stacks blocks, because Nakamoto Stacks block times
;; vary (seconds) while Bitcoin time is what OFAC-update latency is about. It
;; is also just under half a mainnet reward cycle (2100 / 2 = 1050), so a
;; staker's rewards from one distribution are always publicly claimable before
;; the next distribution lands.
(define-constant BACKSTOP_DELAY_BLOCKS u1008)

;; [added] Admin-only window for the POOL-level `claim-rewards`: Bitcoin blocks
;; after a reward portion becomes claimable in pox-5 (see
;; `get-claim-anchor-height`). 432 = 3 days x 144. Gives the operator time to
;; run the OFAC update before rewards enter the pool. Less than half a mainnet
;; cycle (1050), so each portion is publicly claimable before the next lands.
(define-constant CLAIM_BACKSTOP_BLOCKS u432)

;; [changed 2026-10-10] Delay before a proposed list/discounts switch takes effect.
;; 1008 = ~1 week of Bitcoin blocks. Testnet build scales like the backstops.
(define-constant INPUT_SWITCH_DELAY_BLOCKS u1008)

;; [added] Delay before a proposed held-funds release can execute (144 = ~1 day).
(define-constant RELEASE_DELAY_BLOCKS u144)

;; [added 2026-10-10] Fixed fee address: withdraw-fees / sweep-fee-refunds pay
;; ONLY here. Change = propose -> wait FEE_ADDRESS_DELAY_BLOCKS (432, ~3 days)
;; -> execute; any admin may cancel; events on every step. Starts as deployer.
(define-constant FEE_ADDRESS_DELAY_BLOCKS u432)
(define-constant ERR_NOT_FEE_ADDRESS (err u1043))
(define-constant ERR_FEE_ADDRESS_PENDING (err u1044))
(define-constant ERR_NO_PENDING_FEE_ADDRESS (err u1045))
(define-constant ERR_FEE_ADDRESS_NOT_READY (err u1046))
(define-data-var fee-address principal 'SP3M4PKRDA98RZ1XBY85QDY36V7F0JR41CM1QA7V7)
(define-data-var pending-fee-address (optional { addr: principal, activate-at: uint, proposed-by: principal }) none)

;; [added] Fee floor (bps). Admin-settable 0..MAX_FEE_BIPS. (initial value)
(define-data-var fee-floor-bips uint u300)
;; [changed 2026-10-10] Floor history: version i = { from, bips }. Cuts start
;; next cycle, raises the SECOND cycle after the change; never the running one.
(define-map fee-floor-versions uint { from: uint, bips: uint })
(map-set fee-floor-versions u0 { from: u0, bips: u300 })
;; [added 2026-10-10] when each floor version was initiated (+ fee-setting freshness)
(define-map fee-floor-initiated uint { burn-height: uint, stacks-height: uint, time: uint, cycle: uint })
(define-data-var fee-last-update { burn-height: uint, stacks-height: uint, time: uint }
  { burn-height: burn-block-height, stacks-height: stacks-block-height, time: stacks-block-time })
(define-read-only (get-floor-initiated (idx uint)) (map-get? fee-floor-initiated idx))
(define-read-only (get-last-update) (var-get fee-last-update))
(define-data-var fee-floor-count uint u1)
(define-constant FLOOR_CUT_DELAY_CYCLES u1)
(define-constant FLOOR_RAISE_DELAY_CYCLES u2)
(define-constant FLOOR_HISTORY_STEPS (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16))

;; [added] Active input contracts (admin propose -> delay -> activate; cancelable).
(define-data-var list-contract principal .blocklist)
(define-data-var discounts-contract principal .fee-discounts)
(define-data-var pending-list-switch (optional { next: principal, activate-at: uint }) none)
(define-data-var pending-discounts-switch (optional { next: principal, activate-at: uint }) none)

;; [added] Cached pox-5 cycle-start burn heights (cheap RO views; <200 KB).
(define-map cycle-start-burn uint uint)
;; Cached staked uSTX (updated on join) for fee views without pox-5.
(define-map staked-ustx-cache principal uint)
;; [added] uSTX locked with this pool for a given (staker, reward-cycle, bond-index).
;; Written at settle (and readable for fee quotes). Size tier uses THIS, not the
;; latest `staked-ustx-cache`, so adding stake after a cycle ends cannot buy a
;; cheaper fee for that cycle, and unstaking after the cycle keeps the discount.
(define-map staked-in-cycle-cache
  {
    staker: principal,
    reward-cycle: uint,
    bond-index: (optional uint),
  }
  uint
)

;; [added] Incentive state: join cycle of the staker's current run in this pool.
(define-map staker-join
  principal
  {
    join-cycle: uint,
    end-cycle: uint,
    prev-join-cycle: uint,
  }
)

;; [added] The blocklist is `.blocklist` (static call sites; see `list-contract`).

;; [added] `burn-block-height` of the latest `claim-rewards` for a reward cycle.
(define-map cycle-claim-height
  uint
  uint
)

;; [added] Earliest `burn-block-height` at which a non-operator may trigger
;; `payout` for a staker. Pushed forward when an admin settles a cycle
;; before that cycle's backstop has passed.
(define-map payout-unlock-height
  principal
  uint
)

;; default to allowing deployer to register as a pool
(define-map admins
  principal
  bool
)
(map-set admins 'SP3M4PKRDA98RZ1XBY85QDY36V7F0JR41CM1QA7V7 true)

;; [changed 2026-10-09g] Base fee FIXED at MAX_FEE_BIPS (500 bps); no setter.

;; Amount of earned fees that are held by the contract.
;; When fees are transferred out of the contract, this value
;; must be deducted.
(define-data-var earned-fees uint u0)

(define-map fee-bips-for-cycle
  {
    reward-cycle: uint,
    bond-index: (optional uint),
  }
  uint
)

;; When stakers provide L1 withdrawal info -- as pox-5 calldata, or directly
;; via `set-payout-config` -- it is stored here.
;;
;; `min-claim` is the smallest net reward for which a *third party* may trigger
;; an L1 payout on the staker's behalf. Without it, anyone can force a
;; withdrawal the moment any reward is claimable, burning up to `max-fee` in
;; BTC fees on a trivial amount. The staker themselves is never gated by it.
(define-map payout-configs
  principal
  {
    pox-addr: {
      version: (buff 1),
      hashbytes: (buff 32),
    },
    max-fee: uint,
    min-claim: uint,
  }
)

;; Mapping of a given withdrawal request ID to the staker
;; whose rewards created that withdrawal.
(define-map withdrawal-requests
  uint
  principal
)

;; Sum of `amount + max-fee` over every live (un-settled) entry in
;; `withdrawal-requests`. Incremented when a withdrawal is initiated in
;; `claim-staker-rewards` and decremented when the request is settled
;; (`reclaim-failed-withdrawal` for rejected, `settle-accepted-withdrawal` for
;; accepted). This is staker-owed sBTC that has either left the contract balance
;; into the sBTC withdrawal system (pending) or been returned to the balance but
;; not yet paid out (rejected). `sweep-fee-refunds` subtracts it so an admin can
;; never sweep funds owed to a staker.
(define-data-var withdrawal-liability uint u0)

;; sBTC pulled into this contract by `claim-rewards` that has not yet been paid
;; out, split per `(reward-cycle, bond-index)`. `claim-rewards` credits each
;; bucket with the gross it received for that cycle/bond; each
;; `claim-staker-rewards` debits that staker's `gross` from the matching bucket.
;;
;; Per-bucket (rather than one global counter) so a claim against cycle A can
;; never be paid out of the reserve credited for cycle B.
;;
;; A bucket never quite reaches zero: pox-5 computes each staker's share with
;; integer division, so the sum of all per-staker `gross` is a few sats short
;; of the pot `claim-rewards` pulled in. That remainder is deliberately left
;; reserved forever rather than being released to anyone. It is staker money
;; that simply cannot be attributed to a staker, so it stays in the contract;
;; there is no path by which an admin can reach it.
;;
;; The cost of that choice: because the residue is permanently reserved, it
;; permanently reduces what `sweep-fee-refunds` can take. [changed] Sweep is
;; for accepted-withdrawal fee dust (pool income, released by
;; `settle-accepted-withdrawal`) and sBTC sent here by mistake.
(define-map unclaimed-rewards-for-cycle
  {
    reward-cycle: uint,
    bond-index: (optional uint),
  }
  uint
)

;; Sum over every bucket in `unclaimed-rewards-for-cycle`. Maintained
;; alongside the map because `sweep-fee-refunds` needs the total in one read
;; and Clarity cannot iterate a map.
(define-data-var total-unclaimed-rewards uint u0)

;; Net rewards settled for a staker but not yet paid out.
;; `settle-staker-rewards` credits this one cycle at a time; `payout` drains
;; the whole balance in a single transfer or sBTC withdrawal.
;;
;; This is what lets a staker accumulate across cycles. pox-5 keys rewards by
;; reward cycle and never rolls them forward, so a staker whose reward in any
;; one cycle is below the sBTC dust limit would otherwise never be able to
;; take an L1 payout at all.
;;
;; Staker-owed sBTC held by the contract: reserved from `sweep-fee-refunds`.
(define-map pending-payouts
  principal
  uint
)

;; Sum over `pending-payouts`, for the `sweep-fee-refunds` reserve.
(define-data-var total-pending-payouts uint u0)

;; [added] Frozen held ledger: rewards settled while the staker (or their
;; payout BTC address) was listed. Fee was 0; 100% of gross is here.
;; Per-cycle map is a credit log (only increases). `held-totals` /
;; `total-held-rewards` decrease on admin execute-release.
(define-map held-rewards
  {
    staker: principal,
    reward-cycle: uint,
  }
  uint
)
(define-map held-totals
  principal
  uint
)
(define-data-var total-held-rewards uint u0)

;; [added] One pending admin release at a time (propose -> delay -> execute / cancel).
(define-data-var pending-release
  (optional {
    staker: principal,
    amount: uint,
    destination: principal,
    use-staker-l1: bool,
    ofac-directed: bool,
    reason-code: uint,
    activate-at: uint,
  })
  none
)
;; [added 2026-10-10] Fee recorded at hold time (real effective rate per cycle).
(define-map held-fee-bips { staker: principal, reward-cycle: uint, bond-index: (optional uint) } uint)
(define-map held-fee-owed principal uint) ;; recorded, not yet taken/forgiven
(define-map held-fee-taken principal uint) ;; cumulative fee taken on staker releases
(define-map approved-destinations principal bool)
(define-data-var pending-dest-approval (optional { dest: principal, activate-at: uint }) none)
(define-constant DEST_APPROVAL_DELAY_BLOCKS u432) ;; [changed 2026-10-10] ~3 days


;;; pox-5 callbacks

;; Callback function from a `stake` transaction.
;;
;; If `signer-calldata` is provided, then it must be the consensus
;; serialization of `{ pox-addr: { version, hashbytes }, max-fee, min-claim }`.
;; If provided, the payout config is saved for the user, and they'll receive
;; rewards through sBTC withdrawals.
;;
;; v1's two-field `{ pox-addr, max-fee }` calldata is also accepted, so a
;; staker rolling over from a v1 signer is not rejected; it is given
;; `default-min-claim`. See `parse-payout-calldata`.
(define-public (validate-stake!
    (staker principal)
    ;; #[allow(unused_binding)]
    (first-index uint)
    ;; #[allow(unused_binding)]
    (num-indexes uint)
    ;; #[allow(unused_binding)]
    (amount-ustx uint)
    ;; #[allow(unused_binding)]
    (amount-sats uint)
    ;; #[allow(unused_binding)]
    (is-bond bool)
    (signer-calldata (optional (buff 500)))
  )
  (begin
    (try! (authorize-pox-5))
    ;; [added] Incentives: track the staker's run in this pool (STX staking only).
    (if is-bond
      true
      (begin
        (record-staker-join staker first-index num-indexes)
        (map-set staked-ustx-cache staker amount-ustx)
        true
      )
    )
    ;; [added] Refuse a blocked staker (principal or stored payout address).
    ;; A blocked *new* payout address is refused in `check-payout-config`.
    (match (check-staker staker)
      blocked (begin
        (asserts! (not blocked) ERR_BLOCKED)
        (ok (match signer-calldata
          calldata
          (begin
            (try! (store-payout-config staker calldata))
            true
          )
          ;; If `signer-calldata` is not provided, delete (if present)
          ;; their entry from `payout-configs`.
          (begin (unindex-payout staker) (map-delete payout-configs staker))
        ))
      )
      ;; [added] List unavailable: FAIL OPEN for the stake itself (nobody is
      ;; turned away), but leave the payout config untouched so a staker can
      ;; never move off a listed address while the list is down. Payouts are
      ;; held (fail closed) until the list answers again.
      list-err (begin
        (print {
          topic: "blocklist-unavailable",
          staker: staker,
          payout-config-updated: false,
        })
        (ok true)
      )
    )
  )
)

;;; Staker payout configuration

;; Set (or replace) the caller's own L1 payout config, without having to
;; re-drive `stake` / `stake-update` on pox-5. This is the escape hatch for a
;; staker whose `max-fee` / `min-claim` no longer suit current BTC fee levels.
;;
;; `contract-caller` must equal `tx-sender`: this sets where the caller's
;; rewards are sent, so an intermediary contract must not be able to set it on
;; a user's behalf mid-call.
(define-public (set-payout-config
    (pox-addr {
      version: (buff 1),
      hashbytes: (buff 32),
    })
    (max-fee uint)
    (min-claim uint)
  )
  (let ((config {
      pox-addr: pox-addr,
      max-fee: max-fee,
      min-claim: min-claim,
    }))
    (asserts! (is-eq contract-caller tx-sender) ERR_UNAUTHORIZED_CALLER)
    ;; [added] A blocked staker cannot move off a listed address.
    (try! (assert-staker-clear tx-sender))
    (try! (check-payout-config config))
    (index-payout tx-sender (get pox-addr config))
    (map-set payout-configs tx-sender config)
    (print {
      topic: "set-payout-config",
      staker: tx-sender,
      config: config,
    })
    (ok true)
  )
)

;; Clear the caller's L1 payout config, reverting them to direct sBTC payouts.
(define-public (clear-payout-config)
  (begin
    (asserts! (is-eq contract-caller tx-sender) ERR_UNAUTHORIZED_CALLER)
    ;; [added] Clearing would switch a listed BTC address to sBTC payouts.
    (try! (assert-staker-clear tx-sender))
    (print {
      topic: "clear-payout-config",
      staker: tx-sender,
    })
    (unindex-payout tx-sender)
    (ok (map-delete payout-configs tx-sender))
  )
)

;;; Signer rewards

;; Claim rewards _as the signer manager_ contract. When new rewards are available
;; from pox-5, this function must be called before rewards will be seen as available
;; to stakers of this signer.
;;
;; This function is callable by anyone. Once called, this contract will receive sBTC,
;; and rewards information will be crystallized -- including the fee rate, which is
;; snapshotted per `(reward-cycle, bond-index)` on first crystallization and never
;; revised.
(define-public (claim-rewards
    (bond-periods (list 6 uint))
    (reward-cycle uint)
  )
  (let (
      ;; [added] Admin anytime; anyone else after the admin window.
      (gate (asserts!
        (or
          (is-early-payer)
          (>= burn-block-height (get-claim-backstop-height reward-cycle))
        )
        ERR_CLAIM_BACKSTOP_NOT_REACHED
      ))
      ;; [changed] Never above the rate in force during `reward-cycle`.
      (active-bips (get-active-fee-bips)) ;; [changed g] fixed base fee
      (result (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 claim-rewards
        bond-periods reward-cycle
      )))
      (stx-key {
        reward-cycle: reward-cycle,
        bond-index: none,
      })
    )
    ;; The sBTC just pulled in is owed to this signer's stakers until each
    ;; claims via `claim-staker-rewards`; reserve it so it is not sweepable.
    (var-set total-unclaimed-rewards
      (+ (var-get total-unclaimed-rewards) (get total-rewards result))
    )
    (map-insert fee-bips-for-cycle stx-key active-bips)
    ;; [added] Record the latest pool claim (informational; the backstops
    ;; count from `get-claim-anchor-height`, not from here).
    (map-set cycle-claim-height reward-cycle burn-block-height)
    ;; [added] Cache cycle starts so RO backstop/fee views avoid pox-5.
    (unwrap-panic (cache-cycle-start reward-cycle))
    (unwrap-panic (cache-cycle-start (+ reward-cycle u1)))
    (credit-cycle-bucket stx-key (get earned (get stx-rewards result)))
    (fold snapshot-bond-rewards (get bond-rewards result) {
      reward-cycle: reward-cycle,
      bips: active-bips,
    })
    (ok result)
  )
)

;; Get the total amount of rewards earned since the last
;; rewards snapshot for this staker. Returns a tuple of `{ earned, fees }`.
;; The total portion of rewards the staker has accounted for
;; is `earned + fees`.
(define-read-only (get-earned-staker-rewards
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (let (
      (earned-before-fees (contract-call? 'SP000000000000000000002Q6VF78.pox-5
        get-earned-staker-rewards current-contract reward-cycle bond-index
        staker
      ))
      (fees (/ (* earned-before-fees (get-staker-fee-bips staker reward-cycle bond-index))
        BIPS_DENOMINATOR
      ))
    )
    {
      earned: (- earned-before-fees fees),
      fees: fees,
    }
  )
)

;; Settle one `(reward-cycle, bond-index)` of a staker's rewards into their
;; pending payout balance. Moves no sBTC.
;;
;; Settling is separated from paying out so that rewards can ACCUMULATE. A
;; staker whose reward in any single cycle is below the sBTC dust limit (or
;; below their own `min-claim`) can settle each cycle as it crystallizes and
;; then make one payout covering all of them -- paying one Bitcoin fee instead
;; of one per cycle, and clearing thresholds their per-cycle rewards never
;; would. pox-5 keys rewards by cycle and never rolls them forward, so without
;; this the small amounts would be individually unclaimable forever.
;;
;; Permissionless: settling costs the staker nothing, moves nothing out of the
;; contract, and can only ever credit them. The `min-claim` gate that protects
;; a staker from a third party burning their reward on Bitcoin fees belongs on
;; `payout`, not here.
;;
;; The signer-manager fee is taken at this point, at the rate snapshotted for
;; that cycle, so a later rate change cannot revise it.
(define-public (settle-staker-rewards
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (let (
      (rewards-info (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5
        claim-staker-rewards-for-signer staker reward-cycle bond-index
      )))
      (gross (get earned rewards-info))
      ;; [added] Snapshot cycle-locked uSTX for size tier (not latest stake).
      (locked-ustx (cache-staked-in-cycle staker reward-cycle bond-index))
      (disc-snap (snapshot-discount staker reward-cycle))
      ;; [added] Listed at settle => fee 0, credit held ledger (not pending).
      (listed (try! (check-staker staker)))
      (fees (if listed
        u0
        (/ (* gross (get-staker-fee-bips staker reward-cycle bond-index))
          BIPS_DENOMINATOR
        )
      ))
      (earned (- gross fees))
      (bucket-key {
        reward-cycle: reward-cycle,
        bond-index: bond-index,
      })
      (bucket (default-to u0 (map-get? unclaimed-rewards-for-cycle bucket-key)))
      (ready-height (get-cycle-backstop-height reward-cycle))
      (list-counts (contract-call? .blocklist get-counts))
      (blocked-since (match (staker-blocked-since staker)
        since since
        e none
      ))
      (pox (match (map-get? payout-configs staker)
        cfg (some (get pox-addr cfg))
        none
      ))
    )
    ;; [added] Before the backstop only an admin/automation may settle; when
    ;; it does, the staker's payout unlock moves to this cycle's backstop.
    (if (is-early-payer)
      (if (> ready-height (get-payout-unlock-height staker))
        (map-set payout-unlock-height staker ready-height)
        true
      )
      (asserts! (>= burn-block-height ready-height) ERR_BACKSTOP_NOT_REACHED)
    )
    (asserts! (> earned u0) ERR_NO_CLAIMABLE_REWARDS)
    (asserts! (>= bucket gross) ERR_NO_CLAIMABLE_REWARDS)
    (var-set earned-fees (+ (var-get earned-fees) fees))
    (map-set unclaimed-rewards-for-cycle bucket-key (- bucket gross))
    (var-set total-unclaimed-rewards (- (var-get total-unclaimed-rewards) gross))
    (if listed
      (begin
        (credit-held staker reward-cycle bond-index earned)
        (print {
          topic: "hold-rewards",
          staker: staker,
          pox-addr: pox,
          reward-cycle: reward-cycle,
          bond-index: bond-index,
          amount: earned,
          list: (var-get list-contract),
          list-principals: (get principals list-counts),
          list-pox-addrs: (get pox-addrs list-counts),
          blocked-since: blocked-since,
          burn-height: burn-block-height,
        })
        (ok earned)
      )
      (begin
        (map-set pending-payouts staker (+ (get-pending-payout staker) earned))
        (var-set total-pending-payouts (+ (var-get total-pending-payouts) earned))
        (print {
          topic: "settle-staker-rewards",
          staker: staker,
          reward-cycle: reward-cycle,
          bond-index: bond-index,
          earned: earned,
          fees: fees,
          pending-payout: (get-pending-payout staker),
        })
        (ok earned)
      )
    )
  )
)

;; Pay out everything a staker has settled, in one transfer.
;;
;; If the staker has an L1 payout config, the whole pending balance is
;; withdrawn through sBTC to their Bitcoin address. Otherwise they receive
;; sBTC directly.
;;
;; Permissionless, but a third party may only trigger an L1 payout once the
;; accumulated balance reaches the staker's `min-claim`; the staker themselves
;; may pay out any non-dust amount.
;;
;; Returns `{ amount, withdrawal-request }` where `amount` is what was paid
;; out and `withdrawal-request` is `(some id)` when an L1 sBTC withdrawal was
;; initiated, or `none` for a direct sBTC payout.
(define-public (payout (staker principal))
  (let (
      (amount (get-pending-payout staker))
      (config (get-payout-config staker))
    )
    (asserts! (> amount u0) ERR_NO_PENDING_PAYOUT)
    ;; [added] Held while blocked; the balance stays in `pending-payouts`.
    (try! (assert-staker-clear staker))
    ;; [added] Admin any time (after its OFAC check); anyone else, the
    ;; staker included, once the backstop delay has passed.
    (asserts!
      (or (is-early-payer) (>= burn-block-height (get-payout-unlock-height staker)))
      ERR_BACKSTOP_NOT_REACHED
    )
    ;; Anyone may trigger a payout, but forcing a *Bitcoin* payout costs
    ;; the staker up to `max-fee` in miner fees. Only the staker may do
    ;; that below the floor they set.
    (asserts!
      (or
        (is-eq tx-sender staker)
        (match config
          l1-info (>= amount (get min-claim l1-info))
          true
        )
      )
      ERR_BELOW_MIN_CLAIM
    )
    (map-delete pending-payouts staker)
    (var-set total-pending-payouts (- (var-get total-pending-payouts) amount))
    ;; Bind the request-id surfaced when the payout was routed to L1 via
    ;; `initiate-withdrawal-request`, `none` when the staker was paid
    ;; directly in sBTC.
    (let ((withdrawal-request (try! (as-contract?
        ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          "sbtc-token" amount
        ))
        (match config
          l1-info (let ((max-fee (get max-fee l1-info)))
            ;; `initiate-withdrawal-request` asserts
            ;; `(> amount DUST_LIMIT)` on `amount - max-fee`.
            ;; Check it here so an unpayable payout fails with our
            ;; error rather than an opaque sBTC one -- and so the
            ;; subtraction below cannot underflow. Settling more
            ;; cycles first is what clears this.
            (asserts! (> amount (+ max-fee DUST_LIMIT)) ERR_BELOW_DUST_LIMIT)
            (let (
                (withdrawal-amount (- amount max-fee))
                (withdrawal-request (try! (contract-call?
                  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-withdrawal
                  initiate-withdrawal-request withdrawal-amount
                  (get pox-addr l1-info) max-fee
                )))
              )
              (print {
                topic: "payout",
                amount-sats: amount,
                l1-withdrawal: (some (merge l1-info {
                  withdrawal-request: withdrawal-request,
                  amount: withdrawal-amount,
                })),
                staker: staker,
              })
              (map-set withdrawal-requests withdrawal-request staker)
              ;; `withdrawal-amount + max-fee` == `amount` left
              ;; the balance into the sBTC withdrawal system;
              ;; record it as staker liability.
              (var-set withdrawal-liability
                (+ (var-get withdrawal-liability) amount)
              )
              (some withdrawal-request)
            )
          )
          (begin
            (print {
              topic: "payout",
              amount-sats: amount,
              l1-withdrawal: none,
              staker: staker,
            })
            (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
              transfer amount tx-sender staker none
            ))
            ;; Direct sBTC payout: there is no L1 withdrawal to track.
            none
          )
        )))))
      (ok {
        amount: amount,
        withdrawal-request: withdrawal-request,
      })
    )
  )
)

;; Settle one cycle and pay out immediately -- the one-shot convenience path,
;; equivalent to `settle-staker-rewards` followed by `payout`.
;;
;; Note that `payout` drains the staker's WHOLE pending balance, so if earlier
;; cycles were settled and not yet paid out, the amount returned here covers
;; those too. A staker whose per-cycle reward is too small to pay out should
;; call `settle-staker-rewards` per cycle and `payout` once instead.
;;
;; Returns `{ earned, withdrawal-request }`, where `earned` is the amount
;; actually paid out.
(define-public (claim-staker-rewards
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (let ((settled (try! (settle-staker-rewards staker reward-cycle bond-index))))
    ;; Listed: settle credited held (fee 0); do not call payout (would revert
    ;; the hold). Clear: pay pending as before.
    (if (try! (check-staker staker))
      (ok {
        earned: settled,
        withdrawal-request: none,
      })
      (let ((result (try! (payout staker))))
        (ok {
          earned: (get amount result),
          withdrawal-request: (get withdrawal-request result),
        })
      )
    )
  )
)

;;; Withdrawal settlement

;; Reclaim a REJECTED L1 withdrawal back to the staker who earned it.
;;
;; `claim-staker-rewards` initiates the sBTC withdrawal inside `as-contract?`,
;; meaning this contract is the withdrawal's requester. Any sBTC the sBTC
;; protocol returns for that request therefore goes to this contract, not the
;; staker whose pox-5 balance was already zeroed. Two cases:
;;   * REJECTED  -> the full `amount + max-fee` is unlocked back to the
;;                  requester, and paid out here.
;;   * ACCEPTED  -> only the unused fee budget (`max-fee - actual-fee`) is
;;                  minted back; `settle-accepted-withdrawal` releases it to
;;                  the pool [changed].
;;
;; Permissionless, mirroring `claim-staker-rewards`: anyone may trigger it on a
;; staker's behalf. The `withdrawal-requests` entry is deleted so the reclaim
;; cannot be replayed.
(define-public (reclaim-failed-withdrawal (request-id uint))
  (let (
      (staker (unwrap! (map-get? withdrawal-requests request-id)
        ERR_UNKNOWN_WITHDRAWAL_REQUEST
      ))
      (request (unwrap!
        (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry
          get-withdrawal-request request-id
        )
        ERR_UNKNOWN_WITHDRAWAL_REQUEST
      ))
      (refund (+ (get amount request) (get max-fee request)))
    )
    ;; `status` is `none` while pending and `(some true)` once accepted;
    ;; only `(some false)` (rejected) unlocks the full amount back here.
    (asserts! (is-eq (get status request) (some false))
      ERR_WITHDRAWAL_NOT_REJECTED
    )
    ;; [added] Closes the "BTC refused -> paid as sBTC" path. The refund
    ;; stays reserved under `withdrawal-liability` until unblocked.
    (try! (assert-staker-clear staker))
    (asserts! (not (try! (check-pox-addr (get recipient request)))) ERR_BLOCKED)
    (map-delete withdrawal-requests request-id)
    ;; Request is settled: drop it from the outstanding staker liability.
    (var-set withdrawal-liability (- (var-get withdrawal-liability) refund))
    (print {
      topic: "reclaim-failed-withdrawal",
      request-id: request-id,
      staker: staker,
      amount-sats: refund,
    })
    (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        refund
      ))
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer refund tx-sender staker none
      ))
    ))
    (ok refund)
  )
)

;; Settle an ACCEPTED L1 withdrawal. [changed] Its unused fee budget is
;; pool income (as in the stacks-core reference), not credited to the staker.
;;
;; On acceptance the sBTC protocol pays the staker on L1 and mints only the
;; unused fee budget (`max-fee - actual-fee`) back to this contract. The sBTC
;; registry does not store the actual fee paid (it appears only in an event),
;; so the amount is recovered from the balance instead: once this request's
;; liability is released, the unreserved balance is exactly what came back for
;; it, capped at `max-fee` as a safety bound.
;;
;; CAVEAT: that inference is exact when withdrawals are settled one at a time,
;; which is the normal case since this call is permissionless and the staker is
;; the one paid. With several accepted-but-unsettled requests outstanding, the
;; still-reserved liability of the others suppresses the reading, so an early
;; settler may be credited less than their true refund and a later one more.
;; [changed] The dust is pool income in this version, so this only affects the
;; reported `pool-fee-dust` figure, never a staker balance.
;;
;; Mirrors `reclaim-failed-withdrawal` (permissionless, deletes the entry to
;; prevent replay) but for the accept case.
(define-public (settle-accepted-withdrawal (request-id uint))
  (let (
      (staker (unwrap! (map-get? withdrawal-requests request-id)
        ERR_UNKNOWN_WITHDRAWAL_REQUEST
      ))
      (request (unwrap!
        (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry
          get-withdrawal-request request-id
        )
        ERR_UNKNOWN_WITHDRAWAL_REQUEST
      ))
      (max-fee (get max-fee request))
      (liability (+ (get amount request) max-fee))
    )
    ;; `status` is `none` while pending and `(some false)` if rejected;
    ;; only `(some true)` (accepted) is settleable here. Rejected requests
    ;; must go through `reclaim-failed-withdrawal` so the staker is paid.
    (asserts! (is-eq (get status request) (some true))
      ERR_WITHDRAWAL_NOT_ACCEPTED
    )
    (map-delete withdrawal-requests request-id)
    ;; Request is settled: drop it from the outstanding staker liability.
    (var-set withdrawal-liability (- (var-get withdrawal-liability) liability))
    ;; [changed] Dust stays unattributed -> sweepable by an admin as income.
    ;; Reported for bookkeeping only (same inference/caveat as above).
    (let ((refund (min-uint max-fee (unattributed-balance))))
      (print {
        topic: "settle-accepted-withdrawal",
        request-id: request-id,
        staker: staker,
        liability-released: liability,
        pool-fee-dust: refund,
      })
      (ok refund)
    )
  )
)

;;; Admin functions

;; Update the allowed admin principals.
;;
;; An admin may not remove themselves. Removing an admin therefore always
;; requires a *different* admin to do it, and since `authorize-admin` has

;;; [added] Switchable inputs + floor + cycle cache

(define-private (assert-list (blist <blocklist-trait>))
  (ok (asserts! (is-eq (contract-of blist) (var-get list-contract)) ERR_WRONG_INPUT_CONTRACT))
)

(define-private (assert-discounts (discounts <fee-discounts-trait>))
  (ok (asserts! (is-eq (contract-of discounts) (var-get discounts-contract)) ERR_WRONG_INPUT_CONTRACT))
)

;; Propose a list switch (admin-only). Takes effect at burn height + INPUT_SWITCH_DELAY_BLOCKS (1008).
(define-public (propose-list-contract (new <blocklist-trait>))
  (let (
      (next (contract-of new))
      (at (+ burn-block-height INPUT_SWITCH_DELAY_BLOCKS))
    )
    (try! (authorize-admin))
    (var-set pending-list-switch (some { next: next, activate-at: at }))
    (print {
      topic: "propose-list-contract",
      list: next,
      activate-at: at,
      by: tx-sender,
    })
    (ok at)
  )
)

(define-public (activate-list-contract (new <blocklist-trait>))
  (let (
      (pend (unwrap! (var-get pending-list-switch) ERR_NO_PENDING_SWITCH))
      (next (contract-of new))
    )
    (try! (authorize-admin))
    (asserts! (is-eq next (get next pend)) ERR_WRONG_INPUT_CONTRACT)
    (asserts! (>= burn-block-height (get activate-at pend)) ERR_SWITCH_NOT_READY)
    (var-set list-contract next)
    (var-set pending-list-switch none)
    (print {
      topic: "activate-list-contract",
      list: next,
      by: tx-sender,
    })
    (ok next)
  )
)

(define-public (cancel-list-switch)
  (begin
    (try! (authorize-admin))
    (asserts! (is-some (var-get pending-list-switch)) ERR_NO_PENDING_SWITCH)
    (print {
      topic: "cancel-list-switch",
      pending: (var-get pending-list-switch),
      by: tx-sender,
    })
    (var-set pending-list-switch none)
    (ok true)
  )
)

(define-public (propose-discounts-contract (new <fee-discounts-trait>))
  (let (
      (next (contract-of new))
      (at (+ burn-block-height INPUT_SWITCH_DELAY_BLOCKS))
    )
    (try! (authorize-admin))
    (var-set pending-discounts-switch (some { next: next, activate-at: at }))
    (print {
      topic: "propose-discounts-contract",
      discounts: next,
      activate-at: at,
      by: tx-sender,
    })
    (ok at)
  )
)

(define-public (activate-discounts-contract (new <fee-discounts-trait>))
  (let (
      (pend (unwrap! (var-get pending-discounts-switch) ERR_NO_PENDING_SWITCH))
      (next (contract-of new))
    )
    (try! (authorize-admin))
    (asserts! (is-eq next (get next pend)) ERR_WRONG_INPUT_CONTRACT)
    (asserts! (>= burn-block-height (get activate-at pend)) ERR_SWITCH_NOT_READY)
    (var-set discounts-contract next)
    (var-set pending-discounts-switch none)
    (print {
      topic: "activate-discounts-contract",
      discounts: next,
      by: tx-sender,
    })
    (ok next)
  )
)

(define-public (cancel-discounts-switch)
  (begin
    (try! (authorize-admin))
    (asserts! (is-some (var-get pending-discounts-switch)) ERR_NO_PENDING_SWITCH)
    (print {
      topic: "cancel-discounts-switch",
      pending: (var-get pending-discounts-switch),
      by: tx-sender,
    })
    (var-set pending-discounts-switch none)
    (ok true)
  )
)

;;; [added] Held-funds release (admin-only two-step; never automatic)
;; [changed 2026-10-10] Two separate paths sharing one pending slot:
;;   * `propose-release` -- back to the ORIGINAL STAKER (sBTC to the staker
;;     principal, or the staker's stored L1 address). Allowed only if the staker
;;     principal AND stored BTC address are clear on the list at BOTH propose
;;     and execute. The normal pool fee is taken at execute, from the per-staker
;;     fee recorded at hold time (each cycle's real effective rate: ladder, size,
;;     discount, floor, 500 cap). The fee is credited to `earned-fees` only
;;     then; until execute it stays inside the held ledger (unsweepable,
;;     unwithdrawable). Partial releases take a proportional share of the
;;     REMAINING recorded fee, so the total fee can never exceed what was recorded.
;;   * `propose-ofac-release` -- to an OFAC-directed address. NO fee. The
;;     destination must be on the approved-destination list (admin add with a
;;     DEST_APPROVAL_DELAY_BLOCKS = 432-block delay) and clear on the sanctions list at propose and execute.
;;   While a staker stays listed nothing is released and no fee is taken.
;;   Events: propose-release / propose-ofac-release / execute-release (with
;;   `fee`, u0 on the OFAC path) / cancel-release.
(define-public (propose-release
    (staker principal)
    (amount uint)
    (destination principal)
    (use-staker-l1 bool)
    (reason-code uint)
  )
  (begin
    (try! (authorize-admin))
    (asserts! (is-eq destination staker) ERR_INVALID_RELEASE)
    (asserts! (not (try! (check-staker staker))) ERR_RELEASE_DEST_BLOCKED)
    (if use-staker-l1
      (asserts! (is-some (map-get? payout-configs staker)) ERR_INVALID_RELEASE)
      true
    )
    (queue-release staker amount staker use-staker-l1 false reason-code)
  )
)

(define-public (propose-ofac-release
    (staker principal)
    (amount uint)
    (destination principal)
    (reason-code uint)
  )
  (begin
    (try! (authorize-admin))
    (asserts! (is-approved-destination destination) ERR_DEST_NOT_APPROVED)
    (asserts! (not (try! (check-principal destination))) ERR_RELEASE_DEST_BLOCKED)
    (queue-release staker amount destination false true reason-code)
  )
)

(define-private (queue-release
    (staker principal)
    (amount uint)
    (destination principal)
    (use-staker-l1 bool)
    (ofac bool)
    (reason-code uint)
  )
  (let (
      (held (get-held-amount staker))
      (pay (if (is-eq amount u0) held amount))
      (at (+ burn-block-height RELEASE_DELAY_BLOCKS))
    )
    (asserts! (is-none (var-get pending-release)) ERR_RELEASE_PENDING)
    (asserts! (> held u0) ERR_NO_HELD)
    (asserts! (and (> pay u0) (<= pay held)) ERR_INVALID_RELEASE)
    (var-set pending-release (some {
      staker: staker,
      amount: pay,
      destination: destination,
      use-staker-l1: use-staker-l1,
      ofac-directed: ofac,
      reason-code: reason-code,
      activate-at: at,
    }))
    (print {
      topic: (if ofac "propose-ofac-release" "propose-release"),
      staker: staker,
      amount: pay,
      destination: destination,
      use-staker-l1: use-staker-l1,
      ofac-directed: ofac,
      fee-estimate: (if ofac u0 (release-fee staker pay)),
      reason-code: reason-code,
      activate-at: at,
      destination-checked: true,
      by: tx-sender,
    })
    (ok at)
  )
)

;; Fee share for releasing `amount` of the staker's held balance to the staker:
;; remaining recorded fee * amount / held (never more than the remaining fee).
(define-read-only (release-fee (staker principal) (amount uint))
  (release-fee-calc (get-held-fee-owed staker) (get-held-amount staker) amount)
)

;; [changed 2026-10-10] K-1: pro-rata share, capped below the amount released so
;; (- amount fee) can never abort and the staker always receives >= 1 sat.
;; A final release forgives any remainder above the cap (nothing left to take it from);
;; a partial release keeps the remainder owed.
(define-read-only (release-fee-calc (owed uint) (held uint) (amount uint))
  (min-uint (if (> amount u0) (- amount u1) u0)
    (if (or (is-eq held u0) (>= amount held)) owed (/ (* owed amount) held)))
)

(define-public (execute-release)
  (let (
      (pend (unwrap! (var-get pending-release) ERR_NO_PENDING_RELEASE))
      (staker (get staker pend))
      (amount (get amount pend))
      (destination (get destination pend))
      (use-l1 (get use-staker-l1 pend))
      (ofac (get ofac-directed pend))
      (held (get-held-amount staker))
      (owed-share (release-fee staker amount))
      (fee (if ofac u0 owed-share))
      (send (- amount fee))
    )
    (try! (authorize-admin))
    (asserts! (>= burn-block-height (get activate-at pend)) ERR_RELEASE_NOT_READY)
    (asserts! (>= held amount) ERR_NO_HELD)
    ;; Re-check at execute: the list may have changed during the delay.
    (if ofac
      (begin
        (asserts! (is-approved-destination destination) ERR_DEST_NOT_APPROVED)
        (asserts! (not (try! (check-principal destination))) ERR_RELEASE_DEST_BLOCKED)
      )
      (asserts! (not (try! (check-staker staker))) ERR_RELEASE_DEST_BLOCKED)
    )
    (let (
        (config (if use-l1
          (map-get? payout-configs staker)
          none
        ))
        (withdrawal-request (try! (as-contract?
          ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
            "sbtc-token" send
          ))
          (if use-l1
            (let (
                (l1-info (unwrap! config ERR_INVALID_RELEASE))
                (max-fee (get max-fee l1-info))
              )
              (asserts! (> send (+ max-fee DUST_LIMIT)) ERR_BELOW_DUST_LIMIT)
              (some (try! (contract-call?
                'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-withdrawal
                initiate-withdrawal-request (- send max-fee)
                (get pox-addr l1-info) max-fee
              )))
            )
            (begin
              (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
                transfer send tx-sender destination none
              ))
              none
            )
          )
        )))
      )
      (try! (debit-held staker amount))
      ;; Recorded fee leaves the held ledger once: taken (staker path) or
      ;; forgiven (OFAC path). Tracked so a partial release cannot take it twice.
      ;; final release clears any capped remainder (K-1); partials reduce by the share taken
      (map-set held-fee-owed staker (if (>= amount held) u0 (- (get-held-fee-owed staker) owed-share)))
      (map-set held-fee-taken staker (+ (get-held-fee-taken staker) fee))
      (var-set earned-fees (+ (var-get earned-fees) fee))
      (var-set pending-release none)
      (match withdrawal-request
        id (begin
          (map-set withdrawal-requests id staker)
          (var-set withdrawal-liability (+ (var-get withdrawal-liability) send))
        )
        true
      )
      (print {
        topic: "execute-release",
        staker: staker,
        amount: amount,
        fee: fee,
        sent: send,
        destination: destination,
        use-staker-l1: use-l1,
        ofac-directed: ofac,
        reason-code: (get reason-code pend),
        withdrawal-request: withdrawal-request,
        by: tx-sender,
      })
      (ok {
        amount: amount,
        fee: fee,
        withdrawal-request: withdrawal-request,
      })
    )
  )
)

(define-public (cancel-release)
  (begin
    (try! (authorize-admin))
    (asserts! (is-some (var-get pending-release)) ERR_NO_PENDING_RELEASE)
    (print {
      topic: "cancel-release",
      pending: (var-get pending-release),
      by: tx-sender,
    })
    (var-set pending-release none)
    (ok true)
  )
)

;; [added 2026-10-10] Approved OFAC-directed destinations. Adding waits
;; DEST_APPROVAL_DELAY_BLOCKS (432, ~3 days) and is cancellable; removal is immediate
;; (it only narrows where funds can go). Events for every step.
(define-public (propose-approved-destination (dest principal))
  (let ((at (+ burn-block-height DEST_APPROVAL_DELAY_BLOCKS)))
    (try! (authorize-admin))
    (asserts! (is-none (var-get pending-dest-approval)) ERR_DEST_APPROVAL_PENDING)
    (asserts! (not (is-approved-destination dest)) ERR_INVALID_RELEASE)
    (asserts! (not (try! (check-principal dest))) ERR_RELEASE_DEST_BLOCKED)
    (var-set pending-dest-approval (some { dest: dest, activate-at: at }))
    (print { topic: "approved-destination-proposed", destination: dest, activate-at: at, by: tx-sender })
    (ok at)
  )
)

(define-public (execute-approved-destination)
  (let ((p (unwrap! (var-get pending-dest-approval) ERR_NO_PENDING_DEST_APPROVAL)))
    (try! (authorize-admin))
    (asserts! (>= burn-block-height (get activate-at p)) ERR_RELEASE_NOT_READY)
    (asserts! (not (try! (check-principal (get dest p)))) ERR_RELEASE_DEST_BLOCKED)
    (map-set approved-destinations (get dest p) true)
    (var-set pending-dest-approval none)
    (print { topic: "approved-destination-added", destination: (get dest p), by: tx-sender })
    (ok true)
  )
)

(define-public (cancel-approved-destination)
  (let ((p (unwrap! (var-get pending-dest-approval) ERR_NO_PENDING_DEST_APPROVAL)))
    (try! (authorize-admin))
    (var-set pending-dest-approval none)
    (print { topic: "approved-destination-cancelled", pending: p, by: tx-sender })
    (ok true)
  )
)

(define-public (remove-approved-destination (dest principal))
  (begin
    (try! (authorize-admin))
    (map-delete approved-destinations dest)
    (print { topic: "approved-destination-removed", destination: dest, by: tx-sender })
    (ok true)
  )
)

(define-read-only (is-approved-destination (dest principal))
  (default-to false (map-get? approved-destinations dest))
)

(define-read-only (get-pending-dest-approval)
  (var-get pending-dest-approval)
)

(define-read-only (get-held-fee-owed (staker principal))
  (default-to u0 (map-get? held-fee-owed staker))
)

(define-read-only (get-held-fee-taken (staker principal))
  (default-to u0 (map-get? held-fee-taken staker))
)

(define-read-only (get-held-fee-bips (staker principal) (reward-cycle uint) (bond-index (optional uint)))
  (map-get? held-fee-bips { staker: staker, reward-cycle: reward-cycle, bond-index: bond-index })
)

;; [changed 2026-10-10] Cut (<= floor in force next cycle) => from cycle+1;
;; raise => from cycle+2. A new change replaces any queued change starting at
;; or after its own start cycle. Returns (ok true) for a cut, (ok false) for a raise.
(define-public (set-floor-bips (bips uint))
  (let (
      ;; Live pox-5 cycle (not the RO cache) so a stale cache can never pull a change earlier.
      (cycle (current-cycle))
      (next-bips (get-floor-bips-at (+ cycle u1)))
      (cut (<= bips next-bips))
      (from (+ cycle (if cut FLOOR_CUT_DELAY_CYCLES FLOOR_RAISE_DELAY_CYCLES)))
      (count (var-get fee-floor-count))
      (idx1 (if (and (> count u1) (>= (get from (get-floor-version (- count u1))) from)) (- count u1) count))
      (idx (if (and (> idx1 u1) (>= (get from (get-floor-version (- idx1 u1))) from)) (- idx1 u1) idx1))
    )
    (try! (authorize-admin))
    (asserts! (<= bips MAX_FEE_BIPS) ERR_INVALID_FLOOR)
    (map-set fee-floor-versions idx { from: from, bips: bips })
    (map-set fee-floor-initiated idx { burn-height: burn-block-height, stacks-height: stacks-block-height, time: stacks-block-time, cycle: cycle })
    (var-set fee-last-update { burn-height: burn-block-height, stacks-height: stacks-block-height, time: stacks-block-time })
    (var-set fee-floor-count (+ idx u1))
    (print { topic: "set-floor-bips", burn-height: burn-block-height, stacks-height: stacks-block-height, time: stacks-block-time, initiated-cycle: cycle, effective-cycle: from, bips: bips, cut: cut, immediate: false, from: from, version: idx, by: tx-sender })
    (ok cut)
  )
)

(define-read-only (get-floor-version (idx uint))
  (default-to { from: u0, bips: (var-get fee-floor-bips) } (map-get? fee-floor-versions idx))
)

(define-read-only (get-pending-floor)
  (let ((v (get-floor-version (- (var-get fee-floor-count) u1))))
    (if (> (get from v) (current-cycle-cached)) (some v) none)
  )
)

(define-private (find-floor-version (step uint) (acc { cycle: uint, idx: uint, bips: uint, done: bool }))
  (if (or (get done acc) (is-eq (get idx acc) u0))
    (merge acc { done: true })
    (let ((i (- (get idx acc) u1)) (v (get-floor-version i)))
      (if (<= (get from v) (get cycle acc))
        (merge acc { idx: i, bips: (get bips v), done: true })
        (merge acc { idx: i })
      )
    )
  )
)

;; Permissionless: cache pox-5 cycle-start burn height for cheap RO views.
(define-public (cache-cycle-start (reward-cycle uint))
  (let (
      (start (contract-call? 'SP000000000000000000002Q6VF78.pox-5
        reward-cycle-to-burn-height reward-cycle
      ))
    )
    (map-set cycle-start-burn reward-cycle start)
    (print { topic: "cache-cycle-start", reward-cycle: reward-cycle, start: start })
    (ok start)
  )
)

(define-read-only (get-list-contract)
  (var-get list-contract)
)

(define-read-only (get-discounts-contract)
  (var-get discounts-contract)
)

(define-read-only (get-pending-list-switch)
  (var-get pending-list-switch)
)

(define-read-only (get-pending-discounts-switch)
  (var-get pending-discounts-switch)
)

(define-read-only (get-input-switch-delay)
  INPUT_SWITCH_DELAY_BLOCKS
)

(define-read-only (get-floor-bips)
  (get-floor-bips-at (current-cycle-cached))
)

(define-read-only (get-floor-bips-at (cycle uint))
  (get bips (fold find-floor-version FLOOR_HISTORY_STEPS {
    cycle: cycle,
    idx: (var-get fee-floor-count),
    bips: (get bips (get-floor-version u0)),
    done: false,
  }))
)

(define-data-var cached-pox-cycle uint u0)

(define-read-only (current-cycle-cached)
  (let ((c (var-get cached-pox-cycle)))
    (if (> c u0) c (current-cycle))
  )
)

(define-public (cache-pox-cycle)
  (let ((c (current-cycle)))
    (var-set cached-pox-cycle c)
    (unwrap-panic (cache-cycle-start c))
    (unwrap-panic (cache-cycle-start (+ c u1)))
    (ok c)
  )
)

;; already established that the caller is one, at least one admin always
;; survives the call. That is what stops the contract being left with no admin
;; at all, which would permanently disable `withdraw-fees`,
;; `sweep-fee-refunds` and `register-self`, stranding any accrued fees.
;;
;; [changed 2026-10-10] now also enforced by `admin-count` (see below).
;; [added 2026-10-10] Admin changes are TWO-STEP with an ADMIN_CHANGE_DELAY_BLOCKS (1008) delay.
;; `update-admin` only PROPOSES (one pending change at a time). Any current
;; admin may `cancel-admin-change` during the delay; after it, any current
;; admin may `execute-admin-change`. Additions and removals both wait the full
;; delay. `admin-count` guarantees at least one admin always remains, and an
;; admin still may not propose removing themselves. Events: admin-change-proposed /
;; admin-change-executed / admin-change-cancelled (server alerts on these).
(define-constant ADMIN_CHANGE_DELAY_BLOCKS u1008) ;; [changed 2026-10-10] ~1 week
(define-constant ERR_ADMIN_CHANGE_PENDING (err u1032))
(define-constant ERR_NO_ADMIN_CHANGE (err u1033))
(define-constant ERR_ADMIN_CHANGE_NOT_READY (err u1034))
(define-constant ERR_LAST_ADMIN (err u1035))
(define-constant ERR_ADMIN_NOOP (err u1036))
(define-constant ERR_PRIME_FUTURE_CYCLE (err u1042))
(define-data-var admin-count uint u1)
(define-data-var pending-admin-change
  (optional { admin: principal, enabled: bool, activate-at: uint, proposed-by: principal })
  none
)

(define-public (update-admin
    (admin principal)
    (enabled bool)
  )
  (let ((at (+ burn-block-height ADMIN_CHANGE_DELAY_BLOCKS)))
    (try! (authorize-admin))
    (asserts! (or enabled (not (is-eq admin tx-sender))) ERR_CANNOT_REMOVE_SELF)
    (asserts! (is-none (var-get pending-admin-change)) ERR_ADMIN_CHANGE_PENDING)
    (asserts! (not (is-eq enabled (is-admin admin))) ERR_ADMIN_NOOP)
    (asserts! (or enabled (> (var-get admin-count) u1)) ERR_LAST_ADMIN)
    (var-set pending-admin-change (some { admin: admin, enabled: enabled, activate-at: at, proposed-by: tx-sender }))
    (print { topic: "admin-change-proposed", admin: admin, enabled: enabled, activate-at: at, by: tx-sender })
    (ok at)
  )
)

(define-public (execute-admin-change)
  (let (
      (p (unwrap! (var-get pending-admin-change) ERR_NO_ADMIN_CHANGE))
      (admin (get admin p))
      (enabled (get enabled p))
      (count (var-get admin-count))
    )
    (try! (authorize-admin))
    (asserts! (>= burn-block-height (get activate-at p)) ERR_ADMIN_CHANGE_NOT_READY)
    (asserts! (not (is-eq enabled (is-admin admin))) ERR_ADMIN_NOOP)
    (asserts! (or enabled (> count u1)) ERR_LAST_ADMIN)
    (if enabled (map-set admins admin true) (map-delete admins admin))
    (var-set admin-count (if enabled (+ count u1) (- count u1)))
    (var-set pending-admin-change none)
    (print { topic: "admin-change-executed", admin: admin, enabled: enabled, admin-count: (var-get admin-count), by: tx-sender })
    (ok true)
  )
)

(define-public (cancel-admin-change)
  (let ((p (unwrap! (var-get pending-admin-change) ERR_NO_ADMIN_CHANGE)))
    (try! (authorize-admin))
    (var-set pending-admin-change none)
    (print { topic: "admin-change-cancelled", pending: p, by: tx-sender })
    (ok true)
  )
)

(define-read-only (get-pending-admin-change)
  (var-get pending-admin-change)
)

(define-read-only (get-admin-count)
  (var-get admin-count)
)

;; Withdraw accrued admin fees from staker rewards.
(define-public (withdraw-fees
    (amount uint)
    (recipient principal)
  )
  (let ((fees (var-get earned-fees)))
    (try! (authorize-admin))
    (asserts! (is-eq recipient (var-get fee-address)) ERR_NOT_FEE_ADDRESS) ;; [added 2026-10-10]
    (asserts! (not (try! (check-principal recipient))) ERR_BLOCKED) ;; [added]
    (asserts! (<= amount fees) ERR_INSUFFICIENT_FEES)
    (var-set earned-fees (- fees amount))
    (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        amount
      ))
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer amount tx-sender recipient none
      ))
    ))
    (ok amount)
  )
)

;; Sweep sBTC that belongs to nobody to a recipient.
;;
;; [changed] As in v1 / the stacks-core reference, this is how accepted-
;; withdrawal fee dust (pool income) is recovered once
;; `settle-accepted-withdrawal` has released the request, plus any sBTC sent
;; here by mistake beyond the rounding residue on `unclaimed-rewards-for-cycle`.
;;
;; The full unreserved amount is taken: the sBTC balance minus the fee
;; accumulator (`earned-fees`), the outstanding `withdrawal-liability`, the
;; pooled `unclaimed-rewards-for-cycle` totals,
;; `total-pending-payouts`, and `total-held-rewards`, so it can NEVER sweep
;; funds owed to a staker -- whether those funds are still pooled for a cycle,
;; settled awaiting `payout`, or frozen in the held ledger. A rejected-but-unreclaimed
;; withdrawal's `amount + max-fee` is present in BOTH the sBTC balance (the
;; protocol returned it here) and in `withdrawal-liability` (the entry is still
;; live), so the two cancel and the refund stays untouchable, whether or not
;; anyone has called `reclaim-failed-withdrawal` yet.
(define-public (sweep-fee-refunds (recipient principal))
  (let ((sweepable (unattributed-balance)))
    (try! (authorize-admin))
    (asserts! (is-eq recipient (var-get fee-address)) ERR_NOT_FEE_ADDRESS) ;; [added 2026-10-10]
    (asserts! (not (try! (check-principal recipient))) ERR_BLOCKED) ;; [added]
    (asserts! (> sweepable u0) ERR_NO_REFUNDS)
    (print {
      topic: "sweep-fee-refunds",
      amount-sats: sweepable,
      recipient: recipient,
    })
    (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        sweepable
      ))
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer sweepable tx-sender recipient none
      ))
    ))
    (ok sweepable)
  )
)

;; [added 2026-10-10] Fee address change: propose / execute (after 432) / cancel.
(define-public (propose-fee-address (addr principal))
  (let ((at (+ burn-block-height FEE_ADDRESS_DELAY_BLOCKS)))
    (try! (authorize-admin))
    (asserts! (is-none (var-get pending-fee-address)) ERR_FEE_ADDRESS_PENDING)
    (asserts! (not (try! (check-principal addr))) ERR_BLOCKED)
    (var-set pending-fee-address (some { addr: addr, activate-at: at, proposed-by: tx-sender }))
    (print { topic: "fee-address-proposed", addr: addr, current: (var-get fee-address), activate-at: at, by: tx-sender })
    (ok at)
  )
)

(define-public (execute-fee-address)
  (let ((p (unwrap! (var-get pending-fee-address) ERR_NO_PENDING_FEE_ADDRESS)))
    (try! (authorize-admin))
    (asserts! (>= burn-block-height (get activate-at p)) ERR_FEE_ADDRESS_NOT_READY)
    (asserts! (not (try! (check-principal (get addr p)))) ERR_BLOCKED)
    (print { topic: "fee-address-changed", old: (var-get fee-address), addr: (get addr p), by: tx-sender })
    (var-set fee-address (get addr p))
    (var-set pending-fee-address none)
    (ok true)
  )
)

(define-public (cancel-fee-address)
  (let ((p (unwrap! (var-get pending-fee-address) ERR_NO_PENDING_FEE_ADDRESS)))
    (try! (authorize-admin))
    (var-set pending-fee-address none)
    (print { topic: "fee-address-cancelled", pending: p, by: tx-sender })
    (ok true)
  )
)

(define-read-only (get-fee-address) (var-get fee-address))
(define-read-only (get-pending-fee-address) (var-get pending-fee-address))

;; As an admin, register this contract with a specific signer key. The signer key grant
;; must not have been used yet.
(define-public (register-self
    (signer-manager <signer-manager-trait>)
    (signer-key (buff 33))
    (auth-id uint)
    (signer-sig (buff 65))
  )
  (begin
    (try! (authorize-admin))
    (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 grant-signer-key
      signer-key current-contract auth-id signer-sig
    ))
    (contract-call? 'SP000000000000000000002Q6VF78.pox-5 register-signer
      signer-manager signer-key
    )
  )
)

;;; [added] Batch payouts

;; Settle `reward-cycle` (when given; each entry's own `bond-index`) and pay
;; out up to 50 stakers in one transaction. Same rules per staker as
;; `settle-staker-rewards` and `payout`: admin / automation key any time,
;; anyone else after the cycle's and the staker's backstop. Listed stakers
;; are settled into the held ledger (fee 0) and never paid here. Entries that
;; cannot be settled or paid are skipped with an event; settled-but-unpaid
;; balances (e.g. below min-claim) stay pending. `reward-cycle = none` pays
;; out already-settled balances only. Cycle-level values (backstop height,
;; incentive settings) are read once per batch to keep the per-entry cost low.
;; Returns the batch summary.
(define-public (payout-many
    (reward-cycle (optional uint))
    (entries (list 50 {
      staker: principal,
      bond-index: (optional uint),
    }))
  )
  (let (
      (cycle (default-to u0 reward-cycle))
      (result (fold payout-entry entries {
        early: (is-early-payer),
        reward-cycle: reward-cycle,
        ready-height: (match reward-cycle
          c (get-cycle-backstop-height c)
          u0
        ),
        cycle-start: (match reward-cycle
          c (default-to u0 (map-get? cycle-start-burn c))
          u0
        ),
        ;; settings unused for fees (get-staker-fee-bips); placeholder keeps the acc type
        settings: {
          step2-cycles: u7, step3-cycles: u13, step4-cycles: u25,
          step1-bips: u500, step2-bips: u400, step3-bips: u400, step4-bips: u350,
          size1-ustx: u250000000000, size1-bips: u25, size2-ustx: u1000000000000, size2-bips: u50,
        },
        settled: u0,
        paid: u0,
        skipped: u0,
        amount: u0,
      }))
    )
    (print {
      topic: "payout-many",
      reward-cycle: reward-cycle,
      entries: (len entries),
      settled: (get settled result),
      paid: (get paid result),
      skipped: (get skipped result),
      amount-sats: (get amount result),
    })
    (ok {
      early: (get early result),
      settled: (get settled result),
      paid: (get paid result),
      skipped: (get skipped result),
      amount: (get amount result),
    })
  )
)

(define-private (payout-entry
    (entry {
      staker: principal,
      bond-index: (optional uint),
    })
    (acc {
      early: bool,
      reward-cycle: (optional uint),
      ready-height: uint,
      cycle-start: uint,
      settings: {
        step2-cycles: uint,
        step3-cycles: uint,
        step4-cycles: uint,
        step1-bips: uint,
        step2-bips: uint,
        step3-bips: uint,
        step4-bips: uint,
        size1-ustx: uint,
        size1-bips: uint,
        size2-ustx: uint,
        size2-bips: uint,
      },
      settled: uint,
      paid: uint,
      skipped: uint,
      amount: uint,
    })
  )
  (let (
      (staker (get staker entry))
      (status (check-staker staker))
    )
    ;; Clear or listed: settle (listed -> held, fee 0). Unavailable: skip.
    (if (is-ok status)
      (let (
          (listed (unwrap-panic status))
          (settled (match (get reward-cycle acc)
            c (batch-settle staker c (get bond-index entry) listed acc)
            false
          ))
          (paid (if listed
            u0
            (batch-pay staker (get early acc))
          ))
        )
        (if listed
          (begin
            (print {
              topic: "payout-skipped",
              staker: staker,
              amount-sats: (get-held-amount staker),
              reason: u1018,
            })
            (merge acc {
              settled: (+ (get settled acc) (if settled u1 u0)),
              skipped: (+ (get skipped acc) u1),
            })
          )
          (merge acc {
            settled: (+ (get settled acc) (if settled u1 u0)),
            paid: (+ (get paid acc) (if (> paid u0) u1 u0)),
            skipped: (+ (get skipped acc) (if (> paid u0) u0 u1)),
            amount: (+ (get amount acc) paid),
          })
        )
      )
      (begin
        ;; list unavailable (u1021): nothing moves
        (print {
          topic: "payout-skipped",
          staker: staker,
          amount-sats: (get-pending-payout staker),
          reason: (match status
            listed u1018
            e e
          ),
        })
        (merge acc { skipped: (+ (get skipped acc) u1) })
      )
    )
  )
)

;; Batch version of `settle-staker-rewards`. `listed` = credit held (fee 0)
;; instead of pending. Conditions checked before pox-5 is touched.
(define-private (batch-settle
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
    (listed bool)
    (ctx {
      early: bool,
      reward-cycle: (optional uint),
      ready-height: uint,
      cycle-start: uint,
      settings: {
        step2-cycles: uint,
        step3-cycles: uint,
        step4-cycles: uint,
        step1-bips: uint,
        step2-bips: uint,
        step3-bips: uint,
        step4-bips: uint,
        size1-ustx: uint,
        size1-bips: uint,
        size2-ustx: uint,
        size2-bips: uint,
      },
      settled: uint,
      paid: uint,
      skipped: uint,
      amount: uint,
    })
  )
  (let (
      (early (get early ctx))
      (ready-height (get ready-height ctx))
      (gross (contract-call? 'SP000000000000000000002Q6VF78.pox-5
        get-earned-staker-rewards current-contract reward-cycle bond-index
        staker
      ))
      (bucket-key {
        reward-cycle: reward-cycle,
        bond-index: bond-index,
      })
      (bucket (default-to u0 (map-get? unclaimed-rewards-for-cycle bucket-key)))
      (reason (if (not (or early (>= burn-block-height ready-height)))
        u1020
        (if (or (is-eq gross u0) (< bucket gross))
          u1001
          u0
        )
      ))
    )
    (if (> reason u0)
      (begin
        (print {
          topic: "settle-skipped",
          staker: staker,
          reward-cycle: reward-cycle,
          bond-index: bond-index,
          reason: reason,
        })
        false
      )
      (let (
          ;; [added] Snapshot cycle-locked uSTX for size tier before fee calc.
          (locked-ustx (cache-staked-in-cycle staker reward-cycle bond-index))
          (disc-snap (snapshot-discount staker reward-cycle))
          (fees (if listed
            u0
            (/ (* gross (get-staker-fee-bips staker reward-cycle bond-index))
              BIPS_DENOMINATOR
            )
          ))
          (earned (- gross fees))
          (list-counts (contract-call? .blocklist get-counts))
          (blocked-since (match (staker-blocked-since staker)
            since since
            e none
          ))
          (pox (match (map-get? payout-configs staker)
            cfg (some (get pox-addr cfg))
            none
          ))
        )
        (match (contract-call? 'SP000000000000000000002Q6VF78.pox-5
            claim-staker-rewards-for-signer staker reward-cycle bond-index
          )
          info (begin
            (if (and early (> ready-height (get-payout-unlock-height staker)))
              (map-set payout-unlock-height staker ready-height)
              true
            )
            (var-set earned-fees (+ (var-get earned-fees) fees))
            (map-set unclaimed-rewards-for-cycle bucket-key (- bucket gross))
            (var-set total-unclaimed-rewards
              (- (var-get total-unclaimed-rewards) gross)
            )
            (if listed
              (begin
                (credit-held staker reward-cycle bond-index earned)
                (print {
                  topic: "hold-rewards",
                  staker: staker,
                  pox-addr: pox,
                  reward-cycle: reward-cycle,
                  bond-index: bond-index,
                  amount: earned,
                  list: (var-get list-contract),
                  list-principals: (get principals list-counts),
                  list-pox-addrs: (get pox-addrs list-counts),
                  blocked-since: blocked-since,
                  burn-height: burn-block-height,
                })
                true
              )
              (begin
                (map-set pending-payouts staker (+ (get-pending-payout staker) earned))
                (var-set total-pending-payouts (+ (var-get total-pending-payouts) earned))
                (print {
                  topic: "settle-staker-rewards",
                  staker: staker,
                  reward-cycle: reward-cycle,
                  bond-index: bond-index,
                  earned: earned,
                  fees: fees,
                  pending-payout: (get-pending-payout staker),
                })
                true
              )
            )
          )
          e (begin
            (print {
              topic: "settle-skipped",
              staker: staker,
              reward-cycle: reward-cycle,
              bond-index: bond-index,
              reason: e,
            })
            false
          )
        )
      )
    )
  )
)

;; Batch version of `payout` for a staker already checked clear. Returns the
;; amount paid, or u0 when skipped (with a `payout-skipped` event).
(define-private (batch-pay
    (staker principal)
    (early bool)
  )
  (let (
      (amount (get-pending-payout staker))
      (config (get-payout-config staker))
      (reason (if (is-eq amount u0)
        u1016
        (if (not (or early (>= burn-block-height (get-payout-unlock-height staker))))
          u1020
          (match config
            l1-info (if (and (not (is-eq tx-sender staker)) (< amount (get min-claim l1-info)))
              u1013
              (if (<= amount (+ (get max-fee l1-info) DUST_LIMIT))
                u1012
                u0
              )
            )
            u0
          )
        )
      ))
    )
    (if (> reason u0)
      (begin
        (if (> amount u0)
          (begin
            (print {
              topic: "payout-skipped",
              staker: staker,
              amount-sats: amount,
              reason: reason,
            })
            true
          )
          false
        )
        u0
      )
      (match (batch-transfer staker amount config)
        paid amount
        e (begin
          (print {
            topic: "payout-skipped",
            staker: staker,
            amount-sats: amount,
            reason: e,
          })
          u0
        )
      )
    )
  )
)

;; Move the sBTC FIRST; bookkeeping only after it succeeded, so a failed
;; transfer (err from sBTC) leaves the staker's pending balance untouched.
(define-private (batch-transfer
    (staker principal)
    (amount uint)
    (config (optional {
      pox-addr: {
        version: (buff 1),
        hashbytes: (buff 32),
      },
      max-fee: uint,
      min-claim: uint,
    }))
  )
  (let ((withdrawal-request (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        "sbtc-token" amount
      ))
      (match config
        l1-info (some (try! (contract-call?
          'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-withdrawal
          initiate-withdrawal-request (- amount (get max-fee l1-info))
          (get pox-addr l1-info) (get max-fee l1-info)
        )))
        (begin
          (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
            transfer amount tx-sender staker none
          ))
          none
        )
      )))))
    (map-delete pending-payouts staker)
    (var-set total-pending-payouts (- (var-get total-pending-payouts) amount))
    (match withdrawal-request
      id (begin
        (map-set withdrawal-requests id staker)
        (var-set withdrawal-liability (+ (var-get withdrawal-liability) amount))
      )
      true
    )
    (print {
      topic: "payout",
      amount-sats: amount,
      l1-withdrawal: (match config
        l1-info (match withdrawal-request
          id (some (merge l1-info {
            withdrawal-request: id,
            amount: (- amount (get max-fee l1-info)),
          }))
          none
        )
        none
      ),
      staker: staker,
    })
    (ok withdrawal-request)
  )
)

;;; Private helpers

(define-private (authorize-admin)
  (ok (asserts! (and (is-eq contract-caller tx-sender) (is-admin tx-sender))
    ERR_UNAUTHORIZED_ADMIN
  ))
)

;; [added] (ok true) if the staker is clear; ERR_BLOCKED if listed;
;; ERR_BLOCKLIST_UNAVAILABLE if the list does not answer (fail closed).
(define-private (assert-staker-clear (staker principal))
  (ok (asserts! (not (try! (check-staker staker))) ERR_BLOCKED))
)

;; [added] Credit held ledger (listed-at-settle). Per-cycle map is a credit log.
(define-private (credit-held
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
    (amount uint)
  )
  (let (
      (key { staker: staker, reward-cycle: reward-cycle })
      (prev (default-to u0 (map-get? held-rewards key)))
      (tot (default-to u0 (map-get? held-totals staker)))
      ;; [added 2026-10-10] the staker's real effective rate for that cycle
      (bips (min-uint MAX_FEE_BIPS (get-staker-fee-bips staker reward-cycle bond-index)))
      (fee-part (/ (* amount bips) BIPS_DENOMINATOR))
    )
    (map-insert held-fee-bips { staker: staker, reward-cycle: reward-cycle, bond-index: bond-index } bips)
    (map-set held-fee-owed staker (+ (get-held-fee-owed staker) fee-part))
    (print { topic: "hold-fee-recorded", staker: staker, reward-cycle: reward-cycle, bond-index: bond-index, fee-bips: bips, fee: fee-part, amount: amount })
    (map-set held-rewards key (+ prev amount))
    (map-set held-totals staker (+ tot amount))
    (var-set total-held-rewards (+ (var-get total-held-rewards) amount))
    true
  )
)

(define-private (debit-held
    (staker principal)
    (amount uint)
  )
  (let ((tot (unwrap-panic (map-get? held-totals staker))))
    (asserts! (>= tot amount) ERR_NO_HELD)
    (let ((left (- tot amount)))
      (if (is-eq left u0)
        (map-delete held-totals staker)
        (map-set held-totals staker left)
      )
      (var-set total-held-rewards (- (var-get total-held-rewards) amount))
      (ok true)
    )
  )
)

;; [added] True when the direct signer (no intermediary contract) is an admin,
;; or the automation key (an unlisted `.blocklist` list-keeper): early pool
;; claim / settle / payout.
(define-private (is-early-payer)
  (and
    (is-eq contract-caller tx-sender)
    (or
      (is-admin tx-sender)
      (is-automation-key tx-sender)
    )
  )
)

;; [added] Record the start of the staker's current run in this pool. A call
;; whose first cycle is within the recorded run (stake-update) keeps the join
;; cycle; anything else (a new stake after exit) starts a new run. pox-5 is on
;; the call stack here, so pox-5 itself cannot be queried (no re-entrancy).
(define-private (record-staker-join
    (staker principal)
    (first-index uint)
    (num-indexes uint)
  )
  (let (
      (prev (map-get? staker-join staker))
      (continuing (match prev
        p (<= first-index (get end-cycle p))
        false
      ))
      (join (match prev
        p (if continuing
          (get join-cycle p)
          first-index
        )
        first-index
      ))
    )
    (map-set staker-join staker {
      join-cycle: join,
      end-cycle: (+ first-index num-indexes),
      ;; [added] start of the previous run, for settling its cycles later
      prev-join-cycle: (match prev
        p (if continuing
          (get prev-join-cycle p)
          (get join-cycle p)
        )
        join
      ),
    })
    (if continuing
      true
      (begin
        (print {
          topic: "staker-join",
          staker: staker,
          join-cycle: join,
        })
        true
      )
    )
  )
)

;; Ensure that the immediate caller is the pox-5 contract. The trait callbacks
;; (validate-stake!) write per-staker state keyed by the
;; `staker` argument; they must only ever be driven by pox-5, never invoked
;; directly by an external principal.
(define-private (authorize-pox-5)
  (ok (asserts! (is-eq contract-caller 'SP000000000000000000002Q6VF78.pox-5)
    ERR_UNAUTHORIZED_CALLER
  ))
)

;; Deserialize and store an L1 payout config supplied as pox-5 calldata.
(define-private (store-payout-config
    (staker principal)
    (calldata (buff 500))
  )
  (let ((config (unwrap! (parse-payout-calldata calldata) ERR_INVALID_CALLDATA)))
    (try! (check-payout-config config))
    (index-payout staker (get pox-addr config))
    (map-set payout-configs staker config)
    (ok true)
  )
)

;; [added 2026-10-10] Reverse lookup BTC payout pox-addr -> stakers (server
;; alerts when a list add hits a current staker). Up to 20 stakers per address;
;; beyond that the add is skipped with a "payout-index-full" event (never fails a stake).
(define-map payout-addr-stakers
  { version: (buff 1), hashbytes: (buff 32) }
  (list 20 principal)
)

(define-read-only (get-stakers-for-pox-addr (pox-addr { version: (buff 1), hashbytes: (buff 32) }))
  (default-to (list) (map-get? payout-addr-stakers pox-addr))
)

(define-private (not-staker (p principal))
  (not (is-eq p (var-get index-tmp)))
)
(define-data-var index-tmp principal tx-sender)

(define-private (drop-from-index
    (staker principal)
    (pox-addr { version: (buff 1), hashbytes: (buff 32) })
  )
  (begin
    (var-set index-tmp staker)
    (map-set payout-addr-stakers pox-addr (filter not-staker (get-stakers-for-pox-addr pox-addr)))
  )
)

(define-private (unindex-payout (staker principal))
  (match (map-get? payout-configs staker)
    old (drop-from-index staker (get pox-addr old))
    true
  )
)

(define-private (index-payout
    (staker principal)
    (pox-addr { version: (buff 1), hashbytes: (buff 32) })
  )
  (begin
    (unindex-payout staker)
    (match (as-max-len? (append (get-stakers-for-pox-addr pox-addr) staker) u20)
      l (map-set payout-addr-stakers pox-addr l)
      (begin (print { topic: "payout-index-full", pox-addr: pox-addr, staker: staker }) false)
    )
  )
)

(define-private (credit-cycle-bucket
    (key {
      reward-cycle: uint,
      bond-index: (optional uint),
    })
    (amount uint)
  )
  (map-set unclaimed-rewards-for-cycle key
    (+ (default-to u0 (map-get? unclaimed-rewards-for-cycle key)) amount)
  )
)

(define-private (snapshot-bond-rewards
    (bond-info {
      bond-index: uint,
      earned: uint,
      rewards-per-token: uint,
    })
    (acc {
      reward-cycle: uint,
      bips: uint,
    })
  )
  (let ((key {
      reward-cycle: (get reward-cycle acc),
      bond-index: (some (get bond-index bond-info)),
    }))
    (map-insert fee-bips-for-cycle key (get bips acc))
    (credit-cycle-bucket key (get earned bond-info))
    acc
  )
)

;;; Read-only views

;; [added] The automation key: an unlisted list-keeper on `.blocklist`.
(define-read-only (is-automation-key (who principal))
  ;; Static path (default list). After a list switch use is-automation-key-with.
  (if (is-eq (var-get list-contract) .blocklist)
    (contract-call? .blocklist is-active-keeper who)
    false
  )
)

;; Trait form: refuses a list that is not the active setting.
(define-public (is-automation-key-with (blist <blocklist-trait>) (who principal))
  (begin
    (try! (assert-list blist))
    (contract-call? blist active-keeper who)
  )
)

(define-read-only (is-admin (caller principal))
  (default-to false (map-get? admins caller))
)

;; [added] Blocklist queries via `.blocklist`. Each returns (ok true) if
;; listed, (ok false) if not, ERR_BLOCKLIST_UNAVAILABLE if the list refuses
;; to answer this contract. (Callable read-only by anyone; the list data is
;; public chain state anyway.)
(define-read-only (check-principal (who principal))
  (match (contract-call? .blocklist check-principal who)
    listed (ok listed)
    e ERR_BLOCKLIST_UNAVAILABLE
  )
)

;; Trait form: refuses a list that is not the active setting.
(define-public (check-principal-with (blist <blocklist-trait>) (who principal))
  (begin
    (try! (assert-list blist))
    (match (contract-call? blist check-principal who)
      listed (ok listed)
      e ERR_BLOCKLIST_UNAVAILABLE
    )
  )
)

(define-read-only (check-pox-addr (pox-addr {
  version: (buff 1),
  hashbytes: (buff 32),
}))
  (match (contract-call? .blocklist check-pox-addr pox-addr)
    listed (ok listed)
    e ERR_BLOCKLIST_UNAVAILABLE
  )
)

;; Trait form: refuses a list that is not the active setting.
(define-public (check-pox-addr-with (blist <blocklist-trait>) (pox-addr {
  version: (buff 1),
  hashbytes: (buff 32),
}))
  (begin
    (try! (assert-list blist))
    (match (contract-call? blist check-pox-addr pox-addr)
      listed (ok listed)
      e ERR_BLOCKLIST_UNAVAILABLE
    )
  )
)

;; Principal listed, or stored payout address listed.
(define-read-only (check-staker (staker principal))
  (if (try! (check-principal staker))
    (ok true)
    (match (map-get? payout-configs staker)
      config (check-pox-addr (get pox-addr config))
      (ok false)
    )
  )
)

(define-read-only (get-cycle-claim-height (reward-cycle uint))
  (map-get? cycle-claim-height reward-cycle)
)

;; Burn height from which anyone may settle / pay out `reward-cycle`:
;; BACKSTOP_DELAY_BLOCKS after the cycle's rewards first became claimable in
;; pox-5 (same start point as the pool-claim window). Fixed per cycle: it
;; does not move when the second-half portion lands, so a public payout
;; window, once open, never closes again.
;; [changed] No longer measured from the pool claim.
(define-read-only (get-cycle-backstop-height (reward-cycle uint))
  ;; Uncached cycle starts: fail closed (not yet) so strangers cannot pass the
  ;; gate on a live chain before `cache-cycle-start` / claim-rewards.
  (let ((start (get-rewards-start-height reward-cycle)))
    (if (is-eq start u0)
      (+ burn-block-height u1)
      (+ start BACKSTOP_DELAY_BLOCKS)
    )
  )
)

(define-read-only (get-payout-unlock-height (staker principal))
  (default-to u0 (map-get? payout-unlock-height staker))
)

;; [added] First burn height at which pox-5 can credit `reward-cycle`.
;; Uses cached cycle starts (see `cache-cycle-start`); no pox-5 call.
(define-read-only (get-rewards-start-height (reward-cycle uint))
  (let (
      (start (default-to u0 (map-get? cycle-start-burn reward-cycle)))
      (next (default-to u0 (map-get? cycle-start-burn (+ reward-cycle u1))))
    )
    (if (or (is-eq start u0) (is-eq next u0))
      u0
      (+ start (/ (- next start) u2))
    )
  )
)

;; [added] Latest claimable boundary for `reward-cycle` (cached; no pox-5).
(define-read-only (get-claim-anchor-height (reward-cycle uint))
  (let (
      (start (default-to u0 (map-get? cycle-start-burn reward-cycle)))
      (next (default-to u0 (map-get? cycle-start-burn (+ reward-cycle u1))))
    )
    (if (or (is-eq start u0) (is-eq next u0))
      u0
      (if (>= burn-block-height next)
        next
        (+ start (/ (- next start) u2))
      )
    )
  )
)

;; [added] Burn height from which ANYONE may call pool-level `claim-rewards`
;; for `reward-cycle` (admins: any time).
(define-read-only (get-claim-backstop-height (reward-cycle uint))
  (let ((anchor (get-claim-anchor-height reward-cycle)))
    (if (is-eq anchor u0)
      (+ burn-block-height u1)
      (+ anchor CLAIM_BACKSTOP_BLOCKS)
    )
  )
)

;; [changed 2026-10-09g] Base fee is fixed: the same in every cycle.
(define-read-only (get-fee-bips-in-force (reward-cycle uint))
  MAX_FEE_BIPS
)

(define-read-only (current-cycle)
  (contract-call? 'SP000000000000000000002Q6VF78.pox-5 current-pox-reward-cycle)
)

;; [changed 2026-10-09g] Fixed base fee (= hard cap); never changes.
(define-read-only (get-active-fee-bips)
  MAX_FEE_BIPS
)

;; [added] Fee rate for `staker` at `(reward-cycle, bond-index)`.
;; Size tier uses uSTX locked for THAT reward cycle (pox-5 shares / settle cache),
;; not the latest `staked-ustx-cache`. Before claim-rewards snapshot, base fee
;; falls back to MAX_FEE_BIPS (500).
;; [added 2026-10-10] Discount snapshot per staker+cycle, written at settle (first
;; settle wins; value is final once the cycle has started). Fee calc reads the snapshot
;; first, so a late payout always uses the discount that applied to that cycle.
(define-map discount-snapshot { staker: principal, reward-cycle: uint } uint)
(define-read-only (get-discount-snapshot (staker principal) (reward-cycle uint))
  (map-get? discount-snapshot { staker: staker, reward-cycle: reward-cycle }))
(define-read-only (discount-for (staker principal) (reward-cycle uint))
  (match (map-get? discount-snapshot { staker: staker, reward-cycle: reward-cycle })
    v v
    (contract-call? .fee-discounts get-staker-discount-at staker reward-cycle)))
(define-private (snapshot-discount (staker principal) (reward-cycle uint))
  (if (and (is-eq (var-get discounts-contract) .fee-discounts) (<= reward-cycle (current-cycle)))
    (map-insert discount-snapshot { staker: staker, reward-cycle: reward-cycle }
      (contract-call? .fee-discounts get-staker-discount-at staker reward-cycle))
    false))
;; Anyone may snapshot a started cycle (server primes at cycle start); idempotent.
(define-public (snapshot-staker-discount (staker principal) (reward-cycle uint))
  (ok (snapshot-discount staker reward-cycle)))

(define-read-only (get-staker-fee-bips
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  ;; Static path when still on the deploy-time discounts contract.
  ;; After a switch: RO falls back to the cap; use get-staker-fee-bips-with.
  (if (is-eq (var-get discounts-contract) .fee-discounts)
    (let (
        (settings (contract-call? .fee-discounts get-settings-at reward-cycle))
        (extra (discount-for staker reward-cycle))
        (ustx (locked-ustx-for-cycle staker reward-cycle bond-index))
        (cycles (loyalty-from staker reward-cycle u0))
        (floor (get-floor-bips-at reward-cycle))
      )
      (min-uint MAX_FEE_BIPS
        (compute-fee-bips settings cycles ustx extra floor)
      )
    )
    MAX_FEE_BIPS
  )
)

;; [added] Cheap split path for the site/admin page (no pox-5 read):
;; caller supplies uSTX (from the cache, or a separate get-staked-in-cycle read).
;; Uses the cached cycle-locked amount instead whenever one exists.
(define-read-only (get-staker-fee-bips-for-ustx
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
    (ustx-hint uint)
  )
  (if (is-eq (var-get discounts-contract) .fee-discounts)
    (min-uint MAX_FEE_BIPS
      (compute-fee-bips
        (contract-call? .fee-discounts get-settings-at reward-cycle)
        (loyalty-from staker reward-cycle u0)
        (default-to ustx-hint (get-cached-staked-in-cycle staker reward-cycle bond-index))
        (discount-for staker reward-cycle)
        (get-floor-bips-at reward-cycle)
      )
    )
    MAX_FEE_BIPS
  )
)

;; [added] (some uSTX) if the cycle-locked amount is cached, else none. No pox-5 read.
(define-read-only (get-cached-staked-in-cycle
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (map-get? staked-in-cycle-cache {
    staker: staker,
    reward-cycle: reward-cycle,
    bond-index: bond-index,
  })
)

;; [added] Prime the per-cycle cache (server calls at cycle start). Anyone may call:
;; it only records pox-5's own value, first snapshot wins, and only for a cycle
;; that has already started (its locked amount is final).
(define-public (prime-staked-in-cycle
    (stakers (list 50 principal))
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (begin
    (asserts! (<= reward-cycle (current-cycle)) ERR_PRIME_FUTURE_CYCLE)
    (print { topic: "prime-staked-in-cycle", reward-cycle: reward-cycle, count: (len stakers) })
    (ok (get n (fold prime-one stakers { c: reward-cycle, b: bond-index, n: u0 })))
  )
)

;; Never overwrites (first snapshot wins); stakers with no pool shares cache u0 harmlessly.
(define-private (prime-one
    (staker principal)
    (acc { c: uint, b: (optional uint), n: uint })
  )
  (begin
    (cache-staked-in-cycle staker (get c acc) (get b acc))
    (merge acc { n: (+ (get n acc) u1) })
  )
)

;; Trait form: required after discounts-contract points away from `.fee-discounts`.
;; Public because trait calls are not allowed in read-only functions.
(define-public (get-staker-fee-bips-with
    (discounts <fee-discounts-trait>)
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (begin
    (try! (assert-discounts discounts))
    (let (
        (settings (unwrap! (contract-call? discounts settings-at reward-cycle) ERR_WRONG_INPUT_CONTRACT))
        (extra (unwrap! (contract-call? discounts staker-discount-at staker reward-cycle) ERR_WRONG_INPUT_CONTRACT))
        (ustx (locked-ustx-for-cycle staker reward-cycle bond-index))
        (cycles (loyalty-from staker reward-cycle u0))
        (floor (get-floor-bips-at reward-cycle))
      )
      (ok (min-uint MAX_FEE_BIPS
        (compute-fee-bips settings cycles ustx extra floor)
      ))
    )
  )
)

;; Pure quote (no external calls except optional discounts settings via trait form below).
;; `extra-discount-bips` = off-chain referrals + early-bird combined.
(define-read-only (get-fee-quote
    (cycles uint)
    (staked-ustx uint)
    (extra-discount-bips uint)
  )
  (get-fee-quote-at (current-cycle-cached) cycles staked-ustx extra-discount-bips)
)

(define-read-only (get-fee-quote-at
    (cycle uint)
    (cycles uint)
    (staked-ustx uint)
    (extra-discount-bips uint)
  )
  (min-uint MAX_FEE_BIPS
    (compute-fee-bips
      (contract-call? .fee-discounts get-settings-at cycle)
      cycles staked-ustx extra-discount-bips (get-floor-bips-at cycle)
    )
  )
)

(define-public (get-fee-quote-with
    (discounts <fee-discounts-trait>)
    (cycle uint)
    (cycles uint)
    (staked-ustx uint)
    (extra-discount-bips uint)
  )
  (begin
    (try! (assert-discounts discounts))
    (ok (min-uint MAX_FEE_BIPS
      (compute-fee-bips
        (unwrap! (contract-call? discounts settings-at cycle) ERR_WRONG_INPUT_CONTRACT)
        cycles staked-ustx extra-discount-bips (get-floor-bips-at cycle)
      )
    ))
  )
)

;; effective = max(floor, ladder - size - extra), already capped by caller to 500.
(define-read-only (compute-fee-bips
    (s {
      step2-cycles: uint,
      step3-cycles: uint,
      step4-cycles: uint,
      step1-bips: uint,
      step2-bips: uint,
      step3-bips: uint,
      step4-bips: uint,
      size1-ustx: uint,
      size1-bips: uint,
      size2-ustx: uint,
      size2-bips: uint,
    })
    (cycles uint)
    (staked-ustx uint)
    (extra-discount-bips uint)
    (floor uint)
  )
  (let (
      (ladder (if (>= cycles (get step4-cycles s))
        (get step4-bips s)
        (if (>= cycles (get step3-cycles s))
          (get step3-bips s)
          (if (>= cycles (get step2-cycles s))
            (get step2-bips s)
            (get step1-bips s)
          )
        )
      ))
      (size (if (>= staked-ustx (get size2-ustx s))
        (get size2-bips s)
        (if (>= staked-ustx (get size1-ustx s))
          (get size1-bips s)
          u0
        )
      ))
      (discount (+ size extra-discount-bips))
      (raw (if (> ladder discount) (- ladder discount) u0))
    )
    (max-uint floor raw)
  )
)

;; [added] Consecutive cycles in this pool as of `reward-cycle` (>= 1).
(define-read-only (get-loyalty-cycles
    (staker principal)
    (reward-cycle uint)
  )
  (loyalty-from staker reward-cycle u0)
)

(define-read-only (loyalty-from
    (staker principal)
    (reward-cycle uint)
    (position-start uint)
  )
  (let (
      (rec (default-to {
        join-cycle: reward-cycle,
        end-cycle: u0,
        prev-join-cycle: reward-cycle,
      }
        (map-get? staker-join staker)
      ))
      (recorded (get join-cycle rec))
      (current-run (max-uint recorded position-start))
      (join (if (>= reward-cycle current-run)
        current-run
        (if (>= reward-cycle recorded)
          recorded
          (get prev-join-cycle rec)
        )
      ))
    )
    (if (>= reward-cycle join)
      (+ (- reward-cycle join) u1)
      u1
    )
  )
)

(define-read-only (get-staked-ustx (staker principal))
  (default-to u0 (map-get? staked-ustx-cache staker))
)

(define-read-only (get-staker-join (staker principal))
  (map-get? staker-join staker)
)

;; [added] uSTX the staker had staked with this pool in `reward-cycle`
;; (pox-5 STX shares are uSTX). Pass `bond-index` when quoting a bond bucket.
(define-read-only (get-staked-in-cycle
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (contract-call? 'SP000000000000000000002Q6VF78.pox-5
    get-staker-shares-staked-for-cycle staker reward-cycle bond-index current-contract
  )
)

;; Prefer the settle-time cache; otherwise ask pox-5 for the cycle-locked amount.
(define-read-only (locked-ustx-for-cycle
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (match (map-get? staked-in-cycle-cache {
      staker: staker,
      reward-cycle: reward-cycle,
      bond-index: bond-index,
    })
    cached cached
    (get-staked-in-cycle staker reward-cycle bond-index)
  )
)

;; Write path: snapshot the cycle-locked amount (call before fee calc at settle).
(define-private (cache-staked-in-cycle
    (staker principal)
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (let (
      (amt (locked-ustx-for-cycle staker reward-cycle bond-index))
    )
    (map-insert staked-in-cycle-cache {
        staker: staker,
        reward-cycle: reward-cycle,
        bond-index: bond-index,
      }
      amt
    )
    (locked-ustx-for-cycle staker reward-cycle bond-index)
  )
)

;; [added] (ok none) if clear; (ok (some h)) if the principal or its stored
;; payout address is listed, h = burn height it was added (u0 = pre-loaded).
(define-read-only (staker-blocked-since (who principal))
  (match (contract-call? .blocklist principal-blocked-since who)
    p (if (is-some p)
      (ok p)
      (match (map-get? payout-configs who)
        config (contract-call? .blocklist pox-addr-blocked-since (get pox-addr config))
        (ok none)
      )
    )
    e (err e)
  )
)

(define-read-only (max-uint
    (a uint)
    (b uint)
  )
  (if (> a b)
    a
    b
  )
)

(define-read-only (get-fee-bips-for-cycle
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  ;; [changed] Fall back to the base/cap (500) before claim-rewards snapshots.
  (default-to MAX_FEE_BIPS
    (map-get? fee-bips-for-cycle {
      reward-cycle: reward-cycle,
      bond-index: bond-index,
    })
  )
)

(define-read-only (get-earned-fees)
  (var-get earned-fees)
)

(define-read-only (get-withdrawal-liability)
  (var-get withdrawal-liability)
)

(define-read-only (get-unclaimed-staker-rewards)
  (var-get total-unclaimed-rewards)
)

(define-read-only (get-unclaimed-rewards-for-cycle
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (default-to u0
    (map-get? unclaimed-rewards-for-cycle {
      reward-cycle: reward-cycle,
      bond-index: bond-index,
    })
  )
)

(define-read-only (get-payout-config (staker principal))
  (map-get? payout-configs staker)
)

;; Net rewards settled for this staker and awaiting `payout`.
(define-read-only (get-pending-payout (staker principal))
  (default-to u0 (map-get? pending-payouts staker))
)

(define-read-only (get-total-pending-payouts)
  (var-get total-pending-payouts)
)

;; [added] Currently frozen held balance for `staker` (decreases on release).
(define-read-only (get-held-amount (staker principal))
  (default-to u0 (map-get? held-totals staker))
)

;; [added] Gross credited to held for `(staker, reward-cycle)` (credit log).
(define-read-only (get-held-for-cycle
    (staker principal)
    (reward-cycle uint)
  )
  (default-to u0
    (map-get? held-rewards {
      staker: staker,
      reward-cycle: reward-cycle,
    })
  )
)

(define-read-only (get-total-held-rewards)
  (var-get total-held-rewards)
)

(define-read-only (get-pending-release)
  (var-get pending-release)
)

(define-read-only (get-release-delay)
  RELEASE_DELAY_BLOCKS
)

(define-read-only (get-withdrawal-request-staker (withdrawal-request uint))
  (map-get? withdrawal-requests withdrawal-request)
)

;; sBTC held by this contract that is not spoken for by fees, live
;; withdrawals, unclaimed staker rewards, or credited refunds.
(define-read-only (unattributed-balance)
  (let (
      (balance (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        get-balance current-contract
      )))
      ;; [changed] Also reserve held ledger (listed-at-settle rewards).
      ;; Sweep may only take leftover withdrawal-fee dust / mistaken sends --
      ;; never unclaimed rewards, pending payouts, or held funds.
      (reserved (+ (var-get earned-fees) (var-get withdrawal-liability)
        (var-get total-unclaimed-rewards) (var-get total-pending-payouts)
        (var-get total-held-rewards)
      ))
    )
    (if (>= balance reserved)
      (- balance reserved)
      u0
    )
  )
)

;; The `min-claim` given to a staker whose calldata does not carry one --
;; i.e. v1-shaped calldata. This is the lowest value `check-payout-config`
;; accepts, so it gates nothing that could actually have been paid out: below
;; it, an L1 payout would fail the sBTC dust limit anyway. That reproduces v1's
;; behaviour exactly, since v1 had no third-party floor at all. A staker who
;; wants a real floor sets one with `set-payout-config`.
(define-read-only (default-min-claim (max-fee uint))
  (+ max-fee DUST_LIMIT u1)
)

;; Deserialize payout calldata, accepting both this contract's shape and v1's.
;;
;; v1's `signer-manager` took `{ pox-addr, max-fee }`; v2 adds `min-claim`.
;; `from-consensus-buff?` requires an exact type match, so without this a
;; staker rolling over from a v1 signer -- or any client still building v1
;; calldata -- would have their `stake` rejected outright with
;; ERR_INVALID_CALLDATA. v1 calldata is accepted and given `default-min-claim`.
;;
;; The two shapes cannot be confused: a two-field tuple never deserializes as
;; the three-field type, or the reverse.
(define-read-only (parse-payout-calldata (calldata (buff 500)))
  (match (from-consensus-buff? {
    pox-addr: {
      version: (buff 1),
      hashbytes: (buff 32),
    },
    max-fee: uint,
    min-claim: uint,
  }
    calldata
  )
    config (some config)
    (match (from-consensus-buff? {
      pox-addr: {
        version: (buff 1),
        hashbytes: (buff 32),
      },
      max-fee: uint,
    }
      calldata
    )
      legacy (some (merge legacy { min-claim: (default-min-claim (get max-fee legacy)) }))
      none
    )
  )
)

;; Validate an L1 payout config.
;;
;; The pox-addr rules are sBTC's, not ours: delegate to
;; `.sbtc-withdrawal validate-recipient` rather than reimplementing them, so
;; the two can never drift and leave a staker with an address this contract
;; accepts but the withdrawal path rejects.
;;
;; `min-claim` must exceed `max-fee + DUST_LIMIT` so that any claim which
;; clears the floor also clears the sBTC dust limit.
(define-read-only (check-payout-config (config {
  pox-addr: {
    version: (buff 1),
    hashbytes: (buff 32),
  },
  max-fee: uint,
  min-claim: uint,
}))
  (begin
    (asserts!
      (is-ok (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-withdrawal
        validate-recipient (get pox-addr config)
      ))
      ERR_INVALID_POX_ADDR
    )
    ;; [added] A listed address can never become a payout address.
    (asserts! (not (try! (check-pox-addr (get pox-addr config)))) ERR_BLOCKED)
    (asserts! (> (get min-claim config) (+ (get max-fee config) DUST_LIMIT))
      ERR_INVALID_MIN_CLAIM
    )
    (ok true)
  )
)

(define-read-only (min-uint
    (a uint)
    (b uint)
  )
  (if (< a b)
    a
    b
  )
)
