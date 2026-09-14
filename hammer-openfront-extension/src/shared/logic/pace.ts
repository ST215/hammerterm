/**
 * Comms pacing profiles — how multi-target sends are spaced out.
 *
 * A profile resolves to a [minMs, maxMs] gap range plus two humanizing flags:
 * delayFirst (a real person can't have sent the first message the instant
 * they decided to) and longPauses (occasionally a gap doubles, like losing a
 * target on the map). All presets — no free-typed ranges; number inputs
 * proved too clunky to use mid-match.
 */

export type PaceProfileId = "instant" | "quick" | "brisk" | "human";

export interface ResolvedPace {
  minMs: number;
  maxMs: number;
  delayFirst: boolean;
  longPauses: boolean;
}

export const PACE_PROFILES: Record<PaceProfileId, ResolvedPace> = {
  instant: { minMs: 300, maxMs: 450, delayFirst: false, longPauses: false },
  quick: { minMs: 900, maxMs: 1400, delayFirst: false, longPauses: false },
  brisk: { minMs: 3000, maxMs: 7000, delayFirst: true, longPauses: true },
  human: { minMs: 6000, maxMs: 14000, delayFirst: true, longPauses: true },
};

export const PACE_PROFILE_IDS: PaceProfileId[] = [
  "instant",
  "quick",
  "brisk",
  "human",
];

/** Chance that a longPauses gap doubles (mirrored in sendPaced). */
export const LONG_PAUSE_CHANCE = 0.15;

export function resolvePace(profile: PaceProfileId): ResolvedPace {
  return PACE_PROFILES[profile] ?? PACE_PROFILES.quick;
}

/** Estimated total duration of an n-target batch under a resolved pace. */
export function estimateBatchMs(n: number, pace: ResolvedPace): number {
  if (n <= 0) return 0;
  const gaps = pace.delayFirst ? n : n - 1;
  let avg = (pace.minMs + pace.maxMs) / 2;
  if (pace.longPauses) avg *= 1 + LONG_PAUSE_CHANCE; // long pauses double a gap
  return Math.round(gaps * avg);
}

/** "6–14s" / "0.3–0.5s" style range label. */
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
