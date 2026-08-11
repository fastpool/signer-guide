import {
  Cl,
  ClarityType,
  fetchCallReadOnlyFunction,
  Pc,
  serializeCVBytes,
  type ClarityValue,
  type ContractIdString,
  type PostCondition,
  type TupleCV,
  type UIntCV,
} from '@stacks/transactions';

/**
 * What somebody's stake actually looks like right now, in terms a person
 * cares about: how much, with whom, and where the rewards land.
 *
 * `get-staker-info` on pox-5 answers the first two. Where the rewards go is
 * not in pox-5 at all — it is kept by the signer manager, which stores the
 * Bitcoin address you handed it as calldata when you staked. Two shapes of
 * getter are in use, and both return the same optional tuple:
 *
 *   Standard, Xverse    (get-pox-addr)      {pox-addr, max-fee}
 *   Capped Fee          (get-payout-config) {pox-addr, max-fee, min-claim}
 *
 * A contract with neither cannot pay to Bitcoin at all.
 */
export type RewardRoute =
  | {
      kind: 'bitcoin';
      /** The address the contract holds, decoded from its {version, hashbytes}. */
      address: string;
      /** Sats the payout may spend on the Bitcoin transaction that sends it. */
      maxFeeSats: bigint;
      /** Smallest payout worth sending; null when the contract has no such rule. */
      minClaimSats: bigint | null;
    }
  | { kind: 'sbtc' };

export type StakedPosition = {
  amountUstx: bigint;
  /** Contract id of the signer manager the stake is with. */
  signer: string;
  firstRewardCycle: number;
  numCycles: number;
  /**
   * What the signer they are staked with holds for them. Null means we could
   * not find out — which is not the same as sBTC, and is shown as not knowing
   * rather than as a promise about somebody's rewards.
   */
  payout: PayoutRecord | null;
};

/**
 * Which calldata a signer manager understands.
 *
 * `pox-addr` is the original two-field `{pox-addr, max-fee}`. `payout-config`
 * adds `min-claim`, a floor the staker sets so a third party cannot trigger a
 * payout so small the fee eats it. Capped Fee still accepts the two-field
 * shape, but hands it `default-min-claim` — the lowest floor it will take —
 * so building the older shape quietly gives up the setting rather than
 * failing, which is why the shape is worth knowing before staking.
 */
export type PayoutShape = 'pox-addr' | 'payout-config';

export type PayoutRecord = {
  shape: PayoutShape;
  /** What this contract currently holds for this staker. */
  route: RewardRoute;
};

const PAYOUT_GETTERS: { functionName: string; shape: PayoutShape }[] = [
  { functionName: 'get-pox-addr', shape: 'pox-addr' },
  { functionName: 'get-payout-config', shape: 'payout-config' },
];

/** `DUST_LIMIT` in .sbtc-withdrawal, mirrored by the signer manager. */
export const DUST_LIMIT_SATS = 546n;

/** The floor a payout config must clear: `min-claim > max-fee + DUST_LIMIT`. */
export function minClaimFloorSats(maxFeeSats: bigint): bigint {
  return maxFeeSats + DUST_LIMIT_SATS;
}

/** What the contract itself would pick — the lowest floor it accepts. */
export function defaultMinClaimSats(maxFeeSats: bigint): bigint {
  return minClaimFloorSats(maxFeeSats) + 1n;
}

export function isValidMinClaim(
  minClaimSats: bigint,
  maxFeeSats: bigint,
): boolean {
  return minClaimSats > minClaimFloorSats(maxFeeSats);
}

function uintOrNull(value: ClarityValue | undefined): bigint | null {
  if (value?.type !== ClarityType.UInt) return null;
  return BigInt((value as UIntCV).value);
}

