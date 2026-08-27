import { useEffect, useState } from 'react';
import { isLookupTarget } from './principals';

/**
 * Hash routing, so the whole guide stays a static file that can be dropped on
 * any host without server rewrites. Four routes:
 *   #/                       the list
 *   #/contract/<profileId>   one signer contract — the code, and every pool
 *                            running it
 *   #/signer/<contractId>    one deployed pool: its signer key, the sibling
 *                            contracts sharing that key, and its history
 *   #/status[/<principals>]  what one or more addresses are staking, if
 *                            anything; empty for the box to paste them into
 *   #/rewards/stx-only       full breakdown of the STX-only rewards estimate
 *   #/rewards/stx-only/history   what every distribution has paid so far
 *
 * The first two are easy to confuse and are genuinely different pages. A
 * contract is a piece of reviewed code that a dozen pools may share; a signer
 * is one deployment of it, with its own key, its own members and its own
 * money. A reader asking "is this code safe" wants the first and a reader
 * asking "who am I actually staking with" wants the second.
 */
export type Route =
  | { name: 'list' }
  | { name: 'contract'; profileId: string }
  | { name: 'signer'; contractId: string }
  | { name: 'status'; principals: string[] }
  | { name: 'stxOnlyRewards' }
  | { name: 'stxOnlyHistory' };

/** `SP…ADDRESS.contract-name`, which is all a contract id can be. */
const CONTRACT_ID = /^[A-Z0-9]+\.[a-zA-Z0-9][a-zA-Z0-9-]*$/;

/** `%` alone throws out of `decodeURIComponent`, and a bad hash is not a crash. */
function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseHash(hash: string): Route {
  // Before the estimate, which is a prefix of it.
  if (hash === '#/rewards/stx-only/history') return { name: 'stxOnlyHistory' };
  if (hash === '#/rewards/stx-only') return { name: 'stxOnlyRewards' };

  const contract = /^#\/contract\/([a-z0-9-]+)$/.exec(hash);
  if (contract) return { name: 'contract', profileId: contract[1] };

  const signer = /^#\/signer\/(.+)$/.exec(hash);
  if (signer) {
    // Checked rather than trusted: the id goes into the path of a fetch, and a
    // hash is the one part of the page a stranger can hand somebody a link to.
    // A hash nobody meant anything by should land a reader on the list, not on
    // a blank page.
    const contractId = decode(signer[1]);
    if (contractId !== null && CONTRACT_ID.test(contractId)) {
      return { name: 'signer', contractId };
    }
  }

  // The bare route is the page with its box empty, which is how somebody
  // arrives who has addresses to paste rather than a link to follow.
  if (hash === '#/status' || hash === '#/status/') {
    return { name: 'status', principals: [] };
  }
  const status = /^#\/status\/(.+)$/.exec(hash);
  if (status) {
    const listed = decode(status[1]);
    if (listed !== null) {
      /*
       * Comma-separated, so one link can carry a whole list. Anything that is
       * not a principal is dropped rather than looked up: these go into the
       * path of a request, and a link handed to somebody is exactly where a
       * string nobody checked should not be trusted. Dropping every one of
       * them leaves the box empty, which is a page that still works.
       */
      const principals = listed
        .split(',')
        .map((value) => value.trim())
        .filter(isLookupTarget);
      return { name: 'status', principals };
    }
  }

  return { name: 'list' };
}

export function contractHref(profileId: string): string {
  return `#/contract/${profileId}`;
}

export function signerHref(contractId: string): string {
  return `#/signer/${contractId}`;
}

/** A link to the status of these addresses, or to the empty box for none. */
export function statusHref(principals: string[] = []): string {
  return principals.length === 0
    ? '#/status'
    : `#/status/${principals.join(',')}`;
}

export function stxOnlyRewardsHref(): string {
  return '#/rewards/stx-only';
}

export function stxOnlyHistoryHref(): string {
  return '#/rewards/stx-only/history';
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
