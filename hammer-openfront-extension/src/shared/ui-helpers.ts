/**
 * Shared UI helper functions used across multiple views.
 */

/**
 * Format a timestamp as a human-readable relative time.
 * @param ts - Unix timestamp in milliseconds
 * @param suffix - Optional suffix (e.g. " ago"). Default: none.
 */
export function timeAgo(ts: number, suffix = ""): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s${suffix}`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m${suffix}`;
  return `${Math.floor(ms / 3_600_000)}h${suffix}`;
}

/**
 * Return a Tailwind text color class based on player relationship.
 * - Teammate → blue
 * - Ally → green
 * - Other → default text
 */
export function nameColor(
  name: string,
  playersById: Map<string, any>,
  myTeam: number | null,
  myAllies: Set<number>,
): string {
  for (const p of playersById.values()) {
    const pName = p.displayName || p.name || "";
    if (pName === name) {
      if (p.team != null && myTeam != null && p.team === myTeam) return "text-hammer-blue";
      if (p.smallID != null && myAllies.has(p.smallID)) return "text-hammer-green";
      return "text-hammer-text";
    }
  }
  return "text-hammer-text";
}