/** Turns the optional payout tuple into the two cases a reader understands. */
export async function decodeRewardRoute(
  cv: ClarityValue,
  network: 'mainnet' | 'testnet' = 'mainnet',
): Promise<RewardRoute> {
  if (cv.type === ClarityType.OptionalNone) return { kind: 'sbtc' };
  if (cv.type !== ClarityType.OptionalSome) {
    throw new Error(`Unexpected payout config: ${cv.type}`);
  }

  const tuple = cv.value as TupleCV;
  if (tuple.type !== ClarityType.Tuple) {
    throw new Error('Payout config is not a tuple');
  }

  const poxAddr = tuple.value['pox-addr'];
  const maxFeeSats = uintOrNull(tuple.value['max-fee']);
  if (!poxAddr || maxFeeSats === null) {
    throw new Error('Payout config has no pox-addr and max-fee');
  }

  const { BtcAddress } = await import('@stacks/bitcoin-staking');
  return {
    kind: 'bitcoin',
    address: BtcAddress.stringify(poxAddr as TupleCV, network),
    maxFeeSats,
    minClaimSats: uintOrNull(tuple.value['min-claim']),
  };
}

/**
 * What a signer manager holds for a staker, and which calldata it speaks.
 *
 * Null when neither getter exists, which is a contract that can only pay in
 * sBTC. A getter answering `none` is a different thing — a definite "no
 * Bitcoin address on file" — and comes back as a record with an sBTC route.
 * Because a missing entry still identifies the shape, this answers for a
 * first-time staker too, before there is anything to read.
 */
export async function fetchPayoutRecord(opts: {
  staker: string;
  signer: string;
  network?: 'mainnet' | 'testnet';
}): Promise<PayoutRecord | null> {
  const network = opts.network ?? 'mainnet';
  const [contractAddress, contractName] = opts.signer.split('.');
  if (!contractAddress || !contractName) return null;

  for (const { functionName, shape } of PAYOUT_GETTERS) {
    try {
      const cv = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName,
        functionArgs: [Cl.address(opts.staker)],
        senderAddress: opts.staker,
        network,
      });
      return { shape, route: await decodeRewardRoute(cv, network) };
    } catch {
      // A contract that pays only in sBTC has neither getter, and says so by
      // refusing the call. Try the next name before giving up.
    }
  }
  return null;
}

/**
 * The calldata that tells the signer manager where to send rewards.
 *
 * A contract that understands `min-claim` is given it; one that does not gets
 * the two-field shape, because handing it a field it cannot deserialize means
 * ERR_INVALID_CALLDATA and a refused stake.
 */
export async function buildPayoutCalldata(opts: {
  shape: PayoutShape;
  btcAddress: string;
  maxFeeSats: bigint;
  minClaimSats?: bigint;
  network?: 'mainnet' | 'testnet';
}): Promise<Uint8Array> {
  const network = opts.network ?? 'mainnet';
  const { BtcAddress, buildSignerCalldata } =
    await import('@stacks/bitcoin-staking');

  if (opts.shape === 'pox-addr' || opts.minClaimSats === undefined) {
    return buildSignerCalldata({
      poxAddress: opts.btcAddress,
      maxFeeSats: opts.maxFeeSats,
      network,
    });
  }

  const { version, data } = BtcAddress.parse(opts.btcAddress, network);
  return serializeCVBytes(
    Cl.tuple({
      'pox-addr': Cl.tuple({
        version: Cl.buffer(Uint8Array.of(version)),
        hashbytes: Cl.buffer(data),
      }),
      'max-fee': Cl.uint(opts.maxFeeSats),
      'min-claim': Cl.uint(opts.minClaimSats),
    }),
  );
}

/*
 * Post conditions for the pox-5 calls this page makes.
 *
 * SIP-044 splits what pox-5 does to a staker in two, and every transaction
 * here goes out in the default deny mode, so whatever is not named below is
 * refused by the chain rather than performed:
 *
 *   staking (0x03)  the lock itself — carries an amount, guarded like STX
 *   pox (0x04)      a PoX change that leaves the lock alone — no amount at all
 *
 * The amount is the part worth pinning down. It is the only number in these
 * calls that can cost the staker more than the one they typed.
 */

/** `stake`: locks what the staker asked for, and not a microstack more. */
export function stakePostConditions(
  staker: string,
  amountUstx: bigint,
): PostCondition[] {
  return [Pc.principal(staker).willSendEq(amountUstx).ustxToLock()];
}

