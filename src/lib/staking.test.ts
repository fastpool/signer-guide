import { BtcAddress, parseSignerCalldata } from '@stacks/bitcoin-staking';
import { Cl, deserializeCV } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import {
  buildPayoutCalldata,
  decodeRewardRoute,
  defaultMinClaimSats,
  DUST_LIMIT_SATS,
  extendCyclesForUpdate,
  isValidMinClaim,
  minClaimFloorSats,
  stakePostConditions,
  stakeUpdatePostConditions,
  unstakePostConditions,
} from './staking';

/*
 * The payout tuple is the one piece of a staker's own data the page decodes
 * itself, so these pin the shapes both signer contracts return. They are built
 * with the same library the contract's calldata was built with, so a change in
 * either end shows up here.
 */

const P2WPKH = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const P2TR = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';

/** The `{version, hashbytes}` tuple a signer manager stores. */
function poxAddrTuple(btcAddress: string) {
  const repr = BtcAddress.parse(btcAddress, 'mainnet');
  return Cl.tuple({
    version: Cl.buffer(Uint8Array.from([repr.version])),
    hashbytes: Cl.buffer(repr.data),
  });
}

describe('decodeRewardRoute', () => {
  it('reads none as rewards arriving in sBTC', async () => {
    // The contract deletes the entry when you stake without a Bitcoin
    // address, so none is a definite answer, not a missing one.
    await expect(decodeRewardRoute(Cl.none())).resolves.toEqual({
      kind: 'sbtc',
    });
  });

  it('decodes the get-pox-addr shape back to the address the staker gave', async () => {
    const cv = Cl.some(
      Cl.tuple({ 'pox-addr': poxAddrTuple(P2WPKH), 'max-fee': Cl.uint(3000) }),
    );
    await expect(decodeRewardRoute(cv)).resolves.toEqual({
      kind: 'bitcoin',
      address: P2WPKH,
      maxFeeSats: 3000n,
      minClaimSats: null,
    });
  });

  it('decodes the get-payout-config shape, min-claim and all', async () => {
    const cv = Cl.some(
      Cl.tuple({
        'pox-addr': poxAddrTuple(P2TR),
        'max-fee': Cl.uint(5000),
        'min-claim': Cl.uint(20_000),
      }),
    );
    await expect(decodeRewardRoute(cv)).resolves.toEqual({
      kind: 'bitcoin',
      address: P2TR,
      maxFeeSats: 5000n,
      minClaimSats: 20_000n,
    });
  });

  it('handles the address kinds the contract accepts', async () => {
    for (const address of [P2PKH, P2WPKH, P2TR]) {
      const cv = Cl.some(
        Cl.tuple({ 'pox-addr': poxAddrTuple(address), 'max-fee': Cl.uint(1) }),
      );
      const route = await decodeRewardRoute(cv);
      expect(route).toMatchObject({ kind: 'bitcoin', address });
    }
  });

  it('refuses a tuple it does not recognise rather than inventing an address', async () => {
    await expect(
      decodeRewardRoute(Cl.some(Cl.tuple({ 'max-fee': Cl.uint(1) }))),
    ).rejects.toThrow();
    await expect(decodeRewardRoute(Cl.uint(1))).rejects.toThrow();
  });
});

describe('the min-claim floor', () => {
  /*
   * `check-payout-config` asserts `min-claim > max-fee + DUST_LIMIT`, so a
   * payout that clears the floor also clears sBTC's dust limit. Getting this
   * wrong costs the staker a transaction fee for a rejected stake.
   */
  it('matches the bound the contract asserts', () => {
    expect(DUST_LIMIT_SATS).toBe(546n);
    expect(minClaimFloorSats(2000n)).toBe(2546n);
    expect(isValidMinClaim(2546n, 2000n)).toBe(false);
    expect(isValidMinClaim(2547n, 2000n)).toBe(true);
  });

  it('defaults to the same value the contract would pick itself', () => {
    // `default-min-claim` is `max-fee + DUST_LIMIT + 1`: what a staker whose
    // calldata carries no floor is given.
    expect(defaultMinClaimSats(2000n)).toBe(2547n);
    expect(isValidMinClaim(defaultMinClaimSats(7n), 7n)).toBe(true);
  });
});

