/**
 * Rewards that were sent to Bitcoin, refused, and are still sitting in the
 * pool contract — and the calls that get them back.
 *
 * A signer manager pays an L1 staker by handing the whole amount to sBTC as a
 * withdrawal request, along with the `max-fee` budget the staker set. The sBTC
 * signers then either fulfil it on Bitcoin (`accept`) or refuse it (`reject`).
 * A refusal is not a loss: the sBTC stays with the pool, reserved against that
 * request, and `reclaim-failed-withdrawal` hands `amount + max-fee` back to
 * the staker as sBTC on Stacks. But nothing calls it on its own. Until
 * somebody does, the money is stuck — reported as neither pending payout nor
 * refund, because it is neither.
 *
 * A cap set too low is the usual cause. `check-payout-config` polices only
 * `min-claim > max-fee + DUST_LIMIT`, so a fee budget no Bitcoin transaction
 * could ever be built with passes every check on the Stacks side and fails on
 * the Bitcoin side, one cycle after the staker has forgotten about it.
 *
 * What this finds is exactly what `reclaim-failed-withdrawal` will accept:
 *
 *   the registry says   `status` is `(some false)` — rejected, not pending
 *                       and not accepted
 *   the pool says       `get-withdrawal-request-staker` still names somebody,
 *                       so the entry has not already been reclaimed
 *
 * The call is permissionless and pays the staker whoever sends it, so one
 * operator can recover for everybody. It is also order-independent: the
 * refund is `amount + max-fee` read straight off the request, not inferred
 * from a balance the way `settle-accepted-withdrawal` has to. That one has a
 * documented ordering caveat; this one has none, so a plan of them can be
 * batched however it suits.
 *
 * Not in scope: an *accepted* withdrawal that nobody has settled. Those were
 * distributions that worked — the staker has their Bitcoin — and only the
 * unused fee budget is outstanding. That is `settle-accepted-withdrawal`
 * followed by `claim-refund`, a different remedy with a different risk.
 *
 * Unlike `locked.ts`, this reaches for `@stacks/transactions` rather than the
 * hand-rolled `src/lib/clarity.ts`. Nothing here is shared with the browser,
 * so the half-megabyte that rules out in the bundle costs nothing in a build
 * script — and a withdrawal request is a six-field tuple with an optional
 * bool in it, which is not a thing to hand-roll a parser for when somebody's
 * money is on the other end of getting it wrong.
 */

import {
  Cl,
  ClarityType,
  type ClarityValue,
  type TupleCV,
} from '@stacks/transactions';
import { API_URL, SPACING_MS } from './node.js';
import { callReadOnly, readDataVar, sleep } from './read-only.js';

/** Where every withdrawal request lives, whoever asked for it. */
export const SBTC_REGISTRY = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry';

/** One rejected payout, and everything needed to write the call that undoes it. */
export type FailedDistribution = {
  /** The sBTC withdrawal request id, the sole argument of the reclaim. */
  requestId: number;
  /** Signer manager holding the money — the contract the call goes to. */
  pool: string;
  /** Who it is owed to. The reclaim pays them whoever sends it. */
  staker: string;
  /** What sBTC would have sent to Bitcoin. */
  amountSats: bigint;
  /** The fee budget that went with it, and never got spent. */
  maxFeeSats: bigint;
  /** `amount + max-fee` — what `reclaim-failed-withdrawal` transfers back. */
  recoverableSats: bigint;
};

/** A rejected request we found but could not finish checking, and why. */
export type SkippedRequest = {
  requestId: number;
  sender: string;
  reason: 'unreadable-pool' | 'already-reclaimed';
};

export type Scan = {
  found: FailedDistribution[];
  skipped: SkippedRequest[];
  /** The range actually walked, so a later run can pick up where this left off. */
  fromId: number;
  toId: number;
};

/** The highest request id the registry has issued; null if unreadable. */
export async function fetchLastRequestId(): Promise<number | null> {
  const cv = await readDataVar(SBTC_REGISTRY, 'last-withdrawal-request-id');
  return cv?.type === ClarityType.UInt ? Number(cv.value) : null;
}