/**
 * `stake-update`: bounds the top-up, which is `0` for a rotation that adds
 * nothing — and `0` is worth stating, because it is then an assertion that
 * moving pools locks no further STX.
 *
 * Rotating changes no lock, so it is a PoX action rather than a staking one
 * and needs a condition of its own or deny mode refuses the call. It is
 * `mayPerform` rather than `willPerform`: whether the node counts a top-up and
 * a rotation as one action or two is not ours to assume, and a `willPerform`
 * the node never satisfies aborts a transaction the staker has already paid
 * the fee for. Nothing is given up by the weaker code — a PoX action carries
 * no amount, so the assertion would guard nothing the staker can lose.
 */
export function stakeUpdatePostConditions(
  staker: string,
  amountIncreaseUstx: bigint,
): PostCondition[] {
  return [
    Pc.principal(staker).willSendEq(amountIncreaseUstx).ustxToLock(),
    Pc.principal(staker).mayPerformPox(),
  ];
}

/**
 * `unstake`: no amount anywhere. It unlocks nothing today — it sets the
 * position to end when the cycle does — so there is nothing to bound, and
 * `willPerform` can be a real assertion rather than a guess: a transaction in
 * which the unstake did not happen is one the staker paid for and did not want.
 *
 * The one asset it can move is custodied sBTC, which the contract returns in
 * full rather than in an amount the caller names. Anyone who staked through
 * this page is STX-only and has none, so the bound is only added when there is
 * something to bound.
 */
export function unstakePostConditions(opts: {
  staker: string;
  custodiedSbtcSats: bigint;
  /** `poxInfo.contractId` — the sender of any returned sBTC. */
  poxContractId: string;
  /** `poxInfo.sbtcContract`; node-configured off mainnet, so never hardcoded. */
  sbtcContract: string;
}): PostCondition[] {
  const conditions: PostCondition[] = [
    Pc.principal(opts.staker).willPerformPox(),
  ];
  if (opts.custodiedSbtcSats > 0n) {
    conditions.push(
      Pc.principal(opts.poxContractId)
        .willSendEq(opts.custodiedSbtcSats)
        .ft(opts.sbtcContract as ContractIdString, 'sbtc-token'),
    );
  }
  return conditions;
}

/**
 * Cycles a `stake-update` has to add for the contract to accept it at all.
 *
 * pox-5 recomputes the lock period as `first + num + extend - current - 1` and
 * asserts it is at least one cycle. A staker in the last cycle of their
 * position has a tail of zero, so rotating on its own comes back
 * ERR_INVALID_NUM_CYCLES — the smallest thing that lets them move pools is to
 * carry the lock one cycle further. Everyone else extends by nothing.
 */
export function extendCyclesForUpdate(opts: {
  position: Pick<StakedPosition, 'firstRewardCycle' | 'numCycles'>;
  currentCycle: number;
}): number {
  const tail =
    opts.position.firstRewardCycle +
    opts.position.numCycles -
    opts.currentCycle -
    1;
  return tail >= 1 ? 0 : 1 - tail;
}

/**
 * Where the chain is in its cycle — the two facts a change to a stake depends
 * on. pox-5 refuses `stake-update` and `unstake` during the prepare phase, so
 * it is worth saying so before somebody fills the form in.
 */
export async function fetchCycleState(
  network: 'mainnet' | 'testnet' = 'mainnet',
): Promise<{ rewardCycleId: number; inPreparePhase: boolean }> {
  const { fetchPoxInfo, isInPreparePhase } =
    await import('@stacks/bitcoin-staking');
  const poxInfo = await fetchPoxInfo({ network });
  return {
    rewardCycleId: poxInfo.rewardCycleId,
    inPreparePhase: isInPreparePhase({
      burnHeight: poxInfo.currentBurnchainBlockHeight,
      poxInfo,
    }),
  };
}

/** Null when this address is not staking at all. */
export async function fetchStakedPosition(opts: {
  address: string;
  network?: 'mainnet' | 'testnet';
}): Promise<StakedPosition | null> {
  const network = opts.network ?? 'mainnet';
  const { fetchStakerInfo } = await import('@stacks/bitcoin-staking');
  const info = await fetchStakerInfo({ address: opts.address, network });
  if (!info.staked) return null;

  return {
    amountUstx: info.details.amountUstx,
    signer: info.details.signer,
    firstRewardCycle: info.details.firstRewardCycle,
    numCycles: info.details.numCycles,
    payout: await fetchPayoutRecord({
      staker: opts.address,
      signer: info.details.signer,
      network,
    }),
  };
}
