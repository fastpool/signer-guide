import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * public/sw.js decides what an installed app does with every request it makes.
 * The rule that matters most is a negative one — balances and pool data must
 * never be answered from a cache — and a negative rule is exactly the kind
 * that rots silently. So the worker is loaded into a sandbox with a fake
 * Cache API and its handlers are called directly.
 */

const SW_SOURCE = readFileSync(
  fileURLToPath(new URL('../../public/sw.js', import.meta.url)),
  'utf8',
);

const ORIGIN = 'https://signer-guide.fastpool.org';

type Handlers = Record<string, (event: Record<string, unknown>) => void>;

function loadWorker() {
  const handlers: Handlers = {};
  const caches = new Map<string, Map<string, string>>();
  const fetched: string[] = [];
  /** Set per test: URLs the network refuses, standing in for being offline. */
  const offline = new Set<string>();

  const cacheApi = {
    open: async (name: string) => {
      const store = caches.get(name) ?? new Map<string, string>();
      caches.set(name, store);
      return {
        match: async (request: { url?: string } | string) => {
          const url = typeof request === 'string' ? request : request.url;
          const key = url?.startsWith('/') ? `${ORIGIN}${url}` : url;
          const hit = store.get(key ?? '');
          return hit === undefined ? undefined : { body: hit, ok: true };
        },
        put: async (request: { url: string }, response: { body: string }) => {
          store.set(request.url, response.body);
        },
        add: async (request: { url: string }) => {
          store.set(request.url, 'shell');
        },
      };
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  };

  const sandbox = {
    self: {
      addEventListener: (name: string, handler: Handlers[string]) => {
        handlers[name] = handler;
      },
      location: { origin: ORIGIN },
      clients: { claim: async () => {} },
      skipWaiting: () => {},
    },
    caches: cacheApi,
    Request: class {
      url: string;
      constructor(url: string) {
        this.url = url.startsWith('/') ? `${ORIGIN}${url}` : url;
      }
    },
    URL,
    Promise,
    fetch: async (request: { url: string }) => {
      fetched.push(request.url);
      if (offline.has(request.url)) throw new Error('offline');
      // What gets cached is labelled differently from what is returned live,
      // so a test can tell which of the two it was handed.
      return {
        ok: true,
        body: `network:${request.url}`,
        clone: () => ({ body: `cached:${request.url}` }),
      };
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);
  return { handlers, caches, fetched, offline, sandbox };
}

/** Runs the fetch handler and returns what it answered with, or null. */
async function handleFetch(
  worker: ReturnType<typeof loadWorker>,
  url: string,
  mode: 'navigate' | 'cors' = 'cors',
) {
  // Held on an object rather than in a local: the assignment happens inside a
  // callback, and a local would be narrowed to `never` by the null check.
  const answered: { value: Promise<{ body: string }> | null } = { value: null };
  const request = { url, method: 'GET', mode };
  worker.handlers.fetch({
    request,
    respondWith: (value: Promise<{ body: string }>) => {
      answered.value = value;
    },
  });
  return answered.value === null ? null : await answered.value;
}

let worker: ReturnType<typeof loadWorker>;
beforeEach(() => {
  worker = loadWorker();
});

describe('what the offline shell refuses to touch', () => {
  it('never answers for the chain', async () => {
    // A cached balance is a wrong balance, and somebody is about to stake
    // against it. Returning null means the worker did not call respondWith,
    // so the request goes to the network untouched.
    expect(
      await handleFetch(
        worker,
        'https://api.hiro.so/extended/v1/address/SP0/balances',
      ),
    ).toBeNull();
  });

  it('never answers for the pool data', async () => {
    // It has its own copy in local storage, and the page says out loud when
    // it is showing that copy. A stale answer from here would make that a lie.
    expect(
      await handleFetch(
        worker,
        'https://raw.githubusercontent.com/fastpool/signer-guide/main/src/data/totals.json',
      ),
    ).toBeNull();
  });

  it('leaves anything that is not a plain GET alone', async () => {
    let answered = false;
    worker.handlers.fetch({
      request: { url: `${ORIGIN}/`, method: 'POST', mode: 'navigate' },
      respondWith: () => {
        answered = true;
      },
    });
    expect(answered).toBe(false);
  });
});

describe('what it does answer for', () => {
  it('takes a new deploy over a cached page when there is a network', async () => {
    const response = await handleFetch(worker, `${ORIGIN}/`, 'navigate');
    expect(response?.body).toBe(`network:${ORIGIN}/`);
  });

  it('serves the app offline once it has been seen online', async () => {
    await handleFetch(worker, `${ORIGIN}/`, 'navigate');
    worker.offline.add(`${ORIGIN}/`);
    const response = await handleFetch(worker, `${ORIGIN}/`, 'navigate');
    expect(response?.body).toBe(`cached:${ORIGIN}/`);
  });

  it('falls back to index.html for a page it has never seen', async () => {
    const cache = await worker.sandbox.caches.open('signer-guide-shell-v1');
    await cache.put({ url: `${ORIGIN}/index.html` }, { body: 'the app' });
    worker.offline.add(`${ORIGIN}/#/contract/standard`);
    const response = await handleFetch(
      worker,
      `${ORIGIN}/#/contract/standard`,
      'navigate',
    );
    expect(response?.body).toBe('the app');
  });

  it('serves a hashed asset from cache without asking the network twice', async () => {
    const url = `${ORIGIN}/assets/index-BWc1uYmG.js`;
    await handleFetch(worker, url);
    const before = worker.fetched.length;
    const again = await handleFetch(worker, url);
    // The name contains the hash of the contents, so a hit cannot be stale.
    expect(worker.fetched.length).toBe(before);
    expect(again?.body).toBe(`cached:${url}`);
  });
});

describe('housekeeping', () => {
  it('drops caches from an older version of the worker on activate', async () => {
    worker.caches.set('signer-guide-shell-v0', new Map());
    worker.caches.set('signer-guide-assets-v0', new Map());
    worker.caches.set('something-else', new Map());

    const waits: Promise<unknown>[] = [];
    worker.handlers.activate({
      waitUntil: (value: Promise<unknown>) => waits.push(value),
    });
    await Promise.all(waits);

    expect([...worker.caches.keys()]).not.toContain('signer-guide-shell-v0');
    expect([...worker.caches.keys()]).not.toContain('signer-guide-assets-v0');
    // Not ours to delete.
    expect([...worker.caches.keys()]).toContain('something-else');
  });

  it('installs the shell without one missing file taking the whole worker down', async () => {
    const waits: Promise<unknown>[] = [];
    worker.handlers.install({
      waitUntil: (value: Promise<unknown>) => waits.push(value),
    });
    await expect(Promise.all(waits)).resolves.toBeDefined();
    const shell = worker.caches.get('signer-guide-shell-v1');
    expect(shell?.size).toBeGreaterThan(0);
  });

  it('hands over only when the page asks it to', async () => {
    const skipWaiting = vi.fn();
    worker.sandbox.self.skipWaiting = skipWaiting;

    worker.handlers.message({ data: 'something else' });
    expect(skipWaiting).not.toHaveBeenCalled();

    worker.handlers.message({ data: 'skip-waiting' });
    expect(skipWaiting).toHaveBeenCalledOnce();
  });
});