type WithdrawalRequest = {
  sender: string;
  amountSats: bigint;
  maxFeeSats: bigint;
  /** null while pending, true once fulfilled on Bitcoin, false once refused. */
  status: boolean | null;
};

function readWithdrawalRequest(cv: ClarityValue): WithdrawalRequest | null {
  if (cv.type !== ClarityType.OptionalSome) return null;
  const tuple = cv.value as TupleCV;
  if (tuple.type !== ClarityType.Tuple) return null;

  const sender = tuple.value['sender'];
  const amount = tuple.value['amount'];
  const maxFee = tuple.value['max-fee'];
  const status = tuple.value['status'];
  if (
    sender?.type !== ClarityType.PrincipalContract &&
    sender?.type !== ClarityType.PrincipalStandard
  ) {
    return null;
  }
  if (amount?.type !== ClarityType.UInt || maxFee?.type !== ClarityType.UInt) {
    return null;
  }

  return {
    sender: sender.value,
    amountSats: BigInt(amount.value),
    maxFeeSats: BigInt(maxFee.value),
    status:
      status?.type === ClarityType.OptionalSome
        ? (status.value as { type: ClarityType }).type === ClarityType.BoolTrue
        : null,
  };
}

/**
 * Who the pool still owes for this request, or null.
 *
 * The same `map-get?` the reclaim itself unwraps first. An entry that is gone
 * means somebody already reclaimed or settled it; a contract with no such
 * getter is not one of ours and answers nothing.
 */
async function fetchOwedStaker(
  pool: string,
  requestId: number,
): Promise<string | null> {
  const cv = await callReadOnly(pool, 'get-withdrawal-request-staker', [
    Cl.uint(requestId),
  ]);
  if (cv?.type !== ClarityType.OptionalSome) return null;
  const staker = cv.value as ClarityValue;
  if (
    staker.type !== ClarityType.PrincipalStandard &&
    staker.type !== ClarityType.PrincipalContract
  ) {
    return null;
  }
  return staker.value as string;
}

/**
 * Every rejected payout in the range that is still there to be reclaimed.
 *
 * Walks the registry request by request. There is no index of rejections and
 * no way to ask for one, so completeness costs one call per id — the reason
 * this is a build-time script paced by `node.ts` and not something the page
 * does. `fromId` is what makes a second run cheap: rejections do not come
 * back to life, so a range already cleared need never be walked again.
 */
export async function findFailedDistributions(opts: {
  fromId?: number;
  toId?: number;
  /** Called with each id as it is read, for a progress line. */
  onProgress?: (id: number, toId: number, found: number) => void;
}): Promise<Scan | null> {
  const toId = opts.toId ?? (await fetchLastRequestId());
  if (toId === null) return null;
  const fromId = Math.max(1, opts.fromId ?? 1);

  const found: FailedDistribution[] = [];
  const skipped: SkippedRequest[] = [];

  for (let requestId = fromId; requestId <= toId; requestId += 1) {
    opts.onProgress?.(requestId, toId, found.length);
    await sleep(SPACING_MS);

    const cv = await callReadOnly(SBTC_REGISTRY, 'get-withdrawal-request', [
      Cl.uint(requestId),
    ]);
    if (cv === null) {
      skipped.push({ requestId, sender: '', reason: 'unreadable-pool' });
      continue;
    }

    const request = readWithdrawalRequest(cv);
    // Only a definite refusal is reclaimable. Pending is not yet decided, and
    // accepted means the staker got their Bitcoin.
    if (!request || request.status !== false) continue;
    // A person's own sBTC withdrawal is theirs to deal with; only a pool
    // contract holds money on somebody else's behalf.
    if (!request.sender.includes('.')) continue;

    await sleep(SPACING_MS);
    const staker = await fetchOwedStaker(request.sender, requestId);
    if (staker === null) {
      // Either already reclaimed, or a contract that keeps no such map. Both
      // are "nothing to do here", but worth counting rather than hiding.
      skipped.push({
        requestId,
        sender: request.sender,
        reason: 'already-reclaimed',
      });
      continue;
    }

    found.push({
      requestId,
      pool: request.sender,
      staker,
      amountSats: request.amountSats,
      maxFeeSats: request.maxFeeSats,
      recoverableSats: request.amountSats + request.maxFeeSats,
    });
  }

  return { found, skipped, fromId, toId };
}

