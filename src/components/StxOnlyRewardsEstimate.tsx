import { useEffect, useMemo, useState } from 'react';
import { exactStxLabel } from '../lib/amounts';
import { translator, type Locale } from '../lib/i18n';
import type { Signer } from '../lib/types';

const STACKS_API_URL =
  typeof import.meta.env.VITE_STACKS_API_URL === 'string' &&
  import.meta.env.VITE_STACKS_API_URL.length > 0
    ? import.meta.env.VITE_STACKS_API_URL
    : 'https://api.hiro.so';

const POX5_CONTRACT = 'SP000000000000000000002Q6VF78.pox-5';
const FOUNDATION_SHARE_BIPS = 1500; // 15%
const DISTRIBUTION_BLOCKS = 1050;
const USTX_PER_STX = 1_000_000n;
const SATS_PER_SBTC = 100_000_000n;

type Estimate = {
  sbtcBalanceSats: bigint;
  bondShareSats: bigint;
  foundationShareSats: bigint;
  stxOnlySoFarSats: bigint;
  projectedCycleSats: bigint;
  stxOnlyStakedUstx: bigint;
  totalStakedUstx: bigint;
  bondStakedUstx: bigint;
  blocksIntoCycle: number;
  rateSatsPerStx: bigint;
};

function sumKnownUstx(
  contractIds: string[],
  totals: Record<string, string | null>,
): bigint {
  let sum = 0n;
  for (const contractId of contractIds) {
    const amount = totals[contractId];
    if (amount === null || amount === undefined) continue;
    sum += BigInt(amount);
  }
  return sum;
}

