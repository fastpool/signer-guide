/**
 * Turning a BNS v2 name into the address it belongs to.
 *
 * Asked of the registry contract itself. An indexer's answer would be quicker
 * to reach for, but the page uses what comes back to look up somebody's stake,
 * so resolving to a stale owner would report one person's position under
 * another person's name — silently, and with nothing on screen to suggest it.
 * The registry is the thing that decides who owns a name, so the registry is
 * what is asked.
 *
 * `can-resolve-name(namespace, name)` answers
 * `(response {owner: principal, renewal: uint} uint)`: ok with the owner, or
 * err u106 for a name nobody has registered. Those two are kept apart — a name
 * that does not exist is a fact worth telling somebody, and it is not the same
 * as a node that would not answer.
 */

import { Cl, cvToHex, cvToJSON, hexToCV } from '@stacks/transactions';
import { isBnsName } from './principals';

export { isBnsName };

/** The registry. Mainnet only, like the rest of this page. */
export const BNS_V2_CONTRACT =
  'SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF.BNS-V2';

const STACKS_API_URL =
  typeof import.meta.env.VITE_STACKS_API_URL === 'string' &&
  import.meta.env.VITE_STACKS_API_URL.length > 0
    ? import.meta.env.VITE_STACKS_API_URL
    : 'https://api.hiro.so';

/** What a name resolved to, or why it did not. */
export type BnsResolution =
  | { state: 'resolved'; address: string }
  /** The registry answered, and nobody owns this name. */
  | { state: 'unregistered' }
  /** The node would not answer. Never to be shown as unregistered. */
  | { state: 'failed' };

/** err u106 — `ERR-NO-NAME`, the registry saying nobody has it. */
const ERR_NO_NAME = '106';

export async function resolveBnsName(
  name: string,
  signal?: AbortSignal,
): Promise<BnsResolution> {
  const [label, namespace] = name.split('.');
  if (!label || !namespace || !isBnsName(name))
    return { state: 'unregistered' };

  const [address, contract] = BNS_V2_CONTRACT.split('.');
  let body: { okay?: boolean; result?: string };
  try {
    const res = await fetch(
      `${STACKS_API_URL}/v2/contracts/call-read/${address}/${contract}/can-resolve-name`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: address,
          arguments: [
            cvToHex(Cl.bufferFromUtf8(namespace)),
            cvToHex(Cl.bufferFromUtf8(label)),
          ],
        }),
        signal,
      },
    );
    if (!res.ok) return { state: 'failed' };
    body = (await res.json()) as { okay?: boolean; result?: string };
  } catch {
    return { state: 'failed' };
  }

  // `okay` is about the call being evaluated at all; the response inside it is
  // what says whether the name exists.
  if (!body.okay || !body.result) return { state: 'failed' };

  try {
    const decoded = cvToJSON(hexToCV(body.result)) as {
      success?: boolean;
      value?: { value?: { owner?: { value?: unknown } }; value_?: unknown };
    };
    if (decoded.success === false) {
      const code = String(
        (decoded.value as { value?: unknown } | undefined)?.value ?? '',
      );
      // Any other error is the contract refusing for a reason we have not
      // accounted for, which is not evidence that nobody owns the name.
      return code === ERR_NO_NAME
        ? { state: 'unregistered' }
        : { state: 'failed' };
    }
    const owner = decoded.value?.value?.owner?.value;
    return typeof owner === 'string' && owner.length > 0
      ? { state: 'resolved', address: owner }
      : { state: 'failed' };
  } catch {
    return { state: 'failed' };
  }
}
