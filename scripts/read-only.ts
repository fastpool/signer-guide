/**
 * Asking a contract a question, patiently.
 *
 * Both reward scripts walk thousands of ids one at a time against a public
 * endpoint, so the interesting part is not the call — it is what happens when
 * the node says no. A 429 or a 5xx is the node asking for a moment; giving up
 * on it would drop somebody's money out of a report that reads as complete.
 * A refusal that is not retryable, or a contract with no such function, is a
 * real answer and comes back as null.
 *
 * Null therefore means "we could not read it", never "the answer was
 * nothing". Callers are expected to say which of the two they got.
 *
 * Two neighbours ask contracts things and are deliberately not this:
 * `pox5.ts` speaks only to pox-5, hex in and hex out, because the page's own
 * encoder in `src/lib/clarity.ts` has to stay small; `hiro.ts` fetches the
 * indexed endpoints. The reward scripts read arbitrary contracts — signer
 * managers, the sBTC token — so they want the real library and the longer
 * patience below.
 */

import { cvToHex, hexToCV, type ClarityValue } from '@stacks/transactions';
import { API_URL, nodeHeaders, sleep } from './node.js';

export { sleep };

/**
 * Waits before a retry, growing: a limit that bites needs more than a blink.
 *
 * Longer than `RETRY_DELAYS_MS` in node.ts, and deliberately so: that one is
 * sized for a refresh that reads each pool once, this one for a walk of ten
 * thousand pages, where the limit that bites is per minute. A walk that gives
 * up two thirds of the way through has not saved anybody time — it has
 * produced a number that is wrong in a direction nobody can see.
 */
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000, 60_000, 60_000];

/** A read-only call. Null when it could not be read, or the function is absent. */
export async function callReadOnly(
  contractId: string,
  functionName: string,
  args: ClarityValue[] = [],
): Promise<ClarityValue | null> {
  const [address, name] = contractId.split('.');

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(
        `${API_URL}/v2/contracts/call-read/${address}/${name}/${functionName}`,
        {
          method: 'POST',
          headers: nodeHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            sender: address,
            arguments: args.map((arg) => cvToHex(arg)),
          }),
        },
      );

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
      // A contract with no such function answers `okay: false`, which is the
      // same shape as a runtime error. Either way there is nothing to read.
      return body.okay && body.result ? hexToCV(body.result) : null;
    } catch {
      // Offline or blocked — no amount of retrying fixes that.
      return null;
    }
  }
}

/** A data var, straight off the node. Null when it could not be read. */
export async function readDataVar(
  contractId: string,
  varName: string,
): Promise<ClarityValue | null> {
  const [address, name] = contractId.split('.');

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(
        `${API_URL}/v2/data_var/${address}/${name}/${varName}?proof=0`,
        { headers: nodeHeaders() },
      );
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (!response.ok) return null;
      const body = (await response.json()) as { data?: string };
      return body.data ? hexToCV(body.data) : null;
    } catch {
      return null;
    }
  }
}

/** A page of the extended API, retried the same way. Null when unreadable. */
export async function fetchJson<T>(path: string): Promise<T | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}${path}`, {
        headers: nodeHeaders(),
      });
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
}

/**
 * What a deployed contract can be asked, split by access.
 *
 * The public side matters as much as the read-only one here: a manager with
 * `claim-staker-rewards` but no getters still owes people money — it just
 * keeps the accounting somewhere else. Telling those apart needs both lists.
 */
export async function contractFunctions(contractId: string): Promise<{
  readOnly: Set<string>;
  public: Set<string>;
} | null> {
  const [address, name] = contractId.split('.');
  const body = await fetchJson<{
    functions?: { name: string; access: string }[];
  }>(`/v2/contracts/interface/${address}/${name}`);
  if (!body?.functions) return null;
  const pick = (access: string) =>
    new Set(
      body.functions!.filter((f) => f.access === access).map((f) => f.name),
    );
  return { readOnly: pick('read_only'), public: pick('public') };
}

/** A deployed contract's Clarity source. Null when it could not be read. */
export async function contractSource(
  contractId: string,
): Promise<string | null> {
  const [address, name] = contractId.split('.');
  const body = await fetchJson<{ source?: string }>(
    `/v2/contracts/source/${address}/${name}?proof=0`,
  );
  return body?.source ?? null;
}

/**
 * Every print event a contract has emitted, oldest last.
 *
 * The events endpoint stops answering past a few thousand, so this is only
 * safe for contracts whose log is small — a pool's claim ledger, a membership
 * roll. Null when a page could not be read, because a partial log would say
 * somebody has not claimed when they have.
 */
export async function contractPrints(
  contractId: string,
  spacingMs = 0,
): Promise<string[] | null> {
  const reprs: string[] = [];
  let offset = 0;

  for (;;) {
    if (spacingMs) await sleep(spacingMs);
    const page = await fetchJson<{
      results?: { contract_log?: { value?: { repr?: string } } }[];
    }>(`/extended/v1/contract/${contractId}/events?limit=50&offset=${offset}`);
    if (!page?.results) return null;

    for (const event of page.results) {
      const repr = event.contract_log?.value?.repr;
      if (repr) reprs.push(repr);
    }
    if (page.results.length < 50) return reprs;
    offset += 50;
    // The endpoint gives up somewhere past a couple of thousand and answers
    // an empty page rather than an error, which would look like the end of a
    // log. Refuse rather than report a truncated one as complete.
    if (offset > 2_000) return null;
  }
}
