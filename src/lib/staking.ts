import {
  Cl,
  ClarityType,
  deserializeCV,
  fetchCallReadOnlyFunction,
  hexToCV,
  serializeCVBytes,
  type BufferCV,
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
  /**
   * The calldata they themselves sent, read back off the chain. Null when no
   * stake or stake-update of theirs could be found to read it from.
   */
  userData: UserData | null;
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
 * The user data — pox-5 calls it `signer-calldata` — is not stored in pox-5.
 *
 * pox-5 takes it as the last argument of `stake` / `stake-update` and hands it
 * straight to the signer manager's `validate-stake!`; it keeps no map for it,
 * prints it in no event, and `get-staker-info` does not carry it. What
 * survives on chain is whatever the signer manager chose to keep — for
 * fastpool's, the parsed tuple in its own `payout-configs` map, which is what
 * `fetchPayoutRecord` above reads.
 *
 * So to show what the *person* sent, rather than what the pool made of it, the
 * only source is the transaction itself. That is the difference worth showing:
 * a v1-shaped calldata carries no `min-claim`, and the pool silently fills in
 * `default-min-claim`, so the stored config and the sent bytes disagree.
 *
 * The type to decode it against comes from the signer manager, not pox-5 —
 * `parse-payout-calldata` accepts exactly two shapes and nothing else:
 *
 *   {pox-addr: {version, hashbytes}, max-fee, min-claim}   this contract's
 *   {pox-addr: {version, hashbytes}, max-fee}              v1's, given a default
 */

const POX5_CONTRACT = {
  mainnet: 'SP000000000000000000002Q6VF78.pox-5',
  testnet: 'ST000000000000000000002AMW42H.pox-5',
} as const;

/** The two pox-5 entry points a staker hands calldata to. */
const CALLDATA_FUNCTIONS = new Set(['stake', 'stake-update']);

export const DEFAULT_API_URL = 'https://api.hiro.so';

export type UserData = {
  /** The transaction the bytes were read out of. */
  txId: string;
  /** `stake` or `stake-update`, whichever last carried calldata. */
  functionName: string;
  /** The `(optional (buff 500))` argument as sent, hex. */
  hex: string;
  /**
   * Which of the two calldata shapes was sent. Null when `none` was sent,
   * which carries no shape and tells the pool to forget any address on file.
   */
  shape: PayoutShape | null;
  /** What those bytes ask for. */
  route: RewardRoute;
};

/**
 * The `signer-calldata` argument of a stake transaction, decoded.
 *
 * Takes the argument hex as the chain records it — the `(optional (buff 500))`
 * wrapper included, because `none` is a meaningful answer here and not a
 * missing one: it is how a staker asks to be paid in sBTC.
 *
 * Deliberately reports `minClaimSats: null` for the two-field shape rather
 * than substituting the pool's `default-min-claim`. This is what the person
 * sent; what the pool stored is `fetchPayoutRecord`'s job to say.
 */
export async function decodeUserData(
  hex: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
): Promise<{ shape: PayoutShape | null; route: RewardRoute }> {
  const cv = hexToCV(hex);
  if (cv.type === ClarityType.OptionalNone) {
    return { shape: null, route: { kind: 'sbtc' } };
  }
  if (cv.type !== ClarityType.OptionalSome) {
    throw new Error(`User data is not an optional: ${cv.type}`);
  }

  const buffer = cv.value as BufferCV;
  if (buffer.type !== ClarityType.Buffer) {
    throw new Error('User data is not a buffer');
  }

  const tuple = deserializeCV(buffer.value);
  if (tuple.type !== ClarityType.Tuple) {
    throw new Error('User data is not a tuple');
  }

  return {
    // Same test the contract makes, from the other side: three fields are
    // this contract's shape, two are v1's, and nothing else parses at all.
    shape:
      'min-claim' in (tuple as TupleCV).value ? 'payout-config' : 'pox-addr',
    route: await decodeRewardRoute(Cl.some(tuple), network),
  };
}

type ApiFunctionArg = { hex: string };

type ApiTransaction = {
  tx_id: string;
  tx_status: string;
  tx_type: string;
  contract_call?: {
    contract_id: string;
    function_name: string;
    function_args?: ApiFunctionArg[];
  };
};

/** How far back to look before giving up; 50 is the API's page size. */
const USER_DATA_PAGE_SIZE = 50;
const USER_DATA_MAX_PAGES = 4;

/**
 * What this address last sent pox-5 as calldata, decoded.
 *
 * Walks their transactions newest-first for a successful `stake` or
 * `stake-update` and reads its last argument, which is `signer-calldata` in
 * both. The list endpoint returns argument names empty, so it goes by
 * position rather than by name.
 *
 * Null rather than throwing when there is nothing to read — an old stake past
 * the pages we look at, an address that staked through a contract, or an API
 * that will not answer. Not knowing is shown as not knowing.
 */
export async function fetchUserData(opts: {
  address: string;
  network?: 'mainnet' | 'testnet';
  apiUrl?: string;
}): Promise<UserData | null> {
  const network = opts.network ?? 'mainnet';
  const apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
  const poxContract = POX5_CONTRACT[network];

  for (let page = 0; page < USER_DATA_MAX_PAGES; page += 1) {
    const url =
      `${apiUrl}/extended/v2/addresses/${encodeURIComponent(opts.address)}` +
      `/transactions?limit=${USER_DATA_PAGE_SIZE}` +
      `&offset=${page * USER_DATA_PAGE_SIZE}`;

    let results: { tx: ApiTransaction }[];
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      results = ((await response.json()) as { results?: { tx: ApiTransaction }[] })
        .results ?? [];
    } catch {
      return null;
    }
    if (results.length === 0) return null;

    for (const { tx } of results) {
      const call = tx?.contract_call;
      if (
        tx?.tx_status !== 'success' ||
        call?.contract_id !== poxContract ||
        !CALLDATA_FUNCTIONS.has(call.function_name)
      ) {
        continue;
      }
      const args = call.function_args ?? [];
      const calldata = args[args.length - 1];
      if (!calldata) return null;

      try {
        const { shape, route } = await decodeUserData(calldata.hex, network);
        return {
          txId: tx.tx_id,
          functionName: call.function_name,
          hex: calldata.hex,
          shape,
          route,
        };
      } catch {
        // Bytes we cannot make sense of are worth no guess. The transaction
        // succeeded, so the pool understood them; we simply do not.
        return null;
      }
    }
  }
  return null;
}

/** Null when this address is not staking at all. */
export async function fetchStakedPosition(opts: {
  address: string;
  network?: 'mainnet' | 'testnet';
  apiUrl?: string;
}): Promise<StakedPosition | null> {
  const network = opts.network ?? 'mainnet';
  const { fetchStakerInfo } = await import('@stacks/bitcoin-staking');
  const info = await fetchStakerInfo({ address: opts.address, network });
  if (!info.staked) return null;

  // Independent questions of two different sources — what the pool holds, and
  // what the person sent — so they are asked at the same time.
  const [payout, userData] = await Promise.all([
    fetchPayoutRecord({
      staker: opts.address,
      signer: info.details.signer,
      network,
    }),
    fetchUserData({ address: opts.address, network, apiUrl: opts.apiUrl }),
  ]);

  return {
    amountUstx: info.details.amountUstx,
    signer: info.details.signer,
    firstRewardCycle: info.details.firstRewardCycle,
    numCycles: info.details.numCycles,
    payout,
    userData,
  };
}
