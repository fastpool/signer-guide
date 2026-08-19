/**
 * Asking pox-5 a question, for whatever script needs to.
 *
 * Two scripts read this contract now — `locked.ts` for what each pool holds,
 * `signer-members.ts` for what each member of one pool holds — and they want
 * the same three things: the contract's address, a read-only call that waits
 * out a rate limit instead of reporting ignorance, and the cycle we are in.
 *
 * Kept here rather than duplicated, because the retry policy is the part
 * worth getting right once: a 429 answered with `null` is a script telling
 * you a pool is empty when the node simply asked it to slow down.
 */

import { cvToJSON, hexToCV } from '@stacks/transactions';
import { API_URL, nodeHeaders, RETRY_DELAYS_MS, sleep } from './node.js';

export const POX5 = 'SP000000000000000000002Q6VF78.pox-5';

/**
 * A read-only call, as hex-encoded Clarity in and hex-encoded Clarity out.
 *
 * Null is "the node did not answer", never "the answer was nothing" — the
 * caller decides what to make of that, and every caller here treats it as
 * something it does not know rather than as a zero.
 */
export async function callReadOnly(
  functionName: string,
  args: string[],
): Promise<string | null> {
  const [address, name] = POX5.split('.');

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(
        `${API_URL}/v2/contracts/call-read/${address}/${name}/${functionName}`,
        {
          method: 'POST',
          headers: nodeHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ sender: address, arguments: args }),
        },
      );

      // Being told to slow down is worth waiting out: the alternative is
      // telling a reader we do not know what a pool holds when we could.
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (!response.ok) return null;

      const body = (await response.json()) as {
        okay?: boolean;
        result?: string;
      };
      return body.okay && body.result ? body.result : null;
    } catch {
      // Offline or blocked — no amount of retrying fixes that.
      return null;
    }
  }
}

/**
 * The tuple inside an `(optional (tuple …))` answer, or null for none.
 *
 * pox-5 answers this shape for every "what does it have for this principal"
 * question — a staker's info, a cycle membership, a bond. Throwing on
 * something else is deliberate: the caller catches it and records that it
 * could not read the answer, which is not the same as an answer of none.
 */
export function optionalTuple(hex: string): ClarityTuple | null {
  const json = cvToJSON(hexToCV(hex)) as {
    value: null | { value?: ClarityTuple };
  };
  return json.value?.value ?? null;
}

/** A decoded Clarity tuple: field name to whatever was in it. */
export type ClarityTuple = Record<string, { value: unknown }>;

/** A tuple's uint field, as the number pox-5 holds rather than a JS number. */
export function tupleUint(tuple: ClarityTuple, field: string): bigint {
  return BigInt(String(tuple[field]?.value ?? '0'));
}

/** A tuple's principal field. */
export function tuplePrincipal(tuple: ClarityTuple, field: string): string {
  return String(tuple[field]?.value ?? '');
}

/**
 * The reward cycle the chain is in, or null if the node would not say.
 *
 * Waits out a rate limit like every other read here. This one answers the
 * question the rest of a run is asked in terms of, so a 429 on it does not
 * cost a number — it costs the whole report.
 */
export async function fetchCurrentCycle(): Promise<number | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/v2/pox`, {
        headers: nodeHeaders(),
      });

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (!response.ok) return null;

      const body = (await response.json()) as {
        current_cycle?: { id?: number };
      };
      return body.current_cycle?.id ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * A bare `uint` answer, as the number pox-5 holds rather than a JS number.
 *
 * Throwing on anything else is deliberate, for the reason `optionalTuple`
 * gives: a caller that cannot read the answer should record that, not a zero.
 */
export function uintValue(hex: string): bigint {
  const json = cvToJSON(hexToCV(hex)) as { type: string; value: unknown };
  if (json.type !== 'uint') {
    throw new Error(`Expected a uint answer, got ${json.type}`);
  }
  return BigInt(String(json.value));
}
