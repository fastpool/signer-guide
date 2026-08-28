import { useEffect, useState } from 'react';
import { DATA_BASE_URL } from './snapshot';

/**
 * One committed file from the branch, fetched when a screen asks for it.
 *
 * The app ships the files every screen wants — the pool list, the amounts —
 * and fetches the rest on demand. Nobody who never opens the payout history
 * pays for it, and that is nearly everybody.
 *
 * `missing` is a state of its own. A file the refresh has not written yet
 * answers 404, and that is not a failure to ask somebody to retry — it is
 * "nothing on file", which a screen can say plainly.
 */

export type Remote<T> =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed' }
  | { state: 'ready'; value: T };

class NotFound extends Error {}

export function useRemoteJson<T>(
  path: string | null,
  isValid: (value: unknown) => value is T,
): Remote<T> {
  const [result, setResult] = useState<Remote<T>>({ state: 'loading' });

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    let live = true;

    setResult({ state: 'loading' });
    fetch(`${DATA_BASE_URL}/${path}`, {
      signal: controller.signal,
      cache: 'no-cache',
    })
      .then(async (res) => {
        if (res.status === 404) throw new NotFound();
        if (!res.ok) throw new Error(`${path} failed (${res.status})`);
        return res.json();
      })
      .then((value: unknown) => {
        if (!live) return;
        setResult(isValid(value) ? { state: 'ready', value } : { state: 'failed' });
      })
      .catch((err: unknown) => {
        // An abort is this screen going away, not a failure to report.
        if (!live) return;
        setResult({ state: err instanceof NotFound ? 'missing' : 'failed' });
      });

    return () => {
      live = false;
      controller.abort();
    };
    // On the path alone. `isValid` is a module-level function in every caller.
  }, [path]);

  return path === null ? { state: 'missing' } : result;
}
