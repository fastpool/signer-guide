/**
 * A chain that answers, without one being there.
 *
 * Only the *reads* are faked. Every builder, every post condition and every
 * rule about what pox-5 will accept is the real package doing the real thing —
 * which is the point: a test that mocked `buildStake` would prove that the
 * mock returns what the mock returns.
 */

export const POX_INFO = {
  contractId: 'SP000000000000000000002Q6VF78.pox-5',
  sbtcContract: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  rewardCycleId: 142,
  currentBurnchainBlockHeight: 964_351,
  firstBurnchainBlockHeight: 666_050,
  rewardCycleLength: 2100,
  prepareCycleLength: 100,
  preparePhaseStartBlockHeight: 965_200,
  rewardPhaseStartBlockHeight: 963_100,
} as const;

export const STAKER = 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR';
export const SIGNER = 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager';
export const OTHER_SIGNER = 'SP1RWRWKM2364FY3XZTWFFK8K4MVBQYQX5V1E2KVC.signer-manager';

export type FakeChain = {
  staked: boolean;
  amountUstx: bigint;
  signer: string;
  firstRewardCycle: number;
  numCycles: number;
  eligible: boolean;
  reasons: number[];
  custodiedSbtcSats: bigint;
};

export const CHAIN: FakeChain = {
  staked: false,
  amountUstx: 0n,
  signer: SIGNER,
  firstRewardCycle: 142,
  numCycles: 12,
  eligible: true,
  reasons: [],
  custodiedSbtcSats: 0n,
};

export function resetChain(overrides: Partial<FakeChain> = {}): void {
  Object.assign(CHAIN, {
    staked: false,
    amountUstx: 0n,
    signer: SIGNER,
    firstRewardCycle: 142,
    numCycles: 12,
    eligible: true,
    reasons: [],
    custodiedSbtcSats: 0n,
  }, overrides);
}

/** Puts an address in the middle of a twelve-cycle lock. */
export function staking(overrides: Partial<FakeChain> = {}): void {
  resetChain({
    staked: true,
    amountUstx: 100_000_000_000n,
    firstRewardCycle: 138,
    numCycles: 12,
    ...overrides,
  });
}

/** The mock factory, shared by every suite that needs a chain. */
export function stakingPackageMock() {
  const actual = jest.requireActual('@stacks/bitcoin-staking');
  const eligibility = () =>
    Promise.resolve(
      CHAIN.eligible
        ? { ok: true, reasons: [] }
        : { ok: false, reasons: CHAIN.reasons },
    );

  return {
    ...actual,
    fetchPoxInfo: jest.fn(async () => POX_INFO),
    fetchStakerInfo: jest.fn(async () => ({
      staked: CHAIN.staked,
      details: {
        amountUstx: CHAIN.amountUstx,
        signer: CHAIN.signer,
        firstRewardCycle: CHAIN.firstRewardCycle,
        numCycles: CHAIN.numCycles,
      },
    })),
    fetchEligibleStake: jest.fn(eligibility),
    fetchEligibleStakeUpdate: jest.fn(eligibility),
    fetchEligibleUnstake: jest.fn(eligibility),
    fetchStakerCustodiedSbtc: jest.fn(async () => CHAIN.custodiedSbtcSats),
  };
}
