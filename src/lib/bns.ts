/**
 * The guide's own BNS lookup: `bns-resolve.ts`, pointed at the node this build
 * was configured with.
 *
 * Split so that the phone app can share the resolver — it has a node URL of
 * its own and no `import.meta` to read one from. Everything about how a name
 * is resolved lives in the other file; this one only answers "which node".
 */
import {
  resolveBnsName as resolve,
  type BnsResolution,
} from './bns-resolve';

export { BNS_V2_CONTRACT, isBnsName } from './bns-resolve';
export type { BnsResolution };

const STACKS_API_URL =
  typeof import.meta.env.VITE_STACKS_API_URL === 'string' &&
  import.meta.env.VITE_STACKS_API_URL.length > 0
    ? import.meta.env.VITE_STACKS_API_URL
    : 'https://api.hiro.so';

export function resolveBnsName(
  name: string,
  signal?: AbortSignal,
): Promise<BnsResolution> {
  return resolve(name, { apiUrl: STACKS_API_URL, signal });
}
