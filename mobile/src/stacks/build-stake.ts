import {
  buildPayoutCalldata,
  cyclesRemaining,
  extendRange,
  isValidLockCycles,
  stakePostConditions,
  stakeUpdatePostConditions,
  unstakePostConditions,
  type PayoutShape,
} from '@guide/lib/staking';
import { contractCallFrom, unsignedFor } from '../wallet/contract-call';
import type { ContractCallRequest } from '../wallet/types';

/**
 * Turning what somebody filled in into the call a wallet is asked to sign.
 *
 * Everything about argument order, calldata encoding and post conditions is
 * the staking package's and the guide's, not this app's — it builds the same
 * transaction the web page builds and then reads the call back out of it, so
 * the two cannot drift apart. What is added here is only the two things a
 * phone changes: the wallet supplies the public key, and the wallet
 * broadcasts.
 *
 * The chain is read again inside these rather than trusting what the form
 * opened with. A cycle turning while somebody typed moves both ends of what
 * pox-5 will accept, and a stake refused on chain has already cost its fee.
 */

export type PayoutChoice =
  | { kind: 'sbtc' }
  | {
      kind: 'bitcoin';
      address: string;
      maxFeeSats: bigint;
      /** Only sent to a contract that understands it. */
      minClaimSats?: bigint;
    };

export type StakeIntent = {
  staker: string;
  /** Only ever a placeholder for the builder; the wallet signs with its own. */
  publicKey?: string;
  signerContractId: string;
  /** What this call adds. Zero is allowed for an update that only moves pool. */
  amountUstx: bigint;
  /** First stake only — how long to lock for. */
  numCycles: number;
  /** Update only — cycles to add. Clamped up to whatever pox-5 insists on. */
  extendCycles?: number;
  payout: PayoutChoice;
  payoutShape: PayoutShape;
};

export class StakeRefused extends Error {
  readonly reasons: readonly number[];
  constructor(message: string, reasons: readonly number[] = []) {
    super(message);
    this.name = 'StakeRefused';
    this.reasons = reasons;
  }
}

async function calldataFor(payout: PayoutChoice, shape: PayoutShape) {
  if (payout.kind === 'sbtc') return undefined;
  return buildPayoutCalldata({
    shape,
    btcAddress: payout.address,
    maxFeeSats: payout.maxFeeSats,
    minClaimSats: payout.minClaimSats,
  });
}

/** Why the contract would refuse, in the package's own words. */
function reasonList(
  reasons: readonly number[],
  describe: (code: number) => { description: string } | undefined,
): string {
  return reasons
    .map((code) => describe(code)?.description ?? `pox-5 error ${code}`)
    .join(' ');
}

/**
 * The call for a first stake or for a change to an existing one.
 *
 * Which of the two it is is decided by the chain, not by the form: a position
 * that unlocked while the form was open takes the first-stake path even though
 * the screen was opened to change one.
 */
