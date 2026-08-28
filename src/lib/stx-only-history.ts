/**
 * Fetching what every distribution has paid, when a reader asks for it.
 *
 * The file is not shipped with the build — see `remote-json.ts`. Everything
 * that reads it once it arrives lives in `stx-only-cycles.ts`, which is pure
 * and shared with the phone app; this is only the asking.
 */

import { useRemoteJson, type Remote } from './remote-json';
import { isStxOnlyHistory } from './stx-only-cycles';
import type { StxOnlyHistory } from './types';

export { byCycle, isStxOnlyHistory, type CycleDistributions } from './stx-only-cycles';

export function useStxOnlyHistory(): Remote<StxOnlyHistory> {
  return useRemoteJson('stx-only-history.json', isStxOnlyHistory);
}
