import { useEffect, useState } from 'react';

/**
 * Hash routing, so the whole guide stays a static file that can be dropped on
 * any host without server rewrites. Three routes:
 *   #/                       the list
 *   #/contract/<profileId>   one signer contract — the code, and every pool
 *                            running it
 *   #/signer/<contractId>    one deployed pool: its signer key, the sibling
 *                            contracts sharing that key, and its history
 *
 * The two are easy to confuse and are genuinely different pages. A contract is
 * a piece of reviewed code that a dozen pools may share; a signer is one
 * deployment of it, with its own key, its own members and its own money. A
 * reader asking "is this code safe" wants the first and a reader asking "who
 * am I actually staking with" wants the second.
 */
export type Route =
  | { name: 'list' }
  | { name: 'contract'; profileId: string }
  | { name: 'signer'; contractId: string };

/** `SP…ADDRESS.contract-name`, which is all a contract id can be. */
const CONTRACT_ID = /^[A-Z0-9]+\.[a-zA-Z0-9][a-zA-Z0-9-]*$/;

export function parseHash(hash: string): Route {
  const contract = /^#\/contract\/([a-z0-9-]+)$/.exec(hash);
  if (contract) return { name: 'contract', profileId: contract[1] };

  const signer = /^#\/signer\/(.+)$/.exec(hash);
  if (signer) {
    // Checked rather than trusted: the id goes into the path of a fetch, and a
    // hash is the one part of the page a stranger can hand somebody a link to.
    // `decodeURIComponent` throws outright on a stray `%`, and a hash nobody
    // meant anything by should land a reader on the list, not on a blank page.
    let contractId: string;
    try {
      contractId = decodeURIComponent(signer[1]);
    } catch {
      return { name: 'list' };
    }
    if (CONTRACT_ID.test(contractId)) return { name: 'signer', contractId };
  }

  return { name: 'list' };
}

export function contractHref(profileId: string): string {
  return `#/contract/${profileId}`;
}

export function signerHref(contractId: string): string {
  return `#/signer/${contractId}`;
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