describe('post conditions', () => {
  /*
   * These transactions go out in deny mode, so a missing condition is not a
   * missing safeguard — it is a transaction the chain aborts after the staker
   * has paid its fee. A wrong bound costs the same.
   */
  const STAKER = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
  const POX5 = 'SP000000000000000000002Q6VF78.pox-5';
  const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';

  it('bounds a stake by exactly what the staker typed', () => {
    expect(stakePostConditions(STAKER, 1_500_000n)).toEqual([
      {
        type: 'staking-postcondition',
        address: STAKER,
        condition: 'eq',
        amount: '1500000',
      },
    ]);
  });

  it('covers the rotation an update performs alongside the lock', () => {
    // Without the PoX condition, deny mode has nothing to say about moving
    // pools — which is the one thing a rotation actually does.
    expect(stakeUpdatePostConditions(STAKER, 500_000n)).toEqual([
      {
        type: 'staking-postcondition',
        address: STAKER,
        condition: 'eq',
        amount: '500000',
      },
      { type: 'pox-postcondition', address: STAKER, condition: 'may-perform' },
    ]);
  });

  it('asserts a move with no top-up locks nothing further', () => {
    const [staking] = stakeUpdatePostConditions(STAKER, 0n);
    expect(staking).toMatchObject({ condition: 'eq', amount: '0' });
  });

  it('asks unstake for no amount at all, only that it happened', () => {
    expect(
      unstakePostConditions({
        staker: STAKER,
        custodiedSbtcSats: 0n,
        poxContractId: POX5,
        sbtcContract: SBTC,
      }),
    ).toEqual([
      { type: 'pox-postcondition', address: STAKER, condition: 'will-perform' },
    ]);
  });

  it('bounds the sBTC an unstake returns, when there is any', () => {
    // The contract is the sender here, not the staker.
    expect(
      unstakePostConditions({
        staker: STAKER,
        custodiedSbtcSats: 100_000n,
        poxContractId: POX5,
        sbtcContract: SBTC,
      })[1],
    ).toEqual({
      type: 'ft-postcondition',
      address: POX5,
      condition: 'eq',
      amount: '100000',
      asset: `${SBTC}::sbtc-token`,
    });
  });
});

describe('extendCyclesForUpdate', () => {
  /*
   * pox-5 recomputes the lock period as `first + num + extend - current - 1`
   * and refuses anything below one cycle, so somebody in their last cycle
   * cannot move pools without this.
   */
  it('adds nothing while the position has cycles left', () => {
    const position = { firstRewardCycle: 100, numCycles: 6 };
    expect(extendCyclesForUpdate({ position, currentCycle: 100 })).toBe(0);
    // Tail of one: the last cycle in which a plain rotation still works.
    expect(extendCyclesForUpdate({ position, currentCycle: 104 })).toBe(0);
  });

  it('carries the lock one cycle further in the final cycle', () => {
    const position = { firstRewardCycle: 100, numCycles: 6 };
    expect(extendCyclesForUpdate({ position, currentCycle: 105 })).toBe(1);
  });

  it('reaches the one cycle the contract wants from further behind', () => {
    const position = { firstRewardCycle: 100, numCycles: 1 };
    // Whatever the shortfall, the period it asks for comes out at one.
    for (const currentCycle of [100, 101, 104]) {
      const extend = extendCyclesForUpdate({ position, currentCycle });
      expect(
        position.firstRewardCycle +
          position.numCycles +
          extend -
          currentCycle -
          1,
      ).toBe(1);
    }
  });
});

describe('buildPayoutCalldata', () => {
  it('builds the two-field shape for a contract that knows no floor', async () => {
    // Handing an older signer a field it cannot deserialize is
    // ERR_INVALID_CALLDATA and a refused stake, so the floor is dropped.
    const calldata = await buildPayoutCalldata({
      shape: 'pox-addr',
      btcAddress: P2WPKH,
      maxFeeSats: 3000n,
      minClaimSats: 9000n,
    });
    const parsed = parseSignerCalldata(calldata);
    expect(BtcAddress.stringify(parsed.poxAddress, 'mainnet')).toBe(P2WPKH);
    expect(parsed.maxFeeSats).toBe(3000n);
    expect(Object.keys((deserializeCV(calldata) as never)['value'])).toEqual([
      'max-fee',
      'pox-addr',
    ]);
  });

  it('carries the floor to a contract that understands it', async () => {
    const calldata = await buildPayoutCalldata({
      shape: 'payout-config',
      btcAddress: P2WPKH,
      maxFeeSats: 2000n,
      minClaimSats: 20_000n,
    });
    // The contract deserializes it as one tuple, so it has to round-trip whole.
    await expect(
      decodeRewardRoute(Cl.some(deserializeCV(calldata))),
    ).resolves.toEqual({
      kind: 'bitcoin',
      address: P2WPKH,
      maxFeeSats: 2000n,
      minClaimSats: 20_000n,
    });
  });

  it('falls back to the older shape when no floor was given', async () => {
    const calldata = await buildPayoutCalldata({
      shape: 'payout-config',
      btcAddress: P2TR,
      maxFeeSats: 1000n,
    });
    // Accepted by the newer contract too, which fills in default-min-claim.
    expect(parseSignerCalldata(calldata).maxFeeSats).toBe(1000n);
  });
});
