/**
 * The one address a reader last looked up on their own, kept in this browser
 * so the pool list can say where their STX is without being asked again.
 *
 * Only a single address is remembered: a list of twenty is somebody checking
 * other people's stakes, not their own. Storage may be missing or blocked, and
 * every call here treats that as "nothing remembered" rather than an error.
 */
import { isLookupTarget } from './principals';

const KEY = 'signer-guide.address';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberedAddress(): string | null {
  try {
    const value = store()?.getItem(KEY) ?? null;
    return value !== null && isLookupTarget(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberAddress(value: string): void {
  if (!isLookupTarget(value)) return;
  try {
    store()?.setItem(KEY, value);
  } catch {
    // Not remembering is fine.
  }
}

export function forgetAddress(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // Nothing to forget, then.
  }
}
