/**
 * What one address is owed in sBTC, asked of the chain when somebody asks.
 *
 * The rewards pages until now have been about the pool: what a cycle paid per
 * 1000 STX, what is waiting at pox-5 for each signer. This is the same question
 * from the other end — *mine* — and it cannot come from a committed file for
 * the same reason the status page cannot: nobody knows the address until it is
 * typed in.
 *
 * There are two places a staker's sBTC can be sitting, and the difference
 * decides what they have to do about it:
 *
 *   at pox-5     `get-earned-staker-rewards(signer, cycle, none, staker)`.
 *                Theirs, per cycle, and only they can move it — the claim
 *                reads `tx-sender`, so no operator can sweep it out for them.
 *   at the pool  once a signer runs `claim-rewards`, that cycle's sBTC is in
 *                the manager and pox-5 shows the staker nothing. Where it goes
 *                next depends on the implementation, so the manager is asked
 *                by name for the two getters that exist.
 *
 * Both are asked, because either alone can read as "you are owed nothing" when
 * the truth is "it has moved". A getter a contract does not have is not a zero
 * and is reported as absent, and a call that would not answer is reported as
 * unread — this page must never tell somebody their rewards are gone because
 * an endpoint was busy.
 */

import { Cl, fetchCallReadOnlyFunction, ClarityType } from '@stacks/transactions';

const POX5 = 'SP000000000000000000002Q6VF78.pox-5';

/** The per-staker getters a manager may publish, in the order they are tried. */
const POOL_GETTERS = ['get-unclaimed-staker-rewards', 'get-pending-payout'];

export interface CycleReward {
  cycle: number;
  /** Sats pox-5 is holding for this staker, or null when it would not say. */
  sats: bigint | null;
}

export interface AddressRewards {
  address: string;
  /** The signer contract they are with, from their pox-5 position. */
  signer: string | null;
  /** Per cycle, what pox-5 still owes them. Empty when they stake with nobody. */
  atPox5: CycleReward[];
  /** What the manager says it holds for them, when it publishes a getter. */
  atPool: { getter: string; sats: bigint } | null;
  /** True when every read that was tried came back. */
  complete: boolean;
}

function uintOf(cv: { type: string; value?: unknown }): bigint | null {
  return cv.type === ClarityType.UInt ? BigInt(cv.value as bigint) : null;
}

async function readUint(opts: {
  contract: string;
  functionName: string;
  args: ReturnType<typeof Cl.uint>[] | ReturnType<typeof Cl.address>[];
  sender: string;
  apiUrl?: string;
}): Promise<bigint | null> {
  const [contractAddress, contractName] = opts.contract.split('.');
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: opts.functionName,
      functionArgs: opts.args,
      senderAddress: opts.sender,
      network: 'mainnet',
    });
    return uintOf(cv as { type: string; value?: unknown });
  } catch {
    // A contract with no such function answers the same way as a node that
    // would not talk to us. The caller keeps them apart by what it asked.
    return null;
  }
}

/**
 * The first reward cycle pox-5 has, so a page knows how far back to ask.
 *
 * Asked rather than assumed: cycles before it have no pox-5 rewards for
 * anybody, and a page that asked about them would print a row of zeros that
 * reads as "you earned nothing" for a cycle nobody could have earned in.
 */
export async function readFirstPox5Cycle(): Promise<number | null> {
  const answer = await readUint({
    contract: POX5,
    functionName: 'get-first-pox-5-reward-cycle',
    args: [] as never,
    sender: POX5.split('.')[0],
  });
  return answer === null ? null : Number(answer);
}

/** What pox-5 holds for one staker, cycle by cycle. */
export async function readPox5Rewards(opts: {
  staker: string;
  signer: string;
  cycles: number[];
  spacingMs?: number;
  onCycle?: (reward: CycleReward) => void;
}): Promise<CycleReward[]> {
  const rewards: CycleReward[] = [];
  for (const cycle of opts.cycles) {
    const sats = await readUint({
      contract: POX5,
      functionName: 'get-earned-staker-rewards',
      args: [
        Cl.address(opts.signer),
        Cl.uint(cycle),
        Cl.none(),
        Cl.address(opts.staker),
      ] as never,
      sender: opts.staker,
    });
    const reward = { cycle, sats };
    rewards.push(reward);
    opts.onCycle?.(reward);
    if (opts.spacingMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.spacingMs));
    }
  }
  return rewards;
}

/**
 * What the signer manager itself is holding for one staker.
 *
 * Probed rather than assumed: the Standard contract publishes
 * `get-unclaimed-staker-rewards`, the Capped Fee one also settles into
 * `get-pending-payout`, and the pox5-direct managers publish neither because
 * they keep no per-staker books at all. Null is "this contract does not say",
 * which is not the same as nothing and is shown as such.
 */
export async function readPoolRewards(opts: {
  staker: string;
  signer: string;
  spacingMs?: number;
}): Promise<{ getter: string; sats: bigint } | null> {
  for (const getter of POOL_GETTERS) {
    const sats = await readUint({
      contract: opts.signer,
      functionName: getter,
      args: [Cl.address(opts.staker)] as never,
      sender: opts.staker,
    });
    if (opts.spacingMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.spacingMs));
    }
    if (sats !== null && sats > 0n) return { getter, sats };
  }
  return null;
}

/** Everything owed to one address, from both places it can be. */
export async function readAddressRewards(opts: {
  address: string;
  signer: string | null;
  cycles: number[];
  spacingMs?: number;
}): Promise<AddressRewards> {
  if (!opts.signer) {
    return {
      address: opts.address,
      signer: null,
      atPox5: [],
      atPool: null,
      complete: true,
    };
  }

  const atPox5 = await readPox5Rewards({
    staker: opts.address,
    signer: opts.signer,
    cycles: opts.cycles,
    spacingMs: opts.spacingMs,
  });
  const atPool = await readPoolRewards({
    staker: opts.address,
    signer: opts.signer,
    spacingMs: opts.spacingMs,
  });

  return {
    address: opts.address,
    signer: opts.signer,
    atPox5,
    atPool,
    complete: atPox5.every((reward) => reward.sats !== null),
  };
}

/** What the cycles add up to, or null when any of them went unread. */
export function totalAtPox5(rewards: CycleReward[]): bigint | null {
  let total = 0n;
  for (const reward of rewards) {
    // One unread cycle makes the total unknown rather than low: a number that
    // is short by a cycle is worse than saying plainly that we do not know.
    if (reward.sats === null) return null;
    total += reward.sats;
  }
  return total;
}
