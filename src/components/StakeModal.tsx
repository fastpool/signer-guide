import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getLocalStorage, request } from '@stacks/connect';
import { transactionToHex } from '@stacks/transactions';
import { exactStxLabel } from '../lib/amounts';
import { explorerUrl } from '../lib/explorer';
import { translator, type Locale, type Translator } from '../lib/i18n';
import {
  buildPayoutCalldata,
  defaultMinClaimSats,
  extendCyclesForUpdate,
  fetchCycleState,
  fetchPayoutRecord,
  fetchStakedPosition,
  isValidMinClaim,
  minClaimFloorSats,
  stakePostConditions,
  stakeUpdatePostConditions,
  unstakePostConditions,
  type PayoutRecord,
  type StakedPosition,
} from '../lib/staking';
import { ellipsedAddr } from '../lib/strings';
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
  const data = (await res.json()) as { stx?: { balance?: string } };
  const balance = data.stx?.balance;
  if (!balance || !/^\d+$/.test(balance)) {
    throw new Error(t('stake.error.balanceRead'));
  }
  return BigInt(balance);
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
  const [result, setResult] = useState<{ txid: string | null } | null>(null);
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

  /** Empty means zero once there is a position to update: a move, no top-up. */
  const amountUstx =
    position !== null && amountStx.trim() === ''
      ? 0n
      : parseStxToUstx(amountStx);

  /**
   * A position in its final cycle has no lock period left for the contract to
   * assert on, so a move has to carry it one cycle further or be refused.
   */
  const extendCycles =
    position !== null && cycle !== null
      ? extendCyclesForUpdate({ position, currentCycle: cycle.rewardCycleId })
      : 0;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

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

    if (amountUstx === 0n && !rotating && !changesPayout) {
      setError(t('stake.error.nothingToChange'));
      return;
    }

    if (spendableUstx !== null && amountUstx > spendableUstx) {
      setError(t('stake.error.tooMuch'));
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
        fetchAccountStatus,
        fetchEligibleStakeUpdate,
        fetchPoxInfo,
      } = await import('@stacks/bitcoin-staking');

      const account = await fetchAccountStatus({
        address: active.stxAddress,
        network: 'mainnet',
      });
      const poxInfo = await fetchPoxInfo({ network: 'mainnet' });

      const signerCalldata =
        receiveBtc && parsedMaxFee !== null
          ? await buildPayoutCalldata({
              shape: payout?.shape ?? 'pox-addr',
              btcAddress: rewardBtcAddress,
              maxFeeSats: parsedMaxFee,
              minClaimSats: minClaim ?? undefined,
            })
          : undefined;

      let tx;
      if (position) {
        // Read from the answer we are about to build against, not from the one
        // the dialog opened with — a cycle can turn while the form is filled in.
        const cyclesToExtend = extendCyclesForUpdate({
          position,
          currentCycle: poxInfo.rewardCycleId,
        });

        // Every gate the contract applies to this call, replayed read-only.
        // The alternative is a staker paying a fee to be told no.
        const eligible = await fetchEligibleStakeUpdate({
          staker: active.stxAddress,
          signerManager: signer.contractId,
          oldSignerManager: position.signer,
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
          oldSignerManager: position.signer,
          cyclesToExtend,
          amountIncrease: amountUstx,
          signerCalldata,
          publicKey: active.publicKey,
          nonce: account.nonce,
          fee: 10_000n,
          network: 'mainnet',
          postConditions: stakeUpdatePostConditions(
            active.stxAddress,
            amountUstx,
          ),
        });
      } else {
        tx = await buildStake({
          signerManager: signer.contractId,
          amountUstx,
          numCycles: 1,
          startBurnHt: poxInfo.currentBurnchainBlockHeight + 1,
          signerCalldata,
          publicKey: active.publicKey,
          nonce: account.nonce,
          fee: 10_000n,
          network: 'mainnet',
          postConditions: stakePostConditions(active.stxAddress, amountUstx),
        });
      }

      // Same options as the connect above, so the signature is asked of the
      // wallet the reader actually picked rather than a second one.
      const response = (await request(walletOptions(), 'stx_signTransaction', {
        transaction: transactionToHex(tx),
        broadcast: true,
      })) as { txid?: string };

      setResult({ txid: response?.txid ?? null });
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
        fetchAccountStatus,
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

      const [account, custodiedSbtcSats] = await Promise.all([
        fetchAccountStatus({ address: active.stxAddress, network: 'mainnet' }),
        // Zero for everybody who staked here — but a staker who also holds a
        // bond gets their sBTC back in the same call, and deny mode refuses an
        // sBTC transfer nothing accounts for.
        fetchStakerCustodiedSbtc({
          staker: active.stxAddress,
          network: 'mainnet',
        }),
      ]);

      const tx = await buildUnstake({
        oldSignerManager: position.signer,
        publicKey: active.publicKey,
        nonce: account.nonce,
        fee: 10_000n,
        network: 'mainnet',
        postConditions: unstakePostConditions({
          staker: active.stxAddress,
          custodiedSbtcSats,
          poxContractId: poxInfo.contractId,
          sbtcContract: poxInfo.sbtcContract,
        }),
      });

      const response = (await request(walletOptions(), 'stx_signTransaction', {
        transaction: transactionToHex(tx),
        broadcast: true,
      })) as { txid?: string };

      setResult({ txid: response?.txid ?? null });
      setConfirmUnstake(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = !position
    ? t('stake.stakeNow')
    : stakingHere
      ? t('stake.addToStake')
      : t('stake.moveStake');

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

            {position && extendCycles > 0 && (
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
              <p className='mt-4 rounded-xl bg-mint-soft p-3 text-sm text-mint'>
                {result.txid ? (
                  <>
                    {t('stake.submitted')}
                    <a
                      className='font-mono break-all underline underline-offset-2'
                      href={explorerUrl(result.txid)}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {ellipsedAddr(result.txid, 16)}
                    </a>
                  </>
                ) : (
                  t('stake.submittedNoTxid')
                )}{' '}
                {t('stake.submittedHint')}
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
                that position wherever the reader happens to be looking. */}
            {stakingHere && (
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
