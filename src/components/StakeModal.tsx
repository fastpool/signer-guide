import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getLocalStorage, request } from '@stacks/connect';
import {
  addressToString,
  PayloadType,
  type ClarityValue,
  type ContractIdString,
  type PostCondition,
  type StacksTransactionWire,
} from '@stacks/transactions';
import { exactStxLabel } from '../lib/amounts';
import { explorerUrl } from '../lib/explorer';
import { translator, type Locale, type Translator } from '../lib/i18n';
import {
  buildPayoutCalldata,
  defaultMinClaimSats,
  cyclesRemaining,
  extendRange,
  fetchCycleState,
  fetchPayoutRecord,
  fetchStakedPosition,
  isValidLockCycles,
  isValidMinClaim,
  lockDuration,
  MAX_LOCK_CYCLES,
  minClaimFloorSats,
  stakePostConditions,
  stakeUpdatePostConditions,
  unstakePostConditions,
  type PayoutRecord,
  type StakedPosition,
} from '../lib/staking';
import { ellipsedAddr } from '../lib/strings';
import { watchTxStatus, type TxStatus } from '../lib/tx-status';
import type { Signer } from '../lib/types';
import {
  forgetWallet,
  initWalletConnect,
  requestAddresses,
  walletOptions,
} from '../lib/wallet-connect';
import {
  clearWalletSession,
  isStacksAddress,
  sessionFromAddresses,
  setWalletSession,
  useWalletSession,
  type WalletAddress,
  type WalletSession,
} from '../lib/wallet-session';

const STACKS_API_URL =
  typeof import.meta.env.VITE_STACKS_API_URL === 'string' &&
  import.meta.env.VITE_STACKS_API_URL.length > 0
    ? import.meta.env.VITE_STACKS_API_URL
    : 'https://api.hiro.so';

const ONE_STX_USTX = 1_000_000n;

export function parseStxToUstx(amount: string): bigint | null {
  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '000000').slice(0, 6);
  return BigInt(whole) * ONE_STX_USTX + BigInt(fracPadded);
}

export function formatUstxAsStx(ustx: bigint): string {
  const whole = ustx / ONE_STX_USTX;
  const frac = (ustx % ONE_STX_USTX)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
}

export function spendableFromBalance(
  balanceUstx: bigint | null,
): bigint | null {
  if (balanceUstx === null) return null;
  return balanceUstx > ONE_STX_USTX ? balanceUstx - ONE_STX_USTX : 0n;
}

/**
 * What is actually free to lock: the balance less whatever is locked already.
 *
 * `balance` in this endpoint is everything the account holds, locked STX
 * included, and locked STX cannot be locked again. Offering it as available
 * is how somebody who has just unstaked is shown their whole position as
 * spendable and told by the chain that they do not have it.
 */
export function unlockedFromBalances(
  balanceUstx: bigint,
  lockedUstx: bigint,
): bigint {
  return balanceUstx > lockedUstx ? balanceUstx - lockedUstx : 0n;
}

