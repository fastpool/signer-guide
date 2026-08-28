import {
  deserializePostConditionWire,
  hexToCV,
  wireToPostCondition,
} from '@stacks/transactions';
import { buildStakeCall, buildUnstakeCall, StakeRefused } from './build-stake';
import {
  CHAIN,
  OTHER_SIGNER,
  resetChain,
  SIGNER,
  STAKER,
  staking,
} from '../test/chain';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

const BTC = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

const base = {
  staker: STAKER,
  signerContractId: SIGNER,
  amountUstx: 100_000_000n,
  numCycles: 12,
  payout: { kind: 'sbtc' } as const,
  payoutShape: 'payout-config' as const,
};

function conditions(hexes: string[]) {
  return hexes.map((hex) =>
    wireToPostCondition(deserializePostConditionWire(hex)),
  );
}

beforeEach(() => resetChain());

describe('a first stake', () => {
  it('calls pox-5 stake, not the signer manager', async () => {
    const call = await buildStakeCall(base);
    expect(call.contract).toBe('SP000000000000000000002Q6VF78.pox-5');
    expect(call.functionName).toBe('stake');
  });

  it('bounds exactly what is locked, and denies everything else', async () => {
    const call = await buildStakeCall(base);
    expect(call.postConditionMode).toBe('deny');
    const [only] = conditions(call.postConditions) as any[];
    expect(call.postConditions).toHaveLength(1);
    // SIP-044's staking kind, not the plain STX one: the amount is locked,
    // not sent.
    expect(only.type).toBe('staking-postcondition');
    expect(only.amount).toBe('100000000');
    expect(only.condition).toBe('eq');
  });

  it('refuses a stake of nothing rather than sending it', async () => {
    await expect(buildStakeCall({ ...base, amountUstx: 0n })).rejects.toThrow(
      StakeRefused,
    );
  });

  it('refuses a lock period pox-5 would not take', async () => {
    await expect(buildStakeCall({ ...base, numCycles: 97 })).rejects.toThrow(
      StakeRefused,
    );
    await expect(buildStakeCall({ ...base, numCycles: 0 })).rejects.toThrow(
      StakeRefused,
    );
  });

  it('reports the contract’s own reason when it would refuse', async () => {
    resetChain({ eligible: false, reasons: [4] });
    await expect(buildStakeCall(base)).rejects.toThrow(StakeRefused);
  });

  it('sends no calldata when rewards are to be held as sBTC', async () => {
    const call = await buildStakeCall(base);
    const last = hexToCV(call.functionArgs[call.functionArgs.length - 1]);
    expect(last.type).toBe('none');
  });

  it('sends the address, the fee cap and the floor when rewards go to bitcoin', async () => {
    const call = await buildStakeCall({
      ...base,
      payout: {
        kind: 'bitcoin',
        address: BTC,
        maxFeeSats: 3000n,
        minClaimSats: 4000n,
      },
    });
    const last = hexToCV(call.functionArgs[call.functionArgs.length - 1]);
    expect(last.type).toBe('some');
  });
});

describe('changing a stake', () => {
  it('becomes a stake-update once there is a position', async () => {
    staking();
    const call = await buildStakeCall(base);
    expect(call.functionName).toBe('stake-update');
  });

  it('bounds the whole position, not the top-up', async () => {
    // The chain settled this: a condition written against the increase aborts
    // every extension that adds nothing. 1000 STX held, 100 STX added.
    staking({ amountUstx: 1_000_000_000n });
    const call = await buildStakeCall({ ...base, amountUstx: 100_000_000n });
    const [bound, action] = conditions(call.postConditions) as any[];
    // 1000 STX already locked plus the 100 added — not the 100 on its own.
    expect(bound.amount).toBe('1100000000');
    // `lte`, because the total is read before signing and checked after:
    // drift downwards costs the staker nothing, drift upwards is what this
    // bounds.
    expect(bound.condition).toBe('lte');
    // The second is the PoX action a rotation performs; it carries no amount.
    expect(action.type).toBe('pox-postcondition');
    expect(call.postConditions).toHaveLength(2);
  });

  it('moves a position to another pool in one call', async () => {
    staking({ signer: OTHER_SIGNER });
    const call = await buildStakeCall({ ...base, amountUstx: 0n });
    expect(call.functionName).toBe('stake-update');
  });

  it('will not extend further than pox-5’s maximum lock', async () => {
    // Ends at cycle 149, current is 142, so seven cycles are left and the most
    // it can add is 96 - 7.
    staking({ firstRewardCycle: 138, numCycles: 12 });
    await expect(
      buildStakeCall({ ...base, extendCycles: 90 }),
    ).rejects.toThrow(/between/);
  });

  it('takes the least extension the contract accepts when asked for none', async () => {
    // A position with nothing left cannot be updated at all, so an update that
    // only moves pool still has to add the one cycle pox-5 insists on.
    staking({ firstRewardCycle: 131, numCycles: 12 });
    const call = await buildStakeCall({ ...base, amountUstx: 0n, extendCycles: 0 });
    expect(call.functionName).toBe('stake-update');
  });

  it('passes the contract’s refusal through instead of paying to be told no', async () => {
    staking();
    resetChain({ ...CHAIN, staked: true, eligible: false, reasons: [11] });
    await expect(buildStakeCall(base)).rejects.toThrow(StakeRefused);
  });
});

describe('unstaking', () => {
  it('asks pox-5 to end the position and bounds no amount', async () => {
    staking();
    const call = await buildUnstakeCall({ staker: STAKER, signerContractId: SIGNER });
    expect(call.functionName).toBe('unstake');
    expect(call.postConditions).toHaveLength(1);
  });

  it('bounds returned sBTC only when there is some to return', async () => {
    staking({ custodiedSbtcSats: 5_000n });
    const call = await buildUnstakeCall({ staker: STAKER, signerContractId: SIGNER });
    expect(call.postConditions).toHaveLength(2);
  });

  it('does not build one the contract would refuse', async () => {
    staking({ eligible: false, reasons: [7] });
    await expect(
      buildUnstakeCall({ staker: STAKER, signerContractId: SIGNER }),
    ).rejects.toThrow(StakeRefused);
  });
});
