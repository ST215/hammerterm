/**
 * Comms pacing — how multi-target sends are spaced out.
 *
 * Two settings, no typing (number inputs proved clunky mid-match):
 *   - a gap picked from PACE_STOPS_MS (slider / −+ buttons / preset chips)
 *   - Humanize: widen the randomness, delay the first send too (a person
 *     can't send the instant they decide), and occasionally double a gap
 *     (like losing a target on the map).
 * The gap is the AVERAGE spacing; the resolved [min, max] range is what the
 * pacer draws each gap from.
 */

export interface ResolvedPace {
  minMs: number;
  maxMs: number;
  delayFirst: boolean;
  longPauses: boolean;
}

/** Selectable average gaps, ms. */
export const PACE_STOPS_MS = [
  300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 14000, 20000,
];

/** One-click shortcuts onto the slider. */
export const PACE_PRESETS: { label: string; ms: number; human: boolean }[] = [
  { label: "Instant", ms: 300, human: false },
  { label: "Quick", ms: 1000, human: false },
  { label: "Brisk", ms: 5000, human: true },
  { label: "Human", ms: 10000, human: true },
];

/** Chance that a longPauses gap doubles (mirrored in sendPaced). */
export const LONG_PAUSE_CHANCE = 0.15;

/** Snap any stored value to the nearest selectable stop. */
export function nearestStopIndex(ms: number): number {
  let best = 0;
  for (let i = 1; i < PACE_STOPS_MS.length; i++) {
    if (Math.abs(PACE_STOPS_MS[i] - ms) < Math.abs(PACE_STOPS_MS[best] - ms)) best = i;
  }
  return best;
}

export function resolvePace(gapMs: number, human: boolean): ResolvedPace {
  const ms = PACE_STOPS_MS[nearestStopIndex(gapMs)];
  if (human) {
    return {
      minMs: Math.round(ms * 0.6),
      maxMs: Math.round(ms * 1.4),
      delayFirst: true,
      longPauses: true,
    };
  }
  return {
    minMs: Math.round(ms * 0.85),
    maxMs: Math.round(ms * 1.15),
    delayFirst: false,
    longPauses: false,
  };
}

/** Estimated total duration of an n-target batch under a resolved pace. */
export function estimateBatchMs(n: number, pace: ResolvedPace): number {
  if (n <= 0) return 0;
  const gaps = pace.delayFirst ? n : n - 1;
  let avg = (pace.minMs + pace.maxMs) / 2;
  if (pace.longPauses) avg *= 1 + LONG_PAUSE_CHANCE; // long pauses double a gap
  return Math.round(gaps * avg);
}

/** "0.3s" / "2s" / "14s" — a single gap. */
export function gapLabel(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 1000 ? 1 : ms < 2000 ? 1 : 0).replace(/\.0$/, "")}s`;
}

/** "4–8s" / "0.3–0.4s" style range label. */
export function paceRangeLabel(pace: ResolvedPace): string {
  const s = (ms: number) =>
    (ms / 1000).toFixed(ms < 1000 ? 1 : 0).replace(/\.0$/, "");
  return `${s(pace.minMs)}–${s(pace.maxMs)}s`;
}

/** "45s" / "8 min" style duration label. */
export function durationLabel(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `${Math.round(ms / 60_000)} min`;
}
