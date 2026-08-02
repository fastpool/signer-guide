import { useEffect, useMemo, useState } from 'react';
import { connect, getLocalStorage, request } from '@stacks/connect';
import { transactionToHex } from '@stacks/transactions';
import type { Locale } from '../lib/i18n';
import type { Signer } from '../lib/types';

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

type WalletAddress = { address: string; publicKey?: string };

function pickAddress(
  addresses: WalletAddress[],
  predicate: (addr: string) => boolean,
): string | null {
  const found = addresses.find((entry) => predicate(entry.address));
  return found?.address ?? null;
}

function isStacksAddress(address: string): boolean {
  return /^S[PTMN][A-Z0-9]{20,}$/i.test(address);
}

function isBtcAddress(address: string): boolean {
  return /^(bc1|tb1|[13mn2])[a-zA-Z0-9]{20,}$/i.test(address);
}

function signerNameFromContractId(contractId: string): string {
  const [, contractName = contractId] = contractId.split('.');
  return contractName
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function fetchBalanceUstx(address: string): Promise<bigint> {
  const res = await fetch(
    `${STACKS_API_URL}/extended/v1/address/${address}/balances`,
  );
  if (!res.ok) {
    throw new Error(`Balance lookup failed (${res.status})`);
  }
  const data = (await res.json()) as { stx?: { balance?: string } };
  const balance = data.stx?.balance;
  if (!balance || !/^\d+$/.test(balance)) {
    throw new Error('Could not read STX balance');
  }
  return BigInt(balance);
}

export default function StakeModal({
  signer,
  locale,
}: {
  signer: Signer;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [walletBtcAddress, setWalletBtcAddress] = useState<string | null>(null);
  const [currentSignerManager, setCurrentSignerManager] = useState<
    string | null
  >(null);
  const [balanceUstx, setBalanceUstx] = useState<bigint | null>(null);
  const [amountStx, setAmountStx] = useState('');
  const [receiveBtc, setReceiveBtc] = useState(false);
  const [btcAddress, setBtcAddress] = useState('');
  const [maxFeeSats, setMaxFeeSats] = useState('3000');
  const [submitting, setSubmitting] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const ko = locale === 'ko';
  const canToggleBtc = signer.bitcoinRewards;

  const spendableUstx = useMemo(() => {
    return spendableFromBalance(balanceUstx);
  }, [balanceUstx]);

  const currentSignerName = useMemo(() => {
    if (!currentSignerManager) return null;
    if (currentSignerManager === signer.contractId) return signer.displayName;
    return signerNameFromContractId(currentSignerManager);
  }, [currentSignerManager, signer.contractId, signer.displayName]);

  const hydrateWallet = async (addresses: WalletAddress[]) => {
    const stxAddress = pickAddress(addresses, isStacksAddress);
    const btc = pickAddress(addresses, isBtcAddress);

    if (!stxAddress) {
      throw new Error(
        ko
          ? '지갑에서 STX 주소를 찾지 못했습니다.'
          : 'Could not find an STX address in the connected wallet.',
      );
    }

    const stxEntry = addresses.find((entry) => entry.address === stxAddress);
    setWalletAddress(stxAddress);
    setWalletPublicKey(stxEntry?.publicKey ?? null);
    setWalletBtcAddress(btc);
    if (!btcAddress && btc) setBtcAddress(btc);

    const { fetchStakerInfo } = await import('@stacks/bitcoin-staking');
    const stakerInfo = await fetchStakerInfo({
      address: stxAddress,
      network: 'mainnet',
    });
    setCurrentSignerManager(
      stakerInfo.staked ? stakerInfo.details.signer : null,
    );

    const balance = await fetchBalanceUstx(stxAddress);
    setBalanceUstx(balance);
    const spendable = spendableFromBalance(balance) ?? 0n;
    setAmountStx(formatUstxAsStx(spendable));
  };

  const connectWallet = async () => {
    setError(null);
    setResult(null);
    setSessionChecking(false);
    try {
      const connected = (await connect()) as {
        addresses?: WalletAddress[];
      };
      await hydrateWallet(connected.addresses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!open || walletAddress) return;

    const restoreWalletSession = async () => {
      setSessionChecking(true);
      try {
        const cached = getLocalStorage();
        const addresses = [
          ...(cached?.addresses.stx ?? []),
          ...(cached?.addresses.btc ?? []),
        ];
        if (!addresses.length) return;
        await hydrateWallet(addresses);
      } catch {
        // Ignore silent restore failures and allow manual connect.
      } finally {
        setSessionChecking(false);
      }
    };

    void restoreWalletSession();
  }, [open, walletAddress]);

  const onUseMax = () => {
    if (spendableUstx === null) return;
    setAmountStx(formatUstxAsStx(spendableUstx));
  };

  const onStake = async () => {
    setError(null);
    setResult(null);

    if (!walletAddress) {
      setError(ko ? '먼저 지갑을 연결하세요.' : 'Connect your wallet first.');
      return;
    }

    const amountUstx = parseStxToUstx(amountStx);
    if (amountUstx === null || amountUstx <= 0n) {
      setError(
        ko
          ? '유효한 스테이킹 수량을 입력하세요.'
          : 'Enter a valid stake amount.',
      );
      return;
    }

    if (spendableUstx !== null && amountUstx > spendableUstx) {
      setError(
        ko
          ? '잔액에서 1 STX를 제외한 금액을 초과했습니다.'
          : 'Amount exceeds your balance minus 1 STX.',
      );
      return;
    }

    const rewardBtcAddress = receiveBtc ? btcAddress.trim() : '';
    if (receiveBtc && !rewardBtcAddress) {
      setError(ko ? 'BTC 주소를 입력하세요.' : 'Enter a BTC reward address.');
      return;
    }

    if (receiveBtc && !/^\d+$/.test(maxFeeSats.trim())) {
      setError(
        ko
          ? '최대 수수료(sats)는 숫자여야 합니다.'
          : 'Max fee (sats) must be a number.',
      );
      return;
    }

    setSubmitting(true);
    try {
      let stakingAddress = walletAddress;
      let stakingPublicKey = walletPublicKey;

      // Local storage restore can provide addresses without public keys.
      // Refresh address details only when user actively submits.
      if (!stakingPublicKey) {
        const connected = (await connect()) as {
          addresses?: WalletAddress[];
        };
        const addresses = connected.addresses ?? [];
        const preferred =
          addresses.find((entry) => entry.address === stakingAddress) ??
          addresses.find((entry) => isStacksAddress(entry.address));

        if (!preferred?.address || !preferred.publicKey) {
          throw new Error(
            ko
              ? '계정 전환 후 다시 시도하세요.'
              : 'Switch accounts and try again.',
          );
        }

        stakingAddress = preferred.address;
        stakingPublicKey = preferred.publicKey;
        setWalletAddress(preferred.address);
        setWalletPublicKey(preferred.publicKey);
      }

      const {
        buildSignerCalldata,
        buildStake,
        buildStakeUpdate,
        fetchAccountStatus,
        fetchPoxInfo,
      } = await import('@stacks/bitcoin-staking');

      const account = await fetchAccountStatus({
        address: stakingAddress,
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
            publicKey: stakingPublicKey,
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
            publicKey: stakingPublicKey,
            nonce: account.nonce,
            fee: 10_000n,
            network: 'mainnet',
          });

      const response = (await request('stx_signTransaction', {
        transaction: transactionToHex(tx),
        broadcast: true,
      })) as { txid?: string; transaction?: string };

      if (response?.txid) {
        setResult(response.txid);
      } else {
        setResult(
          ko
            ? '트랜잭션 요청이 제출되었습니다.'
            : 'Transaction request submitted.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='rounded-full bg-grape px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-grape/90'
      >
        {ko ? '지갑으로 스테이킹' : 'Stake with wallet'}
      </button>

      {open && (
        <div
          className='fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center'
          role='dialog'
          aria-modal='true'
        >
          <div className='my-4 w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl md:my-0 md:max-h-[calc(100vh-3rem)] md:overflow-y-auto'>
            <div className='flex items-start justify-between gap-4'>
              <h4 className='text-xl font-bold'>
                {ko
                  ? `${signer.displayName} 스테이킹`
                  : `Stake with ${signer.displayName}`}
              </h4>
              <button
                type='button'
                onClick={() => setOpen(false)}
                className='rounded-full px-2 py-1 text-sm text-muted hover:bg-grape-soft'
              >
                {ko ? '닫기' : 'Close'}
              </button>
            </div>

            <p className='mt-2 text-sm text-muted'>
              {ko
                ? 'bitcoin-staking buildStake 트랜잭션을 만들고 지갑으로 서명해 전송합니다. 안전 여유를 위해 1 STX는 남겨둡니다.'
                : 'Builds a bitcoin-staking buildStake transaction, then signs and broadcasts with your wallet. Keeps 1 STX as a safety buffer.'}
            </p>

            {currentSignerManager && (
              <p className='mt-2 rounded-xl bg-cream px-3 py-2 text-xs text-muted'>
                {ko
                  ? '현재 스테이킹 중인 서명자: '
                  : 'Currently staking with signer: '}
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
                  (ko ? ' (현재 이 풀 선택됨)' : ' (this pool is selected)')}
              </p>
            )}

            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <button
                type='button'
                onClick={connectWallet}
                className='rounded-full bg-grape-soft px-4 py-2 text-sm font-semibold text-grape hover:bg-grape-soft/80'
              >
                {sessionChecking
                  ? ko
                    ? '연결 상태 확인 중...'
                    : 'Checking wallet...'
                  : walletAddress
                    ? ko
                      ? '계정 전환'
                      : 'Switch accounts'
                    : ko
                      ? '지갑 연결'
                      : 'Connect wallet'}
              </button>
              {walletAddress && (
                <span className='text-xs text-muted'>
                  {ko ? '연결됨:' : 'Connected:'} {walletAddress}
                </span>
              )}
            </div>

            <div className='mt-4 rounded-2xl bg-cream p-4'>
              <p className='text-sm text-muted'>
                {ko ? '잔액' : 'Balance'}:{' '}
                <strong className='text-ink'>
                  {balanceUstx === null
                    ? ko
                      ? '지갑 연결 필요'
                      : 'Connect wallet to load'
                    : `${formatUstxAsStx(balanceUstx)} STX`}
                </strong>
              </p>
              {walletBtcAddress && (
                <p className='mt-1 text-xs text-muted'>
                  BTC: <span className='font-mono'>{walletBtcAddress}</span>
                </p>
              )}
            </div>

            <div className='mt-4'>
              <label className='text-sm font-semibold'>
                {ko ? '스테이킹 수량 (STX)' : 'Amount to stake (STX)'}
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
                  {ko ? '최대' : 'Max'}
                </button>
              </div>
              <p className='mt-1 text-xs text-muted'>
                {ko
                  ? '최대 버튼은 잔액 - 1 STX를 자동 입력합니다.'
                  : 'Max uses your balance minus 1 STX.'}
              </p>
            </div>

            {canToggleBtc && (
              <div className='mt-4 rounded-2xl border border-black/10 p-4'>
                <label className='flex items-center gap-2 text-sm font-semibold'>
                  <input
                    type='checkbox'
                    checked={receiveBtc}
                    onChange={(e) => setReceiveBtc(e.target.checked)}
                  />
                  {ko ? '보상을 BTC로 받기' : 'Receive rewards in BTC'}
                </label>

                {receiveBtc && (
                  <>
                    <label className='mt-3 block text-sm font-semibold'>
                      {ko ? 'BTC 주소' : 'BTC address'}
                    </label>
                    <input
                      type='text'
                      value={btcAddress}
                      onChange={(e) => setBtcAddress(e.target.value)}
                      className='mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-mono'
                      placeholder='bc1...'
                    />

                    <label className='mt-3 block text-sm font-semibold'>
                      {ko ? '최대 수수료 (sats)' : 'Max fee (sats)'}
                    </label>
                    <input
                      type='text'
                      inputMode='numeric'
                      value={maxFeeSats}
                      onChange={(e) => setMaxFeeSats(e.target.value)}
                      className='mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm'
                    />
                    <p className='mt-1 text-xs text-muted'>
                      {ko
                        ? '기본값은 3000 sats입니다.'
                        : 'Default is 3000 sats.'}
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
                {ko ? '요청 완료: ' : 'Submitted: '}
                <span className='font-mono break-all'>{result}</span>
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
                  ? ko
                    ? '요청 중...'
                    : 'Submitting...'
                  : ko
                    ? currentSignerManager
                      ? '스테이킹 업데이트 서명'
                      : '지금 스테이킹'
                    : currentSignerManager
                      ? 'Sign stake update'
                      : 'Stake now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
