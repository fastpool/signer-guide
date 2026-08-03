import {
  Cl,
  ClarityType,
  fetchCallReadOnlyFunction,
  serializeCVBytes,
  type ClarityValue,
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
