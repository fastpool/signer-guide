import {
  Cl,
  ClarityType,
  deserializeCV,
  fetchCallReadOnlyFunction,
  hexToCV,
  Pc,
  serializeCVBytes,
  type BufferCV,
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

/**
 * The least a payout may budget for the Bitcoin transaction that carries it.
 *
 * Not pox-5's rule — the signer contract accepts any fee, and only requires
 * that the payout floor clears the fee plus the dust limit. This one belongs
 * to the **sBTC signers**, who will not send a withdrawal whose fee is under
 * it, so a lower figure is a payout that is simply never made.
 *
 * Which is why it has to be asserted by a form rather than left to the chain:
 * a max-fee under this does not fail at stake time. It fails later, silently,
 * and the staker sees no message at all — just a reward that never arrives.
 *
 * "Current" is the word that matters: it is the signers' operating minimum,
 * not a constant in a contract, so it can move without anything in this
 * repository changing. If payouts start being refused at a fee this allows,
 * this number is the first place to look.
 */
export const MIN_PAYOUT_FEE_SATS = 1000n;

/** Whether a max-fee is worth handing to a signer contract at all. */
export function isValidMaxFee(maxFeeSats: bigint): boolean {
  return maxFeeSats >= MIN_PAYOUT_FEE_SATS;
}

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
 *
 * That amount is the position's whole locked total, not what this call adds to
 * it. The chain settled the point on a `stake-update` that extended a position
 * by a cycle and added nothing:
 *
 *   Post-condition check failure on STX staked by SPX8…: 0 SentEq 88092754445
 *
 * The call itself had returned `(ok … (amount-increase u0) (amount-ustx
 * u88092754445) …)`; the condition, written against the increase, aborted it.
 * The package README's table says otherwise — read it as the delta and every
 * top-up and every extension aborts, having cost its fee.
 */

/**
 * `stake`: locks what the staker asked for, and not a microstack more.
 *
 * The total and the amount typed are the same number here — this is the call
 * for somebody with no position, so there is nothing already locked for it to
 * be added to.
 */
export function stakePostConditions(
  staker: string,
  amountUstx: bigint,
): PostCondition[] {
  return [Pc.principal(staker).willSendEq(amountUstx).ustxToLock()];
}

/**
 * `stake-update`: bounds what the position ends up holding — the amount
 * already locked plus whatever this call adds, which for an extension or a
 * move with no top-up is the amount already locked on its own.
 *
 * `lte` rather than `eq`, because the total is read before the staker signs
 * and the transaction is checked after: an equality would abort on any drift,
 * costing a fee, and drift downwards costs the staker nothing. The direction
 * that can hurt them — more of their STX locked than they agreed to — is the
 * one this bounds.
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
  /** What the position holds after the update: locked already + the top-up. */
  totalLockedUstx: bigint,
): PostCondition[] {
  return [
    Pc.principal(staker).willSendLte(totalLockedUstx).ustxToLock(),
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
 * The longest lock pox-5 accepts, in reward cycles — `MAX_NUM_CYCLES`.
 *
 * Copied rather than imported: the staking package is loaded on demand, and
 * pulling the whole of it into the page to read one number would cost every
 * reader who never opens the dialog. `staking.test.ts` asserts the two agree.
 */
export const MAX_LOCK_CYCLES = 96;

/** What the contract will take: a whole number of cycles, at least one. */
export function isValidLockCycles(cycles: number): boolean {
  return Number.isInteger(cycles) && cycles >= 1 && cycles <= MAX_LOCK_CYCLES;
}

/**
 * How long a lock of this many cycles lasts, in units a person thinks in.
 *
 * A cycle is about two weeks, which is a fine way to say "two cycles" and a
 * useless way to say "ninety-six" — nobody holds 192 weeks in their head. So
 * short locks are weeks and long ones are months, and both are approximate
 * because the cycle is a burn-block count, not a calendar.
 */
export function lockDuration(cycles: number): {
  unit: 'weeks' | 'months';
  count: number;
} {
  if (cycles < 5) return { unit: 'weeks', count: cycles * 2 };
  return { unit: 'months', count: Math.round((cycles * 14) / 30.44) };
}

/**
 * Cycles the position still has after this one — the tail pox-5 measures.
 *
 * The contract recomputes a lock period as `first + num + extend - current - 1`
 * and asserts it is between one cycle and {@link MAX_LOCK_CYCLES}. That
 * expression is this tail plus whatever an update extends by, so every rule
 * about extending is a rule about this number. It goes negative for a position
 * that has already unlocked, which is a tail of less than nothing rather than
 * an error.
 */
export function cyclesRemaining(opts: {
  position: Pick<StakedPosition, 'firstRewardCycle' | 'numCycles'>;
  currentCycle: number;
}): number {
  return (
    opts.position.firstRewardCycle +
    opts.position.numCycles -
    opts.currentCycle -
    1
  );
}

/**
 * How far a `stake-update` may carry a position, in cycles it can add.
 *
 * The floor is what the contract insists on: a tail of zero cannot be updated
 * at all — ERR_INVALID_NUM_CYCLES — so somebody in their last cycle has to add
 * one before they can rotate or top up. The ceiling is the contract's maximum
 * lock, counted from where the position already reaches rather than from now.
 */
export function extendRange(remaining: number): { min: number; max: number } {
  const min = Math.max(0, 1 - remaining);
  return { min, max: Math.max(min, MAX_LOCK_CYCLES - remaining) };
}

/**
 * The smallest extension the contract would accept — what an update that only
 * moves pools or adds STX asks for, since it wants no more time than it has.
 */
export function extendCyclesForUpdate(opts: {
  position: Pick<StakedPosition, 'firstRewardCycle' | 'numCycles'>;
  currentCycle: number;
}): number {
  return extendRange(cyclesRemaining(opts)).min;
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