function formatSbtc(sats: bigint, locale: Locale): string {
  const t = translator(locale);
  const whole = (sats / SATS_PER_SBTC).toLocaleString(t.bundle.intlLocale);
  const frac = (sats % SATS_PER_SBTC)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac} sBTC` : `${whole} sBTC`;
}

function parseBlocksIntoCycle(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const blocks = Math.floor(value);
  if (blocks < 1) return null;
  if (blocks > DISTRIBUTION_BLOCKS) return DISTRIBUTION_BLOCKS;
  return blocks;
}

function readSbtcBalance(
  balances: unknown,
  expectedContract: string | null,
): bigint | null {
  if (typeof balances !== 'object' || balances === null) return null;
  const body = balances as {
    fungible_tokens?: Record<string, { balance?: string }>;
  };
  const tokens = body.fungible_tokens;
  if (!tokens || typeof tokens !== 'object') return null;

  const preferred =
    expectedContract === null ? null : `${expectedContract}::sbtc-token`;
  if (preferred && /^\d+$/.test(tokens[preferred]?.balance ?? '')) {
    return BigInt(tokens[preferred]!.balance!);
  }

  for (const [asset, info] of Object.entries(tokens)) {
    if (!asset.endsWith('::sbtc-token')) continue;
    if (!/^\d+$/.test(info?.balance ?? '')) continue;
    return BigInt(info.balance!);
  }

  return null;
}

export default function StxOnlyRewardsEstimate({
  signers,
  totals,
  locale,
}: {
  signers: Signer[];
  totals: Record<string, string | null>;
  locale: Locale;
}) {
  const t = translator(locale);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const staked = useMemo(() => {
    const contractIds = signers.map((s) => s.contractId);
    const bondContractIds = signers
      .filter((s) => s.contractId.includes('signer-manager-bond-'))
      .map((s) => s.contractId);

    const totalStakedUstx = sumKnownUstx(contractIds, totals);
    const bondStakedUstx = sumKnownUstx(bondContractIds, totals);
    const stxOnlyStakedUstx = totalStakedUstx - bondStakedUstx;

    return { totalStakedUstx, bondStakedUstx, stxOnlyStakedUstx };
  }, [signers, totals]);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    const load = async () => {
      setLoading(true);
      setFailed(false);

      try {
        const { fetchPoxInfo } = await import('@stacks/bitcoin-staking');
        const pox = await fetchPoxInfo({ network: 'mainnet' });

        const poxContractId =
          typeof pox.contractId === 'string' && pox.contractId.length > 0
            ? pox.contractId
            : POX5_CONTRACT;

        const sbtcContractId =
          typeof pox.sbtcContract === 'string' && pox.sbtcContract.length > 0
            ? pox.sbtcContract
            : null;

        const res = await fetch(
          `${STACKS_API_URL}/extended/v1/address/${poxContractId}/balances`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('balances failed');
        const balances = (await res.json()) as unknown;
        const sbtcBalanceSats = readSbtcBalance(balances, sbtcContractId);
        if (sbtcBalanceSats === null) throw new Error('sbtc missing');

        const currentBurnchainBlockHeight = Number(
          (pox as { currentBurnchainBlockHeight?: unknown })
            .currentBurnchainBlockHeight,
        );
        const firstBurnchainBlockHeight = Number(
          (pox as { firstBurnchainBlockHeight?: unknown })
            .firstBurnchainBlockHeight,
        );
        const rewardCycleId = Number(
          (pox as { rewardCycleId?: unknown }).rewardCycleId,
        );
        const rewardCycleLength = Number(
          (pox as { rewardCycleLength?: unknown }).rewardCycleLength,
        );

        let blocksIntoCycle: number | null = null;
        if (
          Number.isFinite(currentBurnchainBlockHeight) &&
          Number.isFinite(firstBurnchainBlockHeight) &&
          Number.isFinite(rewardCycleId) &&
          Number.isFinite(rewardCycleLength) &&
          rewardCycleLength > 0
        ) {
          const cycleStart =
            firstBurnchainBlockHeight + rewardCycleId * rewardCycleLength;
          blocksIntoCycle = parseBlocksIntoCycle(
            currentBurnchainBlockHeight - cycleStart + 1,
          );
        }

        if (blocksIntoCycle === null || staked.stxOnlyStakedUstx <= 0n) {
          throw new Error('cycle progress or stake missing');
        }

        const bondShareSats =
          staked.totalStakedUstx > 0n
            ? (sbtcBalanceSats * staked.bondStakedUstx) / staked.totalStakedUstx
            : 0n;
        const foundationShareSats =
          (sbtcBalanceSats * BigInt(FOUNDATION_SHARE_BIPS)) / 10_000n;
        const stxOnlySoFarSats =
          sbtcBalanceSats - bondShareSats - foundationShareSats;

        const safeStxOnlySoFar = stxOnlySoFarSats > 0n ? stxOnlySoFarSats : 0n;
        const projectedCycleSats =
          (safeStxOnlySoFar * BigInt(DISTRIBUTION_BLOCKS)) /
          BigInt(blocksIntoCycle);
        const rateSatsPerStx =
          (projectedCycleSats * USTX_PER_STX) / staked.stxOnlyStakedUstx;

        if (!live) return;
        setEstimate({
          sbtcBalanceSats,
          bondShareSats,
          foundationShareSats,
          stxOnlySoFarSats: safeStxOnlySoFar,
          projectedCycleSats,
          stxOnlyStakedUstx: staked.stxOnlyStakedUstx,
          totalStakedUstx: staked.totalStakedUstx,
          bondStakedUstx: staked.bondStakedUstx,
          blocksIntoCycle,
          rateSatsPerStx,
        });
      } catch {
        if (!live) return;
        setEstimate(null);
        setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
    };

    void load();

    return () => {
      live = false;
      controller.abort();
    };
  }, [staked]);

  return (
    <section className='mt-10 rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      <h2 className='text-2xl font-bold'>{t('app.stxOnlyEstimate.title')}</h2>
      <p className='mt-1 text-sm text-muted'>{t('app.stxOnlyEstimate.intro')}</p>

      {loading && (
        <p className='mt-3 text-sm text-muted'>
          {t('app.stxOnlyEstimate.loading')}
        </p>
      )}

      {!loading && failed && (
        <p className='mt-3 text-sm text-amber-warm'>
          {t('app.stxOnlyEstimate.unavailable')}
        </p>
      )}

      {!loading && estimate && (
        <dl className='mt-4 space-y-2 text-sm'>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.currentPool')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.sbtcBalanceSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.bondShare')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.bondShareSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>
              {t('app.stxOnlyEstimate.foundationShare')}
            </dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.foundationShareSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.stxOnlySoFar')}</dt>
            <dd className='font-semibold text-ink'>
              {formatSbtc(estimate.stxOnlySoFarSats, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>
              {t('app.stxOnlyEstimate.progress', {
                now: estimate.blocksIntoCycle,
                total: DISTRIBUTION_BLOCKS,
              })}
            </dt>
            <dd className='font-semibold text-ink'>
              {t('app.stxOnlyEstimate.projected', {
                amount: formatSbtc(estimate.projectedCycleSats, locale),
              })}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.stxOnlyStaked')}</dt>
            <dd className='font-semibold text-ink'>
              {exactStxLabel(estimate.stxOnlyStakedUstx, locale)}
            </dd>
          </div>
          <div className='flex flex-wrap items-baseline justify-between gap-3 border-t border-black/5 pt-2'>
            <dt className='text-muted'>{t('app.stxOnlyEstimate.rate')}</dt>
            <dd className='text-base font-bold text-ink'>
              {t('app.stxOnlyEstimate.rateValue', {
                sats: estimate.rateSatsPerStx.toLocaleString(t.bundle.intlLocale),
              })}
            </dd>
          </div>
        </dl>
      )}

      <p className='mt-3 text-xs text-muted'>{t('app.stxOnlyEstimate.note')}</p>
    </section>
  );
}
