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

export const API_URL = process.env.STACKS_API_URL ?? 'https://api.hiro.so';

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
