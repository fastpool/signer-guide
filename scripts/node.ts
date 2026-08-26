/**
 * Which node the refresh asks, and how it identifies itself.
 *
 * Everything here is build-time. Nothing under `scripts/` reaches the
 * browser: the page ships the two committed data files and makes no requests
 * of its own, which is why an API key can live in an environment variable at
 * all. Put this in `src/` and the key would be one careless import away from
 * the bundle.
 *
 *   STACKS_API_URL   the node to read (default https://api.hiro.so)
 *   HIRO_API_KEY     sent as `x-api-key` when set, omitted when not
 *
 * A local node needs neither a key nor patience:
 *
 *   STACKS_API_URL=http://localhost:3999 pnpm generate:signers
 *   HIRO_API_KEY=… pnpm generate:totals
 */

/**
 * `STACKS_API_URL`, made into something `fetch` can actually use.
 *
 * `new URL('localhost:3999')` does not throw. It reads `localhost:` as the
 * scheme and leaves the hostname empty, so a URL with the `http://` left off
 * survives every check here and reaches `fetch`, which fails with "unknown
 * scheme" — and every caller in this directory turns a failed fetch into "the
 * node would not answer". A typo in an environment variable then reads as an
 * unresponsive chain, which sends whoever typed it looking at their node.
 *
 * So a bare `host:port` is completed rather than rejected: it is unambiguous,
 * it is what everyone means by it, and it is the one mistake worth being kind
 * about. Anything that is still not http(s) afterwards throws by name, because
 * the alternative is the silence above.
 */
export function normaliseApiUrl(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `http://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(
      `STACKS_API_URL is not a URL: ${raw}\n` +
        '  Try something like http://localhost:3999 or https://api.hiro.so',
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `STACKS_API_URL has to be http or https, not "${url.protocol}": ${raw}\n` +
        '  Try something like http://localhost:3999 or https://api.hiro.so',
    );
  }

  // Every caller builds paths as `${API_URL}/v2/…`, so a trailing slash here
  // would ask the node for `//v2/…`.
  return url.href.replace(/\/+$/, '');
}

export const API_URL = normaliseApiUrl(
  process.env.STACKS_API_URL ?? 'https://api.hiro.so',
);

const API_KEY = process.env.HIRO_API_KEY ?? '';

/** True when we are not asking a public Hiro endpoint on our own recognisance. */
const IDENTIFIED =
  API_KEY !== '' || !/(^|\.)hiro\.so/.test(new URL(API_URL).hostname);

/**
 * Gap between requests.
 *
 * Anonymous, Hiro allows roughly 50 a minute per IP, and a refresh asks about
 * every pool twice over — so it waits. With a key, or against a node of your
 * own, there is nothing to wait for and a full refresh takes seconds.
 */
export const SPACING_MS = IDENTIFIED ? 50 : 300;

/**
 * Waits before a retry, growing: a limit that bites needs more than a blink.
 *
 * Lives here beside the spacing because they are the same subject — how hard
 * we lean on the endpoint, and what we do when it says stop. A caller that
 * runs out of these has been refused four times and should report that it
 * does not know, never that the answer was nothing.
 */
export const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Headers for a node request, carrying the key when there is one. Passing a
 * key we do not have as an empty header would earn a 401 rather than the
 * anonymous rate limit we actually want.
 */
export function nodeHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return API_KEY ? { ...extra, 'x-api-key': API_KEY } : extra;
}

/** "https://api.hiro.so (anonymous)" — worth printing before a slow run. */
export function describeNode(): string {
  if (API_KEY) return `${API_URL} (with an API key)`;
  return `${API_URL}${IDENTIFIED ? '' : ' (anonymous, so paced slowly)'}`;
}

/**
 * Run one job per item, starting them `spacingMs` apart, and keep the order.
 *
 * The sleep-then-fetch loop every walk here is written as pays for the wait
 * *and* the wait for the answer: 300ms of pacing plus a quarter-second of
 * round trip is half a second per request, of which only the first half was
 * asked for. Starting the next job while the last one is still in the air
 * costs the endpoint nothing — the rate it sees is the same one job every
 * `spacingMs`, which is what a rate limit counts — and gives the round trips
 * back. On a walk of fifty pages that is the difference between half a minute
 * and a quarter of one; with an API key, where the spacing is 50ms and the
 * round trip is most of the time, it is most of the walk.
 *
 * `maxInFlight` is the backstop for the other direction: an endpoint that has
 * gone slow should not end up with a hundred of our requests queued against
 * it, each of them retrying.
 *
 * `job` is expected to answer rather than throw, as everything under
 * `scripts/` does — null for "could not be read". One that throws anyway is
 * not swallowed: the first error surfaces once the rest have finished, so a
 * failure cannot leave jobs running behind it.
 */
export async function mapPaced<T, R>(
  items: readonly T[],
  job: (item: T, index: number) => Promise<R>,
  opts: {
    spacingMs?: number;
    maxInFlight?: number;
    /** Called as each job finishes, for a progress line. */
    onDone?: (done: number, total: number) => void;
  } = {},
): Promise<R[]> {
  const spacingMs = opts.spacingMs ?? SPACING_MS;
  const maxInFlight = Math.max(1, opts.maxInFlight ?? 8);
  const results = new Array<R>(items.length);
  const started: Promise<void>[] = [];

  let inFlight = 0;
  let done = 0;
  let failure: unknown = null;
  // A holder rather than a bare variable: the waiter is set inside a promise
  // executor and read inside a job, and only a property survives both.
  const slot: { freed: (() => void) | null } = { freed: null };

  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) await sleep(spacingMs);
    while (inFlight >= maxInFlight) {
      await new Promise<void>((resolve) => {
        slot.freed = resolve;
      });
    }

    inFlight += 1;
    started.push(
      (async () => {
        try {
          results[index] = await job(items[index], index);
        } catch (err) {
          if (failure === null) failure = err;
        } finally {
          inFlight -= 1;
          done += 1;
          opts.onDone?.(done, items.length);
          const freed = slot.freed;
          slot.freed = null;
          freed?.();
        }
      })(),
    );
  }

  await Promise.all(started);
  if (failure !== null) throw failure;
  return results;
}
