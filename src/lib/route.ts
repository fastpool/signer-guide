import { useEffect, useState } from 'react';

/**
 * Hash routing, so the whole guide stays a static file that can be dropped on
 * any host without server rewrites. Two routes only:
 *   #/                     the list
 *   #/contract/<profileId> one signer contract
 */
export type Route =
  | { name: 'list' }
  | { name: 'contract'; profileId: string };

export function parseHash(hash: string): Route {
  const match = /^#\/contract\/([a-z0-9-]+)$/.exec(hash);
  return match ? { name: 'contract', profileId: match[1] } : { name: 'list' };
}

export function contractHref(profileId: string): string {
  return `#/contract/${profileId}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      // A new page should start at the top, as a normal page load would.
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
