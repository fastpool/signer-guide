import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  clearLocalStorage,
  connect,
  getLocalStorage,
  request,
} from '@stacks/connect';
import { transactionToHex } from '@stacks/transactions';
import { explorerUrl } from '../lib/explorer';
import { translator, type Locale, type Translator } from '../lib/i18n';
import type { Signer } from '../lib/types';
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

function signerNameFromContractId(contractId: string): string {
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

export default function StakeModal({
  signer,
  locale,
}: {
  signer: Signer;
  locale: Locale;
}) {
  const t = translator(locale);
  const titleId = useId();

  const session = useWalletSession();
  const [open, setOpen] = useState(false);
  /** Known from localStorage but with no public key behind it yet. */
  const [cachedAddress, setCachedAddress] = useState<string | null>(null);
  const [currentSignerManager, setCurrentSignerManager] = useState<
    string | null
  >(null);
  const [balanceUstx, setBalanceUstx] = useState<bigint | null>(null);
  const [amountStx, setAmountStx] = useState('');
  const [receiveBtc, setReceiveBtc] = useState(false);
  const [btcAddress, setBtcAddress] = useState('');
  const [maxFeeSats, setMaxFeeSats] = useState('3000');
  const [submitting, setSubmitting] = useState(false);
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
   * Bumped whenever the account changes, so a slow balance lookup for the
   * account the user has just switched away from cannot overwrite the new one.
   */
  const loadId = useRef(0);

  const spendableUstx = useMemo(
    () => spendableFromBalance(balanceUstx),
    [balanceUstx],
  );

  const currentSignerName = useMemo(() => {
    if (!currentSignerManager) return null;
    if (currentSignerManager === signer.contractId) return signer.displayName;
    return signerNameFromContractId(currentSignerManager);
  }, [currentSignerManager, signer.contractId, signer.displayName]);

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

  /** Balance and current signer for whichever address we are showing. */
  useEffect(() => {
    if (!open || !walletAddress) return;

    const id = ++loadId.current;
    const load = async () => {
      setLoading(true);
      try {
        const { fetchStakerInfo } = await import('@stacks/bitcoin-staking');
        const stakerInfo = await fetchStakerInfo({
          address: walletAddress,
          network: 'mainnet',
        });
        if (id !== loadId.current) return;
        setCurrentSignerManager(
          stakerInfo.staked ? stakerInfo.details.signer : null,
        );

        const balance = await fetchBalanceUstx(walletAddress, t);
        if (id !== loadId.current) return;
        setBalanceUstx(balance);
        setAmountStx(formatUstxAsStx(spendableFromBalance(balance) ?? 0n));
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
  }, [open, walletAddress, reloadNonce, t]);

  useEffect(() => {
    if (session?.btcAddress) setBtcAddress(session.btcAddress);
  }, [session?.btcAddress]);

  /** Everything read for the previous account, dropped before the new one loads. */
  const forgetAccount = () => {
    loadId.current += 1;
    setCachedAddress(null);
    setCurrentSignerManager(null);
    setBalanceUstx(null);
    setAmountStx('');
    setBtcAddress('');
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
    await clearLocalStorage();
    const { addresses } = await connect();
    const next = sessionFromAddresses(addresses as WalletAddress[]);
    if (!next) {
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
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onUseMax = () => {
    if (spendableUstx === null) return;
    setAmountStx(formatUstxAsStx(spendableUstx));
  };

  const onStake = async () => {
    setError(null);
    setResult(null);

    const amountUstx = parseStxToUstx(amountStx);
    if (amountUstx === null || amountUstx <= 0n) {
      setError(t('stake.error.amount'));
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

    if (receiveBtc && !/^\d+$/.test(maxFeeSats.trim())) {
      setError(t('stake.error.maxFee'));
      return;
    }

    setSubmitting(true);
    try {
      // Already connected this visit: the public key is in memory, so the only
      // wallet interaction left is signing. Otherwise connect once, here.
      const active = session ?? (await openWallet());

      const {
        buildSignerCalldata,
        buildStake,
        buildStakeUpdate,
        fetchAccountStatus,
        fetchPoxInfo,
      } = await import('@stacks/bitcoin-staking');

      const account = await fetchAccountStatus({
        address: active.stxAddress,
        network: 'mainnet',
      });
      const poxInfo = await fetchPoxInfo({ network: 'mainnet' });

      const signerCalldata = receiveBtc
        ? buildSignerCalldata({
            poxAddress: rewardBtcAddress,
            maxFeeSats: BigInt(maxFeeSats.trim()),
          })
        : undefined;

      const tx = currentSignerManager
        ? await buildStakeUpdate({
            signerManager: signer.contractId,
            oldSignerManager: currentSignerManager,
            amountIncrease: amountUstx,
            signerCalldata,
            publicKey: active.publicKey,
            nonce: account.nonce,
            fee: 10_000n,
            network: 'mainnet',
          })
        : await buildStake({
            signerManager: signer.contractId,
            amountUstx,
            numCycles: 1,
            startBurnHt: poxInfo.currentBurnchainBlockHeight + 1,
            signerCalldata,
            publicKey: active.publicKey,
            nonce: account.nonce,
            fee: 10_000n,
            network: 'mainnet',
          });

      const response = (await request('stx_signTransaction', {
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

  const connectLabel = loading
    ? t('stake.checking')
    : walletAddress
      ? t('stake.switch')
      : t('stake.connect');

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

            {currentSignerManager && (
              <p className='mt-2 rounded-xl bg-cream px-3 py-2 text-xs text-muted'>
                {t('stake.currentSigner')}
                <span className='font-semibold text-ink'>
                  {currentSignerName}
                </span>
                {currentSignerName !== currentSignerManager && (
                  <>
                    {' '}
                    <span className='font-mono text-ink'>
                      ({currentSignerManager})
                    </span>
                  </>
                )}
                {currentSignerManager === signer.contractId &&
                  t('stake.currentSignerSelected')}
              </p>
            )}

            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <button
                type='button'
                onClick={connectWallet}
                className='rounded-full bg-grape-soft px-4 py-2 text-sm font-semibold text-grape hover:bg-grape-soft/80'
              >
                {connectLabel}
              </button>
              {walletAddress && (
                <span className='text-xs text-muted'>
                  {t('stake.connected')} {walletAddress}
                </span>
              )}
            </div>

            <div className='mt-4 rounded-2xl bg-cream p-4'>
              <p className='text-sm text-muted'>
                {t.rich('stake.balance', {
                  value: (
                    <strong className='text-ink'>
                      {balanceUstx === null
                        ? t('stake.balanceUnknown')
                        : `${formatUstxAsStx(balanceUstx)} STX`}
                    </strong>
                  ),
                })}
              </p>
              {session?.btcAddress && (
                <p className='mt-1 text-xs text-muted'>
                  BTC: <span className='font-mono'>{session.btcAddress}</span>
                </p>
              )}
            </div>

            <div className='mt-4'>
              <label className='text-sm font-semibold'>
                {t('stake.amountLabel')}
              </label>
              <div className='mt-1 flex gap-2'>
                <input
                  type='text'
                  inputMode='decimal'
                  value={amountStx}
                  onChange={(e) => setAmountStx(e.target.value)}
                  className='w-full rounded-xl border border-black/10 px-3 py-2 text-sm'
                  placeholder='0'
                />
                <button
                  type='button'
                  onClick={onUseMax}
                  className='rounded-xl bg-grape-soft px-3 py-2 text-sm font-semibold text-grape'
                >
                  {t('stake.max')}
                </button>
              </div>
              <p className='mt-1 text-xs text-muted'>{t('stake.maxHint')}</p>
            </div>

            {canToggleBtc && (
              <div className='mt-4 rounded-2xl border border-black/10 p-4'>
                <label className='flex items-center gap-2 text-sm font-semibold'>
                  <input
                    type='checkbox'
                    checked={receiveBtc}
                    onChange={(e) => setReceiveBtc(e.target.checked)}
                  />
                  {t('stake.receiveBtc')}
                </label>

                {receiveBtc && (
                  <>
                    <label className='mt-3 block text-sm font-semibold'>
                      {t('stake.btcAddress')}
                    </label>
                    <input
                      type='text'
                      value={btcAddress}
                      onChange={(e) => setBtcAddress(e.target.value)}
                      className='mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-mono'
                      placeholder='bc1...'
                    />

                    <label className='mt-3 block text-sm font-semibold'>
                      {t('stake.maxFee')}
                    </label>
                    <input
                      type='text'
                      inputMode='numeric'
                      value={maxFeeSats}
                      onChange={(e) => setMaxFeeSats(e.target.value)}
                      className='mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm'
                    />
                    <p className='mt-1 text-xs text-muted'>
                      {t('stake.maxFeeHint')}
                    </p>
                  </>
                )}
              </div>
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
                      {result.txid}
                    </a>
                  </>
                ) : (
                  t('stake.submittedNoTxid')
                )}
              </p>
            )}

            <div className='mt-5 flex justify-end'>
              <button
                type='button'
                onClick={onStake}
                disabled={submitting}
                className='rounded-full bg-grape px-5 py-2 text-sm font-semibold text-white disabled:opacity-50'
              >
                {submitting
                  ? t('stake.submitting')
                  : currentSignerManager
                    ? t('stake.signUpdate')
                    : t('stake.stakeNow')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
