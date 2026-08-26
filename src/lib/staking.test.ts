import { BtcAddress, parseSignerCalldata } from '@stacks/bitcoin-staking';
import {
  Cl,
  cvToHex,
  deserializeCV,
  serializeCVBytes,
} from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import {
  buildPayoutCalldata,
  decodeRewardRoute,
  decodeUserData,
  defaultMinClaimSats,
  DUST_LIMIT_SATS,
  isValidMinClaim,
  minClaimFloorSats,
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

describe('decodeUserData', () => {
  /*
   * pox-5 keeps no copy of the calldata — it hands it to the signer manager
   * and forgets it — so the only place to read what a person actually sent is
   * the transaction. These pin the two shapes the signer manager's
   * `parse-payout-calldata` accepts, against the wrapper the chain records:
   * `(optional (buff 500))`, where `none` is an answer and not an absence.
   */

  /** The calldata argument of a real mainnet stake, hex as the API gives it. */
  const REAL_STAKE_ARG =
    '0x0a020000005d0c00000002076d61782d6665650100000000000000000000000000' +
    '00000108706f782d616464720c0000000209686173686279746573020000001' +
    '4aa8b527f2703a195477ab7a96911f864d6f7a2800776657273696f6e020000000104';

  /** Wraps a tuple the way `(optional (buff 500))` reaches the chain. */
  const asArgument = (cv: Parameters<typeof serializeCVBytes>[0]) =>
    cvToHex(Cl.some(Cl.buffer(serializeCVBytes(cv))));

  it('reads a real two-field stake back to what its sender typed', async () => {
    await expect(decodeUserData(REAL_STAKE_ARG)).resolves.toEqual({
      shape: 'pox-addr',
      route: {
        kind: 'bitcoin',
        address: 'bc1q4294yle8qwse23m6k75kjy0cvnt00g5qnm2zs4',
        maxFeeSats: 1n,
        // No floor was sent. The pool filled in default-min-claim of its own
        // accord, and saying so is the pool's business, not this record's.
        minClaimSats: null,
      },
    });
  });

  it('reads the three-field shape, floor and all', async () => {
    const argument = asArgument(
      Cl.tuple({
        'pox-addr': poxAddrTuple(P2TR),
        'max-fee': Cl.uint(2000),
        'min-claim': Cl.uint(20_000),
      }),
    );
    await expect(decodeUserData(argument)).resolves.toEqual({
      shape: 'payout-config',
      route: {
        kind: 'bitcoin',
        address: P2TR,
        maxFeeSats: 2000n,
        minClaimSats: 20_000n,
      },
    });
  });

  it('reads none as asking to be paid in sBTC', async () => {
    // `validate-stake!` deletes the payout config on `none`, so this is a
    // request, not a blank. It carries no shape because it carries no tuple.
    await expect(decodeUserData(cvToHex(Cl.none()))).resolves.toEqual({
      shape: null,
      route: { kind: 'sbtc' },
    });
  });

  it('round-trips what the modal itself builds', async () => {
    const calldata = await buildPayoutCalldata({
      shape: 'payout-config',
      btcAddress: P2WPKH,
      maxFeeSats: 3000n,
      minClaimSats: 9000n,
    });
    const decoded = await decodeUserData(
      cvToHex(Cl.some(Cl.buffer(calldata))),
    );
    expect(decoded.route).toEqual({
      kind: 'bitcoin',
      address: P2WPKH,
      maxFeeSats: 3000n,
      minClaimSats: 9000n,
    });
  });

  it('refuses bytes it cannot make sense of', async () => {
    // A stake that succeeded means the pool understood the calldata. Bytes we
    // cannot parse mean we are wrong, so no guess is offered.
    await expect(
      decodeUserData(cvToHex(Cl.some(Cl.buffer(serializeCVBytes(Cl.uint(1)))))),
    ).rejects.toThrow();
    await expect(decodeUserData(cvToHex(Cl.uint(1)))).rejects.toThrow();
  });
});
