/**
 * How old the data on screen is, and whether that is worth saying.
 *
 * The page promises a daily refresh, so data some hours old is normal. Data
 * more than a day old means the refresh has stopped, and every "estimated in about 3 days"
 * and "cycle 147 so far" on the page is then a statement about a moment that
 * has passed. Before this, the page said "Last update: 26 October" on the
 * third of November in the same quiet grey it uses when all is well.
 */

/** Past this, the page says the data is old rather than just how old. */
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export type Freshness =
  | { state: 'fresh'; ageMs: number }
  | { state: 'stale'; ageMs: number }
  | { state: 'unknown' };

export function freshness(
  generatedAt: string | null | undefined,
  now: number = Date.now(),
): Freshness {
  const at = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (Number.isNaN(at)) return { state: 'unknown' };
  const ageMs = Math.max(0, now - at);
  return { state: ageMs > STALE_AFTER_MS ? 'stale' : 'fresh', ageMs };
}

/**
 * "12 minutes", "3 hours", "8 days" — rounded, because the point is whether
 * to trust the page, not the exact minute.
 */
export function ageParts(ageMs: number): {
  unit: 'minute' | 'hour' | 'day';
  count: number;
} {
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) return { unit: 'minute', count: Math.max(1, minutes) };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { unit: 'hour', count: hours };
  return { unit: 'day', count: Math.round(hours / 24) };
}