/** "fastpool-1-signer-manager" → "Fastpool 1 Signer Manager". */
export function signerNameFromContractId(contractId: string): string {
  const [, contractName = contractId] = contractId.split('.');
  return contractName
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function fetchBalanceUstx(
  address: string,
  t: Translator,
): Promise<bigint> {
  const res = await fetch(
    `${STACKS_API_URL}/extended/v1/address/${address}/balances`,
  );
  if (!res.ok) {
    throw new Error(t('stake.error.balanceLookup', { status: res.status }));
  }
  const data = (await res.json()) as {
    stx?: { balance?: string; locked?: string };
  };
  const balance = data.stx?.balance;
  if (!balance || !/^\d+$/.test(balance)) {
    throw new Error(t('stake.error.balanceRead'));
  }
  const locked = data.stx?.locked;
  return unlockedFromBalances(
    BigInt(balance),
    locked && /^\d+$/.test(locked) ? BigInt(locked) : 0n,
  );
}

/** The STX address localStorage remembers, which never carries a public key. */
function cachedStxAddress(): string | null {
  try {
    const cached = getLocalStorage();
    const stx = cached?.addresses.stx ?? [];
    return stx.find((entry) => isStacksAddress(entry.address))?.address ?? null;
  } catch {
    return null;
  }
}

/** Enough to get a payout out in most fee conditions, and no more. */
const DEFAULT_MAX_FEE_SATS = '3000';

/**
 * The lock periods worth one tap: this cycle only, half a year, a year, and
 * the longest the contract takes. Anything else is typed in the box beside
 * them.
 */
const CYCLE_PRESETS = [1, 12, 26, MAX_LOCK_CYCLES];

/**
 * The call inside a transaction the staking package built.
 *
 * The package builds whole transactions; the wallet, through connect, wants
 * the call and builds — and broadcasts — the transaction itself. Reading the
 * call back out keeps the arguments the package's business, which is where
 * argument order and calldata encoding belong, and leaves nonce, fee, signing
 * and broadcast to the wallet, which is where those belong.
 */
function contractCallFrom(tx: StacksTransactionWire): {
  contract: ContractIdString;
  functionName: string;
  functionArgs: ClarityValue[];
} {
  const payload = tx.payload;
  if (payload.payloadType !== PayloadType.ContractCall) {
    throw new Error('Expected a contract call from the staking package');
  }
  return {
    contract: `${addressToString(payload.contractAddress)}.${payload.contractName.content}`,
    functionName: payload.functionName.content,
    functionArgs: payload.functionArgs,
  };
}

/**
 * Why the contract would refuse a call, in its own words.
 *
 * The descriptions come from the package rather than the language files, so
 * they arrive in English whatever the page is set to — better than a bare
 * error code, and better than a guess at which gate closed.
 */
function reasonList(
  reasons: readonly number[],
  describe: (code: number) => { description: string } | undefined,
): string {
  return reasons
    .map((code) => describe(code)?.description ?? `pox-5 error ${code}`)
    .join(' ');
}

const CARD = 'rounded-2xl bg-cream p-4';
const FIELD =
  'w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm';

/**
 * One of the two reward destinations.
 *
 * `now` marks the one already in force, so the reader can see at a glance
 * whether they are about to change anything.
 */
function RewardOption({
  name,
  checked,
  onSelect,
  title,
  help,
  now,
  nowLabel,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  help: string;
  now: boolean;
  nowLabel: string;
}) {
  return (
    <label
      className={`flex gap-3 rounded-xl border p-3 ${
        checked ? 'border-grape bg-grape-soft/40' : 'border-black/10'
      }`}
    >
      <input
        type='radio'
        name={name}
        checked={checked}
        onChange={onSelect}
        className='mt-1'
      />
      <span>
        <span className='block text-sm font-semibold'>
          {title}
          {now && (
            <span className='ml-2 rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint'>
              {nowLabel}
            </span>
          )}
        </span>
        <span className='block text-xs text-muted'>{help}</span>
      </span>
    </label>
  );
}

/** A heading for one step of the form, so the dialog reads as a sequence. */
function Step({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='mt-5'>
      <h5 className='text-sm font-bold text-ink'>{title}</h5>
      {children}
    </div>
  );
}

export default function StakeModal({
  signer,
  locale,
}: {
  signer: Signer;
  locale: Locale;
}) {
  const t = translator(locale);
  const titleId = useId();
  const rewardsName = useId();

  const session = useWalletSession();
  const [open, setOpen] = useState(false);
  /** Known from localStorage but with no public key behind it yet. */
  const [cachedAddress, setCachedAddress] = useState<string | null>(null);
  const [position, setPosition] = useState<StakedPosition | null>(null);
  /** What this pool holds for this staker, and which calldata it speaks. */
  const [payout, setPayout] = useState<PayoutRecord | null>(null);
  const [balanceUstx, setBalanceUstx] = useState<bigint | null>(null);
  const [amountStx, setAmountStx] = useState('');
  /**
   * How long a first stake locks for, as typed. A string rather than a number
   * so the field can be empty while somebody is halfway through changing it.
   */
  const [cyclesInput, setCyclesInput] = useState('1');
  /**
   * How many cycles an update adds. Null until touched, meaning "whatever the
   * contract insists on and no more" — which for most positions is none.
   */
  const [extendInput, setExtendInput] = useState<string | null>(null);
  /*
   * The reward fields are deliberately not state until the reader touches
   * them: null means "whatever the chain says". Holding a copy of the chain's
   * answer in state is how the summary above the toggle and the toggle itself
   * came to disagree — one was set from a fetch, the other kept its default.
   */
  const [rewardChoice, setRewardChoice] = useState<'bitcoin' | 'sbtc' | null>(
    null,
  );
  const [btcAddressInput, setBtcAddressInput] = useState<string | null>(null);
  const [maxFeeInput, setMaxFeeInput] = useState<string | null>(null);
  const [minClaimInput, setMinClaimInput] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Stopping a stake is a step apart from the form, and asks twice. */
  const [confirmUnstake, setConfirmUnstake] = useState(false);
  /** Where the chain is in its cycle; null until the lookup answers. */
  const [cycle, setCycle] = useState<{
    rewardCycleId: number;
    inPreparePhase: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The transaction the wallet broadcast, once there is one. */
  const [result, setResult] = useState<{ txid: string } | null>(null);
  /** What the chain has made of it since. */
  const [txStatus, setTxStatus] = useState<TxStatus>('pending');
  /**
   * Bumped on every reconnect, so reconnecting to the account already shown
   * reloads its balance instead of leaving the cleared fields empty.
   */
  const [reloadNonce, setReloadNonce] = useState(0);

  const walletAddress = session?.stxAddress ?? cachedAddress;
  const canToggleBtc = signer.bitcoinRewards;

  /**
   * Bumped whenever the account changes, so a slow lookup for the account the
   * user has just switched away from cannot overwrite the new one.
   */
  const loadId = useRef(0);

  const spendableUstx = useMemo(
    () => spendableFromBalance(balanceUstx),
    [balanceUstx],
  );

  const stakingHere = position?.signer === signer.contractId;
  const currentPoolName = position
    ? stakingHere
      ? signer.displayName
      : signerNameFromContractId(position.signer)
    : null;

  /**
   * The Bitcoin payout on file — this pool's if it has one, otherwise the one
   * the staker has with whichever pool they are in, so moving pools carries
   * the choice over rather than silently dropping it.
   */
  const recorded =
    (payout?.route.kind === 'bitcoin' ? payout.route : null) ??
    (position?.payout?.route.kind === 'bitcoin' ? position.payout.route : null);

  /** Derived, never stored: it cannot fall out of step with what is above it. */
  const receiveBtc =
    (rewardChoice ?? (recorded ? 'bitcoin' : 'sbtc')) === 'bitcoin';
  const btcAddress =
    btcAddressInput ?? recorded?.address ?? session?.btcAddress ?? '';
  const maxFeeSats =
    maxFeeInput ?? recorded?.maxFeeSats.toString() ?? DEFAULT_MAX_FEE_SATS;

  /** Only the newer calldata carries a floor; the older one has no field for it. */
  const supportsMinClaim = payout?.shape === 'payout-config';
  const parsedMaxFee = /^\d+$/.test(maxFeeSats.trim())
    ? BigInt(maxFeeSats.trim())
    : null;
  const minClaimSats =
    minClaimInput ??
    recorded?.minClaimSats?.toString() ??
    (parsedMaxFee === null ? '' : defaultMinClaimSats(parsedMaxFee).toString());

  /** Staking with sBTC selected deletes the payout entry the pool holds. */
  const stopsBitcoinPayouts = recorded !== null && !receiveBtc;
  const replacesBtcAddress =
    recorded !== null &&
    receiveBtc &&
    btcAddress.trim().length > 0 &&
    btcAddress.trim() !== recorded.address;

  /** Whether pressing the button would hand the pool a different payout. */
  const changesPayout = receiveBtc
    ? recorded === null ||
      replacesBtcAddress ||
      maxFeeSats.trim() !== recorded.maxFeeSats.toString() ||
      (supportsMinClaim &&
        minClaimSats.trim() !== (recorded.minClaimSats?.toString() ?? ''))
    : recorded !== null;

  /**
   * Moving an existing stake to this pool, which pox-5 does as a `stake-update`
   * with a new signer manager and — for somebody who is only moving — nothing
   * else. That is the whole point of allowing an empty amount below.
   */
  const rotating = position !== null && !stakingHere;

  /** The cycle count as a number, or null while it is not one yet. */
  const numCycles = /^\d+$/.test(cyclesInput.trim())
    ? Number(cyclesInput.trim())
    : null;

  /** Empty means zero once there is a position to update: a move, no top-up. */
  const amountUstx =
    position !== null && amountStx.trim() === ''
      ? 0n
      : parseStxToUstx(amountStx);

  /** Cycles the position has after this one; null until the clock is known. */
  const remaining =
    position !== null && cycle !== null
      ? cyclesRemaining({ position, currentCycle: cycle.rewardCycleId })
      : null;

  /**
   * What an update may add. The floor is not a preference: a position in its
   * final cycle has no lock period left for the contract to assert on, so a
   * move has to carry it one cycle further or be refused.
   */
  const range = remaining === null ? null : extendRange(remaining);
  const extendCycles = range?.min ?? 0;

  /** What the staker is actually asking for, the floor until they say more. */
  const askedExtend =
    extendInput === null
      ? extendCycles
      : /^\d+$/.test(extendInput.trim())
        ? Number(extendInput.trim())
        : null;

  /** Cycles the position would run for in all, once this update lands. */
  const extendedTotal =
    remaining === null || askedExtend === null ? null : remaining + askedExtend;

  /**
   * One tap each for: what the contract insists on, the usual periods that
   * still fit, and the longest this position can reach. Anything between them
   * is typed.
   */
  const extendPresets =
    range === null
      ? []
      : [...new Set([range.min, ...CYCLE_PRESETS, range.max])]
          .filter((preset) => preset >= range.min && preset <= range.max)
          .sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /** Follows the broadcast transaction until the chain has decided. */
  useEffect(() => {
    const txid = result?.txid;
    if (!txid) return;
    setTxStatus('pending');
    return watchTxStatus({
      txid,
      apiUrl: STACKS_API_URL,
      onStatus: (status) => {
        setTxStatus(status);
        // The position, the balance and the payout are all now something else
        // than what the dialog is showing — most of all after an unstake,
        // which leaves a position that ends with this cycle.
        if (status === 'success') setReloadNonce((n) => n + 1);
      },
    });
  }, [result?.txid]);

  /**
   * What the dialog can show without asking the wallet anything: the address
   * from this visit's session if there is one, otherwise the one localStorage
   * remembers. Neither opens a wallet popup.
   */
  useEffect(() => {
    if (!open || session || cachedAddress) return;
    setCachedAddress(cachedStxAddress());
  }, [open, session, cachedAddress]);

  /** Balance, and the stake already in place, for whichever address is shown. */
  useEffect(() => {
    if (!open || !walletAddress) return;

    const id = ++loadId.current;
    const load = async () => {
      setLoading(true);
      try {
        const staked = await fetchStakedPosition({ address: walletAddress });
        if (id !== loadId.current) return;
        setPosition(staked);

        // This pool's own record, which is what staking here would replace.
        // Reading it also names the calldata shape, so it is worth doing for
        // somebody with no Bitcoin address on file yet.
        if (signer.bitcoinRewards) {
          const here =
            staked?.signer === signer.contractId
              ? staked.payout
              : await fetchPayoutRecord({
                  staker: walletAddress,
                  signer: signer.contractId,
                });
          if (id !== loadId.current) return;
          setPayout(here);
        }

        // Both rules that depend on the clock: whether a change is refused
        // outright right now, and whether moving has to extend the lock.
        const cycleState = await fetchCycleState();
        if (id !== loadId.current) return;
        setCycle(cycleState);

        const balance = await fetchBalanceUstx(walletAddress, t);
        if (id !== loadId.current) return;
        setBalanceUstx(balance);
        // Somebody who already stakes is most likely here to move pools or
        // change where rewards go, not to lock everything they own — so the
        // field starts empty for them and the whole balance is a click away.
        setAmountStx(
          staked ? '' : formatUstxAsStx(spendableFromBalance(balance) ?? 0n),
        );
      } catch (err) {
        // Not fatal: the user can still connect, or type an amount by hand.
        if (id === loadId.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (id === loadId.current) setLoading(false);
      }
    };

    void load();
  }, [
    open,
    walletAddress,
    reloadNonce,
    signer.bitcoinRewards,
    signer.contractId,
    t,
  ]);

  /** Everything read for the previous account, dropped before the new one loads. */
  const forgetAccount = () => {
    loadId.current += 1;
    setCachedAddress(null);
    setPosition(null);
    setPayout(null);
    setBalanceUstx(null);
    setAmountStx('');
    setConfirmUnstake(false);
    // The reward fields go back to following the chain, so the new account's
    // own record decides rather than the previous account's answers.
    setRewardChoice(null);
    setBtcAddressInput(null);
    setMaxFeeInput(null);
    setMinClaimInput(null);
    setError(null);
    setResult(null);
    setReloadNonce((n) => n + 1);
  };

  /**
   * The only call that shows the wallet picker. It is also the only place the
   * public key is obtained, and it goes straight into the session so that
   * pressing Stake afterwards costs one signature prompt and nothing else.
   */
  const openWallet = async (): Promise<WalletSession> => {
    clearWalletSession();
    // Not clearLocalStorage: that leaves the WalletConnect session live and
    // the chosen wallet remembered, so the picker never reopens.
    forgetWallet();
    // On a phone the wallet is another app, not an extension in this page, so
    // the WalletConnect route has to exist before the picker opens.
    await initWalletConnect();

    let addresses: WalletAddress[];
    try {
      addresses = await requestAddresses();
    } catch (err) {
      // A half-finished connect can still have written addresses to storage,
      // which would leave the page looking connected to a wallet that never
      // answered. Put it back to knowing nothing.
      forgetWallet();
      throw err;
    }

    const next = sessionFromAddresses(addresses as WalletAddress[]);
    if (!next) {
      forgetWallet();
      throw new Error(
        addresses.length === 0
          ? t('stake.error.noStxAddress')
          : t('stake.error.noPublicKey'),
      );
    }
    setWalletSession(next);
    return next;
  };

  const connectWallet = async () => {
    forgetAccount();
    try {
      await openWallet();
    } catch (err) {
      // Whatever went wrong, the wallet is now forgotten — so the button
      // below says "Connect wallet" again and pressing it really does reopen
      // the picker, rather than silently reusing the session that just failed.
      setCachedAddress(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /** An explicit way out, for when a wallet connects but cannot be used. */
  const disconnectWallet = () => {
    forgetAccount();
    clearWalletSession();
    forgetWallet();
  };

  const onUseMax = () => {
    if (spendableUstx === null) return;
    setAmountStx(formatUstxAsStx(spendableUstx));
  };

  /**
   * Hands the call to the wallet, which builds, signs and broadcasts it.
   *
   * `stx_callContract` is the method wallets broadcast from. Asking one to
   * sign a finished transaction instead is a request to sign and nothing more
   * — Leather hands the signed bytes back and sends nothing — which left a
   * staker approving a transaction that never reached the chain, and being
   * told it had been sent.
   */
  const sendCall = async (
    tx: StacksTransactionWire,
    postConditions: PostCondition[],
  ): Promise<string> => {
    // Same options as the connect above, so the wallet asked is the one the
    // reader actually picked rather than a second one.
    const response = (await request(walletOptions(), 'stx_callContract', {
      ...contractCallFrom(tx),
      /*
       * connect serializes these itself, but only for the kinds it knows by
       * name: before 8.2.7 its list held the STX, fungible and non-fungible
       * kinds only, and the two SIP-044 kinds these calls need went to the
       * Clarity serializer instead — "Unable to serialize. Invalid Clarity
       * Value.", on every stake and every unstake. Hence the floor on the
       * dependency; there is nothing to work around above it.
       */
      postConditions,
      postConditionMode: 'deny',
      network: 'mainnet',
    })) as { txid?: string };

    if (!response?.txid) throw new Error(t('stake.error.notBroadcast'));
    return response.txid;
  };

  const onStake = async () => {
    setError(null);
    setResult(null);

    if (amountUstx === null || amountUstx < 0n) {
      setError(t('stake.error.amount'));
      return;
    }

    // A first stake has to lock something. An update does not: moving pools,
    // or changing where rewards go, is a change in its own right.
    if (position === null && amountUstx === 0n) {
      setError(t('stake.error.amount'));
      return;
    }

    // Extending is a change like any other — and for a position in its last
    // cycle it is the one that keeps the stake alive, so an empty amount and
    // the same pool is a perfectly good reason to press the button.
    if (
      amountUstx === 0n &&
      !rotating &&
      !changesPayout &&
      (askedExtend === null || askedExtend === 0)
    ) {
      setError(t('stake.error.nothingToChange'));
      return;
    }

    if (spendableUstx !== null && amountUstx > spendableUstx) {
      setError(t('stake.error.tooMuch'));
      return;
    }

    // Only a first stake names its own lock period; an update's is worked out
    // from what is left of the position it is updating.
    if (
      position === null &&
      (numCycles === null || !isValidLockCycles(numCycles))
    ) {
      setError(t('stake.error.cycles', { max: MAX_LOCK_CYCLES }));
      return;
    }

    const rewardBtcAddress = receiveBtc ? btcAddress.trim() : '';
    if (receiveBtc && !rewardBtcAddress) {
      setError(t('stake.error.btcAddress'));
      return;
    }

    if (receiveBtc && parsedMaxFee === null) {
      setError(t('stake.error.maxFee'));
      return;
    }

    // The contract refuses a floor that a payout could not clear after the fee
    // and the dust limit, so it is worth catching here rather than as a failed
    // transaction the staker has already paid for.
    const minClaim =
      receiveBtc && supportsMinClaim && /^\d+$/.test(minClaimSats.trim())
        ? BigInt(minClaimSats.trim())
        : null;
    if (receiveBtc && supportsMinClaim && parsedMaxFee !== null) {
      if (minClaim === null || !isValidMinClaim(minClaim, parsedMaxFee)) {
        setError(
          t('stake.error.minClaim', {
            min: minClaimFloorSats(parsedMaxFee).toLocaleString(
              t.bundle.intlLocale,
            ),
          }),
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      // Already connected this visit: the public key is in memory, so the only
      // wallet interaction left is signing. Otherwise connect once, here.
      const active = session ?? (await openWallet());

      const {
        buildStake,
        buildStakeUpdate,
        describePox5Error,
        fetchEligibleStakeUpdate,
        fetchPoxInfo,
        fetchStakerInfo,
      } = await import('@stacks/bitcoin-staking');

      /*
       * Read the position again rather than trusting the one the dialog opened
       * with. An unstake rewrites `num-cycles` to end the position at the
       * close of this cycle — the very number the contract checks here — so a
       * copy read before it asks for a lock period the chain then refuses.
       */
      const [poxInfo, staker] = await Promise.all([
        fetchPoxInfo({ network: 'mainnet' }),
        fetchStakerInfo({ address: active.stxAddress, network: 'mainnet' }),
      ]);

      const signerCalldata =
        receiveBtc && parsedMaxFee !== null
          ? await buildPayoutCalldata({
              shape: payout?.shape ?? 'pox-addr',
              btcAddress: rewardBtcAddress,
              maxFeeSats: parsedMaxFee,
              minClaimSats: minClaim ?? undefined,
            })
          : undefined;

      /*
       * The wallet fills in the nonce and the fee and then signs, so the
       * numbers below are placeholders that keep the package from looking
       * either up. Only the call inside this transaction is used.
       */
      const unsigned = { publicKey: active.publicKey, nonce: 0, fee: 0 };

      let tx;
      let postConditions;
      if (staker.staked) {
        /*
         * The range against the position as it is now, not as the dialog read
         * it: a cycle turning while the form was open moves both ends. Asking
         * for less than the floor is not a refusal to extend, it is a position
         * that cannot be updated without one more cycle — the same cycle the
         * dialog offers by default. Asking for more than the ceiling is a
         * lock the contract would refuse, so it is said rather than trimmed.
         */
        const freshRange = extendRange(
          cyclesRemaining({
            position: staker.details,
            currentCycle: poxInfo.rewardCycleId,
          }),
        );
        if (askedExtend === null || askedExtend > freshRange.max) {
          setError(
            t('stake.error.extend', {
              min: freshRange.min,
              max: freshRange.max,
            }),
          );
          return;
        }
        const cyclesToExtend = Math.max(askedExtend, freshRange.min);

        // Every gate the contract applies to this call, replayed read-only.
        // The alternative is a staker paying a fee to be told no.
        const eligible = await fetchEligibleStakeUpdate({
          staker: active.stxAddress,
          signerManager: signer.contractId,
          oldSignerManager: staker.details.signer,
          cyclesToExtend,
          amountIncrease: amountUstx,
          poxInfo,
          network: 'mainnet',
        });
        if (!eligible.ok) {
          setError(
            t('stake.error.refused', {
              reasons: reasonList(eligible.reasons, describePox5Error),
            }),
          );
          return;
        }

        tx = await buildStakeUpdate({
          signerManager: signer.contractId,
          oldSignerManager: staker.details.signer,
          cyclesToExtend,
          amountIncrease: amountUstx,
          signerCalldata,
          network: 'mainnet',
          ...unsigned,
        });
        postConditions = stakeUpdatePostConditions(
          active.stxAddress,
          staker.details.amountUstx + amountUstx,
        );
      } else {
        // The dialog allows an empty amount for a position that turns out to
        // have unlocked in the meantime; a first stake has to lock something.
        if (amountUstx === 0n) {
          setError(t('stake.error.amount'));
          return;
        }

        // Checked above for the path that gets here; a position that unlocked
        // between opening the dialog and pressing the button takes this one
        // too, and one cycle is what it was locked for before.
        tx = await buildStake({
          signerManager: signer.contractId,
          amountUstx,
          numCycles:
            numCycles !== null && isValidLockCycles(numCycles) ? numCycles : 1,
          startBurnHt: poxInfo.currentBurnchainBlockHeight + 1,
          signerCalldata,
          network: 'mainnet',
          ...unsigned,
        });
        postConditions = stakePostConditions(active.stxAddress, amountUstx);
      }

      setResult({ txid: await sendCall(tx, postConditions) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Ends the stake at the close of the current cycle. It moves no STX today —
   * the lock simply stops being renewed — so there is no amount to ask for and
   * none to bound in the post conditions.
   */
  const onUnstake = async () => {
    if (!position) return;
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const active = session ?? (await openWallet());

      const {
        buildUnstake,
        describePox5Error,
        fetchEligibleUnstake,
        fetchPoxInfo,
        fetchStakerCustodiedSbtc,
      } = await import('@stacks/bitcoin-staking');

      const poxInfo = await fetchPoxInfo({ network: 'mainnet' });
      const eligible = await fetchEligibleUnstake({
        staker: active.stxAddress,
        oldSignerManager: position.signer,
        poxInfo,
        network: 'mainnet',
      });
      if (!eligible.ok) {
        setError(
          t('stake.error.refused', {
            reasons: reasonList(eligible.reasons, describePox5Error),
          }),
        );
        return;
      }

      // Zero for everybody who staked here — but a staker who also holds a
      // bond gets their sBTC back in the same call, and deny mode refuses an
      // sBTC transfer nothing accounts for.
      const custodiedSbtcSats = await fetchStakerCustodiedSbtc({
        staker: active.stxAddress,
        network: 'mainnet',
      });

      const tx = await buildUnstake({
        oldSignerManager: position.signer,
        network: 'mainnet',
        // Placeholders: the wallet sets the nonce and the fee itself.
        publicKey: active.publicKey,
        nonce: 0,
        fee: 0,
      });

      const txid = await sendCall(
        tx,
        unstakePostConditions({
          staker: active.stxAddress,
          custodiedSbtcSats,
          poxContractId: poxInfo.contractId,
          sbtcContract: poxInfo.sbtcContract,
        }),
      );

      setResult({ txid });
      setConfirmUnstake(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = !position
    ? t('stake.stakeNow')
    : !stakingHere
      ? t('stake.moveStake')
      : amountUstx === 0n && askedExtend !== null && askedExtend > 0
        ? t('stake.extendStake')
        : t('stake.addToStake');

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='rounded-full bg-grape px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-grape/90'
      >
        {t('stake.open')}
      </button>

      {open && (
        <div
          className='fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center'
          role='dialog'
          aria-modal='true'
          aria-labelledby={titleId}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className='my-4 w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl md:my-0 md:max-h-[calc(100vh-3rem)] md:overflow-y-auto'>
            <div className='flex items-start justify-between gap-4'>
              <h4 id={titleId} className='text-xl font-bold'>
                {t('stake.title', { name: signer.displayName })}
              </h4>
              <button
                type='button'
                onClick={() => setOpen(false)}
                className='rounded-full px-2 py-1 text-sm text-muted hover:bg-grape-soft'
              >
                {t('stake.close')}
              </button>
            </div>

            <p className='mt-2 text-sm text-muted'>{t('stake.intro')}</p>

            <div className={`mt-4 ${CARD}`}>
              <div className='flex flex-wrap items-baseline justify-between gap-2'>
                <p className='text-sm font-bold'>{t('stake.wallet')}</p>
                <span className='flex items-center gap-2'>
                  {/* Always reachable once anything is remembered, so a wallet
                      that connects but cannot be used is never a dead end. */}
                  {walletAddress && (
                    <button
                      type='button'
                      onClick={disconnectWallet}
                      className='rounded-full px-2 py-1 text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink'
                    >
                      {t('stake.disconnect')}
                    </button>
                  )}
                  <button
                    type='button'
                    onClick={connectWallet}
                    className='rounded-full bg-grape-soft px-3 py-1 text-xs font-semibold text-grape hover:bg-grape-soft/80'
                  >
                    {loading
                      ? t('stake.checking')
                      : walletAddress
                        ? t('stake.switch')
                        : t('stake.connect')}
                  </button>
                </span>
              </div>
              <p className='mt-1 font-mono text-sm text-ink'>
                {walletAddress ? (
                  <span title={walletAddress}>
                    {ellipsedAddr(walletAddress, 12)}
                  </span>
                ) : (
                  <span className='font-sans text-muted'>
                    {t('stake.walletNone')}
                  </span>
                )}
              </p>
              <p className='mt-1 text-sm text-muted'>
                {spendableUstx === null
                  ? t('stake.availableUnknown')
                  : t('stake.available', {
                      amount: exactStxLabel(spendableUstx, locale),
                    })}
              </p>
            </div>

            {position && (
              <div className='mt-3 rounded-2xl bg-mint-soft p-4 text-sm'>
                <p className='font-bold text-ink'>
                  {t('stake.position.title')}
                </p>
                <p className='mt-1 text-ink'>
                  {t('stake.position.amount', {
                    amount: exactStxLabel(position.amountUstx, locale),
                    pool: currentPoolName ?? position.signer,
                  })}{' '}
                  <span className='text-muted'>
                    {stakingHere
                      ? t('stake.position.thisPool')
                      : t('stake.position.otherPool', {
                          pool: signer.displayName,
                        })}
                  </span>
                </p>
                <p className='mt-1 text-muted'>
                  {t.plural('stake.position.cycles', position.numCycles, {
                    first: position.firstRewardCycle,
                  })}{' '}
                  {t('stake.position.cyclesHint')}
                </p>
                <p className='mt-2 text-ink'>
                  {position.payout === null
                    ? t('stake.position.rewardsUnknown')
                    : position.payout.route.kind === 'sbtc'
                      ? t('stake.position.rewardsSbtc')
                      : t.rich('stake.position.rewardsBitcoin', {
                          // Shortened, with the whole of it a hover away: the
                          // point is that there *is* one and that it is yours.
                          address: (
                            <span
                              className='font-mono'
                              title={position.payout.route.address}
                            >
                              {ellipsedAddr(position.payout.route.address, 16)}
                            </span>
                          ),
                        })}
                </p>
                {position.payout?.route.kind === 'bitcoin' && (
                  <p className='mt-1 text-xs text-muted'>
                    {t('stake.position.maxFee', {
                      sats: position.payout.route.maxFeeSats.toLocaleString(
                        t.bundle.intlLocale,
                      ),
                    })}
                    {position.payout.route.minClaimSats !== null && (
                      <>
                        {' '}
                        {t('stake.position.minClaim', {
                          sats: position.payout.route.minClaimSats.toLocaleString(
                            t.bundle.intlLocale,
                          ),
                        })}
                      </>
                    )}
                  </p>
                )}
                {/*
                 * What the pool holds is above; this is what the person
                 * themselves sent. Usually the same thing said twice, but not
                 * always: a two-field calldata carries no floor, and the pool
                 * puts one in. Worth seeing before staking again.
                 */}
                <p className='mt-2 text-xs text-muted'>
                  {position.userData === null
                    ? t('stake.position.userDataUnknown')
                    : t.rich(
                        position.userData.route.kind === 'sbtc'
                          ? 'stake.position.userDataSbtc'
                          : 'stake.position.userDataBitcoin',
                        {
                          address:
                            position.userData.route.kind === 'bitcoin' ? (
                              <span
                                className='font-mono'
                                title={position.userData.route.address}
                              >
                                {ellipsedAddr(position.userData.route.address, 16)}
                              </span>
                            ) : (
                              ''
                            ),
                          sats:
                            position.userData.route.kind === 'bitcoin'
                              ? position.userData.route.maxFeeSats.toLocaleString(
                                  t.bundle.intlLocale,
                                )
                              : '',
                          tx: (
                            <a
                              className='underline underline-offset-2'
                              href={explorerUrl(position.userData.txId)}
                              target='_blank'
                              rel='noreferrer'
                            >
                              {t(
                                position.userData.functionName === 'stake-update'
                                  ? 'stake.position.userDataUpdateTx'
                                  : 'stake.position.userDataStakeTx',
                              )}
                            </a>
                          ),
                        },
                      )}{' '}
                  {position.userData?.route.kind === 'bitcoin' &&
                    (position.userData.route.minClaimSats === null
                      ? position.payout?.route.kind === 'bitcoin' &&
                        position.payout.route.minClaimSats !== null &&
                        t('stake.position.userDataNoFloor')
                      : t('stake.position.userDataFloor', {
                          sats: position.userData.route.minClaimSats.toLocaleString(
                            t.bundle.intlLocale,
                          ),
                        }))}
                </p>
              </div>
            )}

            <Step
              title={
                position
                  ? t('stake.amountQuestionMore')
                  : t('stake.amountQuestion')
              }
            >
              <div className='mt-2 flex gap-2'>
                <input
                  type='text'
                  inputMode='decimal'
                  value={amountStx}
                  onChange={(e) => setAmountStx(e.target.value)}
                  className={FIELD}
                  placeholder='0'
                  aria-label={
                    position
                      ? t('stake.amountQuestionMore')
                      : t('stake.amountQuestion')
                  }
                />
                <button
                  type='button'
                  onClick={onUseMax}
                  className='shrink-0 rounded-xl bg-grape-soft px-3 py-2 text-sm font-semibold text-grape'
                >
                  {t('stake.max')}
                </button>
              </div>
              {position && (
                <p className='mt-1 text-xs text-muted'>
                  {rotating
                    ? t('stake.amountOptionalMove')
                    : t('stake.amountOptional')}
                </p>
              )}
              <p className='mt-1 text-xs text-muted'>{t('stake.maxHint')}</p>
            </Step>

            {/* A first stake picks its own lock period; an update's comes from
                what is left of the position, so there is nothing to choose. */}
            {!position && (
              <Step title={t('stake.cyclesQuestion')}>
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  {CYCLE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type='button'
                      onClick={() => setCyclesInput(String(preset))}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                        numCycles === preset
                          ? 'bg-grape text-white'
                          : 'bg-grape-soft text-grape'
                      }`}
                    >
                      {t.plural('stake.cyclesCount', preset)}
                    </button>
                  ))}
                  <input
                    type='number'
                    inputMode='numeric'
                    min={1}
                    max={MAX_LOCK_CYCLES}
                    value={cyclesInput}
                    onChange={(e) => setCyclesInput(e.target.value)}
                    className={`w-24 ${FIELD}`}
                    aria-label={t('stake.cyclesQuestion')}
                  />
                </div>
                <p className='mt-1 text-xs text-muted'>
                  {numCycles !== null && isValidLockCycles(numCycles)
                    ? `${t.plural(
                        `stake.cyclesFor.${lockDuration(numCycles).unit}`,
                        lockDuration(numCycles).count,
                      )} ${t('stake.cyclesHint', { max: MAX_LOCK_CYCLES })}`
                    : t('stake.cyclesHint', { max: MAX_LOCK_CYCLES })}
                </p>
              </Step>
            )}

            {/* The same question for a position, asked the other way round:
                not how long in all, but how much longer than it has. */}
            {position && range !== null && range.max > 0 && (
              <Step title={t('stake.extendQuestion')}>
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  {extendPresets.map((preset) => (
                    <button
                      key={preset}
                      type='button'
                      onClick={() => setExtendInput(String(preset))}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                        askedExtend === preset
                          ? 'bg-grape text-white'
                          : 'bg-grape-soft text-grape'
                      }`}
                    >
                      {preset === 0
                        ? t('stake.extendKeep')
                        : t.plural('stake.extendCount', preset)}
                    </button>
                  ))}
                  <input
                    type='number'
                    inputMode='numeric'
                    min={range.min}
                    max={range.max}
                    value={extendInput ?? String(extendCycles)}
                    onChange={(e) => setExtendInput(e.target.value)}
                    className={`w-24 ${FIELD}`}
                    aria-label={t('stake.extendQuestion')}
                  />
                </div>
                <p className='mt-1 text-xs text-muted'>
                  {extendedTotal !== null && extendedTotal >= 1
                    ? `${t.plural('stake.extendTotal', extendedTotal)} ${t.plural(
                        `stake.cyclesFor.${lockDuration(extendedTotal).unit}`,
                        lockDuration(extendedTotal).count,
                      )} `
                    : ''}
                  {t('stake.extendHint', { min: range.min, max: range.max })}
                </p>
              </Step>
            )}

            {position && extendCycles > 0 && askedExtend === extendCycles && (
              <p className='mt-3 rounded-xl bg-cream p-3 text-xs text-muted'>
                {t('stake.extendNote')}
              </p>
            )}

            {position && cycle?.inPreparePhase && (
              <p className='mt-3 rounded-xl bg-amber-soft p-3 text-xs text-amber-warm'>
                {t('stake.prepareNote')}
              </p>
            )}

            {canToggleBtc && (
              <Step title={t('stake.rewardsQuestion')}>
                <div className='mt-2 space-y-2'>
                  <RewardOption
                    name={rewardsName}
                    checked={!receiveBtc}
                    onSelect={() => setRewardChoice('sbtc')}
                    title={t('stake.rewardsSbtc')}
                    help={t('stake.rewardsSbtcHelp')}
                    now={recorded === null && payout !== null}
                    nowLabel={t('stake.rewardsNow')}
                  />
                  <RewardOption
                    name={rewardsName}
                    checked={receiveBtc}
                    onSelect={() => setRewardChoice('bitcoin')}
                    title={t('stake.rewardsBitcoin')}
                    help={t('stake.rewardsBitcoinHelp')}
                    now={recorded !== null}
                    nowLabel={t('stake.rewardsNow')}
                  />
                </div>

                {(stopsBitcoinPayouts || replacesBtcAddress) && (
                  <p className='mt-2 rounded-xl bg-amber-soft p-3 text-xs text-amber-warm'>
                    {stopsBitcoinPayouts
                      ? t('stake.rewardsChangeToSbtc')
                      : t('stake.rewardsChangeAddress')}
                  </p>
                )}

                {receiveBtc && (
                  <div className='mt-3 space-y-3 rounded-xl bg-cream p-3'>
                    <div>
                      <label className='block text-xs font-semibold'>
                        {t('stake.btcAddress')}
                      </label>
                      <input
                        type='text'
                        value={btcAddress}
                        onChange={(e) => setBtcAddressInput(e.target.value)}
                        className={`mt-1 font-mono ${FIELD}`}
                        placeholder='bc1...'
                      />
                    </div>
                    <div>
                      <label className='block text-xs font-semibold'>
                        {t('stake.maxFee')}
                      </label>
                      <input
                        type='text'
                        inputMode='numeric'
                        value={maxFeeSats}
                        onChange={(e) => setMaxFeeInput(e.target.value)}
                        className={`mt-1 ${FIELD}`}
                      />
                      <p className='mt-1 text-xs text-muted'>
                        {t('stake.maxFeeHint')}
                      </p>
                    </div>
                    {supportsMinClaim && (
                      <div>
                        <label className='block text-xs font-semibold'>
                          {t('stake.minClaim')}
                        </label>
                        <input
                          type='text'
                          inputMode='numeric'
                          value={minClaimSats}
                          onChange={(e) => setMinClaimInput(e.target.value)}
                          className={`mt-1 ${FIELD}`}
                        />
                        <p className='mt-1 text-xs text-muted'>
                          {t('stake.minClaimHint', {
                            min:
                              parsedMaxFee === null
                                ? '—'
                                : minClaimFloorSats(
                                    parsedMaxFee,
                                  ).toLocaleString(t.bundle.intlLocale),
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Step>
            )}

            {error && (
              <p className='mt-4 rounded-xl bg-amber-soft p-3 text-sm text-amber-warm'>
                {error}
              </p>
            )}

            {result && (
              <p
                className={`mt-4 rounded-xl p-3 text-sm ${
                  txStatus === 'failed'
                    ? 'bg-amber-soft text-amber-warm'
                    : 'bg-mint-soft text-mint'
                }`}
              >
                {t(`stake.tx.${txStatus}`)}{' '}
                <a
                  className='font-mono break-all underline underline-offset-2'
                  href={explorerUrl(result.txid)}
                  target='_blank'
                  rel='noreferrer'
                >
                  {ellipsedAddr(result.txid, 16)}
                </a>
              </p>
            )}

            <div className='mt-5 flex flex-wrap items-center justify-between gap-3'>
              <details className='text-xs text-muted'>
                <summary className='cursor-pointer font-semibold'>
                  {t('stake.explain')}
                </summary>
                <p className='mt-1 max-w-sm'>{t('stake.explainBody')}</p>
              </details>
              <button
                type='button'
                onClick={onStake}
                disabled={submitting}
                className='rounded-full bg-grape px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50'
              >
                {submitting ? t('stake.submitting') : submitLabel}
              </button>
            </div>

            {/* Only for the pool the stake is actually with: unstaking ends
                that position wherever the reader happens to be looking. A
                position with no cycle left after this one is already ending,
                so there is nothing for this to stop. */}
            {stakingHere && extendCycles === 0 && (
              <div className='mt-5 border-t border-black/10 pt-4'>
                <p className='text-sm font-bold text-ink'>
                  {t('stake.unstake.title')}
                </p>
                <p className='mt-1 text-xs text-muted'>
                  {t('stake.unstake.body')}
                </p>
                {confirmUnstake ? (
                  <div className='mt-2 flex flex-wrap items-center gap-2'>
                    <button
                      type='button'
                      onClick={onUnstake}
                      disabled={submitting}
                      className='rounded-full bg-amber-soft px-4 py-2 text-sm font-semibold text-amber-warm disabled:opacity-50'
                    >
                      {submitting
                        ? t('stake.submitting')
                        : t('stake.unstake.confirm')}
                    </button>
                    <button
                      type='button'
                      onClick={() => setConfirmUnstake(false)}
                      className='rounded-full px-3 py-2 text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink'
                    >
                      {t('stake.unstake.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => setConfirmUnstake(true)}
                    className='mt-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-ink'
                  >
                    {t('stake.unstake.open')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
