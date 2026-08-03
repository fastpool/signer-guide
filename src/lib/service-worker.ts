import { useEffect, useState } from 'react';

/**
 * Registering the offline shell, and offering the new one when it arrives.
 *
 * The update is offered rather than applied. A worker that calls
 * `skipWaiting` on its own reloads the page underneath whoever is using it,
 * and this app has a screen where that would land in the middle of approving
 * a transaction. So a new version waits, the reader is told, and the reload
 * happens when they say so.
 */

const SW_URL = '/sw.js';

export type UpdateState = {
  /** A new version is installed and waiting for the page to let it take over. */
  ready: boolean;
  /** Hands over to the waiting worker and reloads. */
  apply: () => void;
};

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function useServiceWorker(): UpdateState {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // In dev the shell would cache a build that changes on every save.
    if (!import.meta.env.PROD || !supported()) return;

    let cancelled = false;

    const watch = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // No controller means this is the first install, so there is nothing
          // to replace and nothing worth telling anybody about.
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller &&
            !cancelled
          ) {
            setWaiting(installing);
          }
        });
      });
    };

    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((registration) => {
        if (!cancelled) watch(registration);
      })
      .catch(() => {
        // No offline shell is a smaller problem than a broken page.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ready: waiting !== null,
    apply: () => {
      if (!waiting) return;
      // Reload once the new worker is actually in charge, not before.
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => window.location.reload(),
        { once: true },
      );
      waiting.postMessage('skip-waiting');
    },
  };
}
