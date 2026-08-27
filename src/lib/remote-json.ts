/**
 * Fetching one committed file from the branch, when a reader asks for it.
 *
 * The guide ships the files everybody wants — the pool list, the amounts —
 * and fetches the rest on demand: a signer's member list, the history of what
 * each distribution paid. A reader who opens neither pays for neither, and
 * that is nearly all of them.
 *
 * `missing` is a state of its own on purpose. A file the refresh has not
 * written yet answers 404, and that is not a failure to ask a reader to retry
 * — it is "nothing on file for this one", which a page can say plainly.
 *
 * These come from the branch like the rest of the data, which means a working
 * copy reads the *published* files rather than the ones just generated. To see
 * your own, point the base at the working tree:
 *
 *   VITE_DATA_BASE_URL=/src/data pnpm dev
 */

import { useEffect, useState } from 'react';
import { RAW_BASE } from './data-source';

export type Remote<T> =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed' }
  | { state: 'ready'; value: T };

class NotFound extends Error {}

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${RAW_BASE}/${path}`, { signal, cache: 'no-cache' });
  if (res.status === 404) throw new NotFound();
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

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
    fetchJson(path, controller.signal)
      .then((value) => {
        if (!live) return;
        setResult(
          isValid(value) ? { state: 'ready', value } : { state: 'failed' },
        );
      })
      .catch((err: unknown) => {
        // An abort is this component going away, not a failure to report.
        if (!live) return;
        setResult({ state: err instanceof NotFound ? 'missing' : 'failed' });
      });

    return () => {
      live = false;
      controller.abort();
    };
    // On the path alone. `isValid` is a module-level function in every caller,
    // and listing it would invite an inline one that refetches every render.
  }, [path]);

  return path === null ? { state: 'missing' } : result;
}
