import type { StateCreator } from "zustand";

/**
 * Store mode ids (kept stable for sync/persistence). UI labels:
 *   manual → "Watch", assist → "Fixed %", breakeven → "Hold %", peak → "Peak 42%".
 */
export type AttackRatioMode = "manual" | "assist" | "breakeven" | "peak";

/**
 * Where the governor is right now (computed in the MAIN world):
 *   off       — not running
 *   watch     — running in Watch mode: numbers only, nothing enforced
 *   paused    — running but nothing to govern (spawn phase / replay)
 *   standby   — waiting for troops to first reach the arm level this match
 *   governing — engaged; attacks send the allowed amount
 *   holding   — engaged; nothing spendable, clicks are being held
 */
export type GovernorState = "off" | "watch" | "paused" | "standby" | "governing" | "holding";

/** Live readout emitted by the MAIN-world governor ~2×/sec (all troops internal units). */
export interface AttackRatioTelemetry {
  state: GovernorState;
  mode: AttackRatioMode;
  ratio: number; // slider value last written, fraction 0.01–1.0 (0 = not writing)
  troops: number;
  maxTroops: number; // exact cap from the game (cities included)
  troopPct: number; // troops as % of max (0–100)
  regenPerSec: number;
  netSlope: number; // net troop change per sec (+rising / -falling)
  pending: number; // sent but not yet deducted by the server
  allowed: number; // what the next attack may send
  armPct: number; // % of max the governor engages at
  held: number; // clicks held this match
  trimmed: number; // clicks trimmed this match
}

export interface AttackRatioSlice {
  attackRatioRunning: boolean;
  attackRatioMode: AttackRatioMode;
  attackRatioBasePct: number; // Fixed %: % of troops each attack sends, 1–100
  attackRatioBreakevenPct: number; // Hold %: troop level to hold, % of max
  attackRatioFloorPct: number; // Fixed %: never drop below this % of max (0 = off)
  attackRatioMaxCap: number; // Peak/Hold: max % of current troops per attack
  attackRatioTelemetry: AttackRatioTelemetry | null;
  /** My exact troop cap / regen from the game (0 = not known yet). */
  myMaxTroops: number;
  myRegenPerSec: number;

  setAttackRatioRunning: (running: boolean) => void;
  setAttackRatioMode: (mode: AttackRatioMode) => void;
  setAttackRatioBasePct: (pct: number) => void;
  setAttackRatioBreakevenPct: (pct: number) => void;
  setAttackRatioFloorPct: (pct: number) => void;
  setAttackRatioMaxCap: (pct: number) => void;
  setAttackRatioTelemetry: (t: AttackRatioTelemetry | null) => void;
  setMyCap: (maxTroops: number, regenPerSec: number) => void;
  resetAttackRatio: () => void;
}

export const createAttackRatioSlice: StateCreator<
  AttackRatioSlice,
  [],
  [],
  AttackRatioSlice
> = (set) => ({
  attackRatioRunning: false,
  attackRatioMode: "peak",
  attackRatioBasePct: 5,
  attackRatioBreakevenPct: 50,
  attackRatioFloorPct: 42,
  attackRatioMaxCap: 75,
  attackRatioTelemetry: null,
  myMaxTroops: 0,
  myRegenPerSec: 0,

  setAttackRatioRunning: (running) => set({ attackRatioRunning: running }),
  setAttackRatioMode: (mode) => set({ attackRatioMode: mode }),
  setAttackRatioBasePct: (pct) => set({ attackRatioBasePct: pct }),
  setAttackRatioBreakevenPct: (pct) => set({ attackRatioBreakevenPct: pct }),
  setAttackRatioFloorPct: (pct) => set({ attackRatioFloorPct: pct }),
  setAttackRatioMaxCap: (pct) => set({ attackRatioMaxCap: pct }),
  setAttackRatioTelemetry: (t) => set({ attackRatioTelemetry: t }),
  setMyCap: (maxTroops, regenPerSec) =>
    set((s) =>
      s.myMaxTroops === maxTroops && s.myRegenPerSec === regenPerSec
        ? s
        : { myMaxTroops: maxTroops, myRegenPerSec: regenPerSec },
    ),

  // Match reset: the governor keeps running across matches (the MAIN world
  // re-arms per match on its own); only clear the previous match's readouts.
  resetAttackRatio: () => set({ attackRatioTelemetry: null, myMaxTroops: 0, myRegenPerSec: 0 }),
});