export async function buildStakeCall(
  intent: StakeIntent,
): Promise<ContractCallRequest> {
  const {
    buildStake,
    buildStakeUpdate,
    describePox5Error,
    fetchEligibleStake,
    fetchEligibleStakeUpdate,
    fetchPoxInfo,
    fetchStakerInfo,
  } = await import('@stacks/bitcoin-staking');

  const [poxInfo, staker] = await Promise.all([
    fetchPoxInfo({ network: 'mainnet' }),
    fetchStakerInfo({ address: intent.staker, network: 'mainnet' }),
  ]);

  const signerCalldata = await calldataFor(intent.payout, intent.payoutShape);
  const unsigned = unsignedFor(intent.publicKey);

  if (staker.staked) {
    /*
     * The range against the position as it is now. Asking for less than the
     * floor is not a refusal to extend — it is a position that cannot be
     * updated without one more cycle, which is what the floor is.
     */
    const range = extendRange(
      cyclesRemaining({
        position: staker.details,
        currentCycle: poxInfo.rewardCycleId,
      }),
    );
    const asked = intent.extendCycles ?? range.min;
    if (asked > range.max) {
      throw new StakeRefused(
        `This position can take between ${range.min} and ${range.max} more cycles.`,
      );
    }
    const cyclesToExtend = Math.max(asked, range.min);

    // Every gate the contract applies, replayed read-only. The alternative is
    // paying a fee to be told no.
    const eligible = await fetchEligibleStakeUpdate({
      staker: intent.staker,
      signerManager: intent.signerContractId,
      oldSignerManager: staker.details.signer,
      cyclesToExtend,
      amountIncrease: intent.amountUstx,
      poxInfo,
      network: 'mainnet',
    });
    if (!eligible.ok) {
      throw new StakeRefused(
        reasonList(eligible.reasons, describePox5Error),
        eligible.reasons,
      );
    }

    const tx = await buildStakeUpdate({
      signerManager: intent.signerContractId,
      oldSignerManager: staker.details.signer,
      cyclesToExtend,
      amountIncrease: intent.amountUstx,
      signerCalldata,
      network: 'mainnet',
      ...unsigned,
    });
    return contractCallFrom(
      tx,
      stakeUpdatePostConditions(
        intent.staker,
        staker.details.amountUstx + intent.amountUstx,
      ),
    );
  }

  if (intent.amountUstx <= 0n) {
    throw new StakeRefused('A first stake has to lock something.');
  }
  if (!isValidLockCycles(intent.numCycles)) {
    throw new StakeRefused('That is not a lock period pox-5 accepts.');
  }

  const startBurnHt = poxInfo.currentBurnchainBlockHeight + 1;
  const eligible = await fetchEligibleStake({
    staker: intent.staker,
    signerManager: intent.signerContractId,
    amountUstx: intent.amountUstx,
    numCycles: intent.numCycles,
    startBurnHt,
    poxInfo,
    network: 'mainnet',
  }).catch(() => null);
  if (eligible && !eligible.ok) {
    throw new StakeRefused(
      reasonList(eligible.reasons, describePox5Error),
      eligible.reasons,
    );
  }

  const tx = await buildStake({
    signerManager: intent.signerContractId,
    amountUstx: intent.amountUstx,
    numCycles: intent.numCycles,
    startBurnHt,
    signerCalldata,
    network: 'mainnet',
    ...unsigned,
  });
  return contractCallFrom(
    tx,
    stakePostConditions(intent.staker, intent.amountUstx),
  );
}

/**
 * The call that ends a stake at the close of the current cycle.
 *
 * It moves no STX today — the lock simply stops being renewed — so there is no
 * amount to ask for. The one asset it can move is custodied sBTC, which the
 * contract returns in full, so that is read and bounded rather than guessed.
 */
export async function buildUnstakeCall(opts: {
  staker: string;
  publicKey?: string;
  signerContractId: string;
}): Promise<ContractCallRequest> {
  const {
    buildUnstake,
    describePox5Error,
    fetchEligibleUnstake,
    fetchPoxInfo,
    fetchStakerCustodiedSbtc,
  } = await import('@stacks/bitcoin-staking');

  const poxInfo = await fetchPoxInfo({ network: 'mainnet' });
  const eligible = await fetchEligibleUnstake({
    staker: opts.staker,
    oldSignerManager: opts.signerContractId,
    poxInfo,
    network: 'mainnet',
  });
  if (!eligible.ok) {
    throw new StakeRefused(
      reasonList(eligible.reasons, describePox5Error),
      eligible.reasons,
    );
  }

  const custodied = await fetchStakerCustodiedSbtc({
    staker: opts.staker,
    network: 'mainnet',
  }).catch(() => 0n);

  const tx = await buildUnstake({
    oldSignerManager: opts.signerContractId,
    network: 'mainnet',
    ...unsignedFor(opts.publicKey),
  });
  return contractCallFrom(
    tx,
    unstakePostConditions({
      staker: opts.staker,
      custodiedSbtcSats: typeof custodied === 'bigint' ? custodied : 0n,
      poxContractId: poxInfo.contractId,
      sbtcContract: poxInfo.sbtcContract,
    }),
  );
}
