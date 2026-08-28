import { PostConditionMode, hexToCV, postConditionToHex } from '@stacks/transactions';
import { stakePostConditions } from '@guide/lib/staking';
import { contractCallFrom, PLACEHOLDER_PUBLIC_KEY, unsignedFor } from './contract-call';

const STAKER = 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR';

/*
 * Reading the call back out of a transaction the staking package built.
 *
 * This is the join between the guide's rules and the wallet's job: the package
 * decides argument order and encoding, the wallet decides nonce, fee, key and
 * broadcast. Anything lost in between is a stake that does something other
 * than what the form said.
 */

async function buildOne() {
  const { buildStake } = await import('@stacks/bitcoin-staking');
  return buildStake({
    signerManager: 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager',
    amountUstx: 100_000_000n,
    numCycles: 12,
    startBurnHt: 964_352,
    network: 'mainnet',
    ...unsignedFor(),
  });
}

describe('contractCallFrom', () => {
  it('names pox-5 and the entry point, not the signer manager', async () => {
    const call = contractCallFrom(await buildOne(), []);
    // The stake goes to pox-5; the signer manager is an argument of it.
    expect(call.contract).toBe('SP000000000000000000002Q6VF78.pox-5');
    expect(call.functionName).toBe('stake');
  });

  it('hands the arguments over hex-encoded, in the package’s order', async () => {
    const call = contractCallFrom(await buildOne(), []);
    expect(call.functionArgs.every((arg) => /^0x[0-9a-f]+$/i.test(arg))).toBe(true);
    // Round-tripping proves nothing was mangled on the way out: the amount
    // typed into the form is still in there, to the microSTX.
    const decoded = call.functionArgs.map(hexToCV);
    expect(
      decoded.some((cv) => cv.type === 'uint' && cv.value === 100_000_000n),
    ).toBe(true);
  });

  it('carries the post conditions and denies everything else', async () => {
    const conditions = stakePostConditions(STAKER, 100_000_000n);
    const call = contractCallFrom(await buildOne(), conditions);
    expect(call.postConditionMode).toBe('deny');
    expect(call.postConditions).toEqual(conditions.map(postConditionToHex));
    expect(call.postConditions).toHaveLength(1);
  });

  it('is mainnet, said out loud rather than left to the wallet', async () => {
    expect(contractCallFrom(await buildOne(), []).network).toBe('mainnet');
  });

  it('refuses anything that is not a contract call', () => {
    const notACall = {
      payload: { payloadType: PostConditionMode.Allow },
    } as never;
    expect(() => contractCallFrom(notACall, [])).toThrow(/contract call/);
  });
});

describe('the placeholder public key', () => {
  /*
   * WALLETCONNECT.md's blocker, in one test. The web page needs the staker's
   * own key to build a transaction and a WalletConnect session does not carry
   * one. This app builds the transaction only to read the call out of it and
   * throw the rest away, so a key belonging to nobody does the job — and the
   * wallet signs with its own.
   */
  it('is a valid compressed key, so the builder accepts it', () => {
    expect(PLACEHOLDER_PUBLIC_KEY).toMatch(/^0[23][0-9a-f]{64}$/);
  });

  it('is used when the wallet published no key of its own', () => {
    expect(unsignedFor().publicKey).toBe(PLACEHOLDER_PUBLIC_KEY);
    expect(unsignedFor(undefined).publicKey).toBe(PLACEHOLDER_PUBLIC_KEY);
    expect(unsignedFor('').publicKey).toBe(PLACEHOLDER_PUBLIC_KEY);
  });

  it('gives way to a real one when the wallet did publish it', () => {
    expect(unsignedFor('02aabb').publicKey).toBe('02aabb');
  });

  it('leaves nonce and fee at zero for the wallet to fill in', () => {
    expect(unsignedFor()).toMatchObject({ nonce: 0, fee: 0 });
  });

  it('produces the same call whichever key built it', async () => {
    const { buildStake } = await import('@stacks/bitcoin-staking');
    const common = {
      signerManager: 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager',
      amountUstx: 100_000_000n,
      numCycles: 12,
      startBurnHt: 964_352,
      network: 'mainnet' as const,
    };
    const withPlaceholder = contractCallFrom(
      await buildStake({ ...common, ...unsignedFor() }),
      [],
    );
    const withReal = contractCallFrom(
      await buildStake({
        ...common,
        ...unsignedFor(
          '03b76dbbb9e4f4b1b5f1e7cd8e46bdc7ba9d2dcd0a4f9b1e2b5a4d3c2b1a09876',
        ),
      }),
      [],
    );
    expect(withReal).toEqual(withPlaceholder);
  });
});