export type PlanOptions = {
  /**
   * Who signs. Undefined means each staker signs their own reclaim, which is
   * honest about whose money it is but needs as many keys as there are
   * stakers. An operator address here makes the whole plan executable by one
   * — the contract pays the staker either way.
   */
  sender?: string;
  /** Fee per transaction, µSTX. */
  cost?: number;
  /** Transactions per batch; a batch is a block. */
  batchSize?: number;
  epoch?: string;
  network?: string;
  stacksNode?: string;
  name?: string;
};

const DEFAULTS = {
  /** What the pool's own `claim-staker-rewards` calls have been paying. */
  cost: 1_500,
  batchSize: 25,
  /** Live mainnet epoch. An older Clarinet may only know 3.x — pass --epoch. */
  epoch: '4.0',
  network: 'mainnet',
  name: 'Recover failed sBTC distributions',
};

const groupThousands = (value: bigint) =>
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** YAML plain scalars are fine for principals and digits; quote the rest. */
function scalar(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._/:-]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

/**
 * A Clarinet deployment plan, one `reclaim-failed-withdrawal` per rejection.
 *
 * Pure: it takes the scan and returns the file. Everything that could be
 * wrong about the plan can therefore be tested without a node, which matters
 * for a file whose whole job is to be applied to mainnet.
 *
 * Each transaction carries a comment naming the request, the staker and the
 * sats, because a plan nobody can read before running it is not a safeguard.
 */
export function buildRecoveryPlan(
  found: FailedDistribution[],
  options: PlanOptions = {},
): string {
  const cost = options.cost ?? DEFAULTS.cost;
  const batchSize = Math.max(1, options.batchSize ?? DEFAULTS.batchSize);
  const epoch = options.epoch ?? DEFAULTS.epoch;
  const network = options.network ?? DEFAULTS.network;
  const stacksNode = options.stacksNode ?? API_URL;
  const name = options.name ?? DEFAULTS.name;

  // Deterministic, so re-running against an unchanged chain gives an
  // unchanged file and a diff means something actually moved.
  const ordered = [...found].sort((a, b) => a.requestId - b.requestId);

  const lines: string[] = [
    '---',
    'id: 0',
    `name: ${scalar(name)}`,
    `network: ${scalar(network)}`,
    `stacks-node: ${JSON.stringify(stacksNode)}`,
    'bitcoin-node: ""',
    'plan:',
    '  batches:',
  ];

  if (ordered.length === 0) {
    lines.push('    []');
    return `${lines.join('\n')}\n`;
  }

  for (let start = 0, batchId = 0; start < ordered.length; start += batchSize) {
    const batch = ordered.slice(start, start + batchSize);
    lines.push(`    - id: ${batchId}`, '      transactions:');

    for (const entry of batch) {
      lines.push(
        `        # request ${entry.requestId} · ` +
          `${groupThousands(entry.recoverableSats)} sats back to ${entry.staker}`,
        '        - contract-call:',
        `            contract-id: ${scalar(entry.pool)}`,
        `            expected-sender: ${scalar(options.sender ?? entry.staker)}`,
        '            method: reclaim-failed-withdrawal',
        '            parameters:',
        `              - u${entry.requestId}`,
        `            cost: ${cost}`,
      );
    }

    lines.push(`      epoch: ${JSON.stringify(epoch)}`);
    batchId += 1;
  }

  return `${lines.join('\n')}\n`;
}

/** Totals per pool, for the summary a person reads before running the plan. */
export function summarise(
  found: FailedDistribution[],
): { pool: string; count: number; sats: bigint }[] {
  const byPool = new Map<string, { count: number; sats: bigint }>();
  for (const entry of found) {
    const row = byPool.get(entry.pool) ?? { count: 0, sats: 0n };
    row.count += 1;
    row.sats += entry.recoverableSats;
    byPool.set(entry.pool, row);
  }
  return [...byPool.entries()]
    .map(([pool, row]) => ({ pool, ...row }))
    .sort((a, b) => (b.sats > a.sats ? 1 : b.sats < a.sats ? -1 : 0));
}
