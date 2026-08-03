/*
 * The offline shell.
 *
 * Written by hand rather than generated: the strategies below are the whole
 * of it, and a reader who wants to know what this app does when the network
 * is gone should be able to find out by reading one short file.
 *
 * What is deliberately NOT cached here is as important as what is. Every
 * cross-origin request goes straight to the network, always:
 *
 *   api.hiro.so            balances and read-only calls. A cached balance is
 *                          a wrong balance, and somebody is about to stake
 *                          against it.
 *   raw.githubusercontent  the pool data. It has its own copy in local
 *                          storage (see src/lib/data-source.ts), and the app
 *                          tells the reader when it is showing that saved
 *                          copy. Serving a stale answer from here instead
 *                          would make that notice a lie.
 *
 * So this file caches the application, and nothing that the application says.
 */

const VERSION = 'v1';
const SHELL_CACHE = `signer-guide-shell-${VERSION}`;
const ASSET_CACHE = `signer-guide-assets-${VERSION}`;
const CURRENT = [SHELL_CACHE, ASSET_CACHE];

/** Everything served under a name that does not change between builds. */
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/fastpool-logo.svg',
  '/app-icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

/** Vite writes content-hashed files here, so a hit is never the wrong version. */
const HASHED_PATH = /^\/assets\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One missing file should not fail the install and leave no worker at
      // all, so these are added individually rather than with addAll.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {}),
        ),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('signer-guide-'))
          .filter((name) => !CURRENT.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * The page asks for this when the reader accepts a new version, so the wait
 * happens at a moment they chose rather than in the middle of signing.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ??
      (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Anything not ours is the application's business, not the shell's.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first, so a deploy is picked up as soon as there is a network to
    // pick it up from; index.html when there is not.
    event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'));
    return;
  }

  if (HASHED_PATH.test(url.pathname)) {
    // The name contains the hash of the contents, so what is cached under it
    // cannot go stale — it can only stop being referenced.
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});
