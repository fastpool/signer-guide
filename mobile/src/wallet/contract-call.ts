import {
  addressToString,
  cvToHex,
  PayloadType,
  postConditionToHex,
  type ClarityValue,
  type PostCondition,
  type StacksTransactionWire,
} from '@stacks/transactions';
import type { ContractCallRequest } from './types';

/**
 * The call inside a transaction the staking package built.
 *
 * The package builds whole transactions; the wallet wants the call, and builds
 * — and signs, and broadcasts — the transaction itself. Reading the call back
 * out keeps argument order and calldata encoding the package's business, and
 * leaves nonce, fee, signing and broadcast to the wallet.
 *
 * The same shape the web page uses, hex-encoded here rather than passed as
 * objects: `@stacks/connect` serialises those on the way out, and this app
 * talks to the wallet over WalletConnect without it.
 */
export function contractCallFrom(
  tx: StacksTransactionWire,
  postConditions: PostCondition[],
): ContractCallRequest {
  const payload = tx.payload;
  if (payload.payloadType !== PayloadType.ContractCall) {
    throw new Error('Expected a contract call from the staking package');
  }
  return {
    contract: `${addressToString(payload.contractAddress)}.${payload.contractName.content}`,
    functionName: payload.functionName.content,
    functionArgs: (payload.functionArgs as ClarityValue[]).map(cvToHex),
    postConditions: postConditions.map(postConditionToHex),
    postConditionMode: 'deny',
    network: 'mainnet',
  };
}

/**
 * A public key to build an unsigned transaction against when the wallet has
 * not given us one.
 *
 * This is the hinge the whole mobile app turns on, so it is worth being plain
 * about. WALLETCONNECT.md records why the web page cannot connect over
 * WalletConnect: `@stacks/connect` reads addresses out of the session, and
 * unless the wallet published `sessionProperties.stacks_getAddresses` there is
 * no public key in there — so a page that builds the transaction locally and
 * asks for a signature has nothing to build with.
 *
 * A native app does not have to build it. It asks for `stx_callContract`, and
 * the wallet builds, signs and broadcasts — which is exactly the route that
 * document said would be needed if the wallets would not publish the key.
 *
 * The staking package still wants a public key, because its builders return
 * whole transactions. Everything it builds around that key is then thrown
 * away: only `contract`, `functionName` and `functionArgs` are read back out,
 * and the wallet fills in the spending condition from its own key. So the
 * value below is a placeholder — the generator point of secp256k1, compressed,
 * which belongs to nobody — and not a claim about who is signing.
 */
export const PLACEHOLDER_PUBLIC_KEY =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

/** Nonce and fee the wallet replaces; they keep the package from looking them up. */
export function unsignedFor(publicKey?: string) {
  return { publicKey: publicKey || PLACEHOLDER_PUBLIC_KEY, nonce: 0, fee: 0 };
}
