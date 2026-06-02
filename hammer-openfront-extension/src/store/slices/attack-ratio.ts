import type { StateCreator } from "zustand";

export type AttackRatioMode = "manual" | "assist" | "breakeven" | "peak";

/** Live readout written by the governor engine each tick (volatile). */
export interface AttackRatioTelemetry {
  ratio: number; // applied attack ratio, fraction 0.01–1.0
  regenPerSec: number; // troop regeneration, internal units/sec
  troops: number; // current troops, internal units
  maxT: number; // estimated max troops, internal units
  troopPct: number; // troops as % of max (0–100)
  netSlope: number; // net troop change, internal units/sec (+rising / -falling)
}

export interface AttackRatioSlice {
  attackRatioRunning: boolean;
  attackRatioMode: AttackRatioMode;
  attackRatioBasePct: number; // assist-mode: constant ratio %, 1–100
  attackRatioBreakevenPct: number; // break-even target troop level, % of max
  attackRatioFloorPct: number; // safety floor: below this % of max, ratio is clamped low (0 = off)
  attackRatioMaxCap: number; // send cap: max ratio any attack commits, 1–100
  attackRatioTelemetry: AttackRatioTelemetry | null;

  setAttackRatioRunning: (running: boolean) => void;
  setAttackRatioMode: (mode: AttackRatioMode) => void;
  setAttackRatioBasePct: (pct: number) => void;
  setAttackRatioBreakevenPct: (pct: number) => void;
  setAttackRatioFloorPct: (pct: number) => void;
  setAttackRatioMaxCap: (pct: number) => void;
  setAttackRatioTelemetry: (t: AttackRatioTelemetry | null) => void;
  resetAttackRatio: () => void;
}

export const createAttackRatioSlice: StateCreator<
  AttackRatioSlice,
  [],
  [],
  AttackRatioSlice
> = (set) => ({
  attackRatioRunning: false,
  attackRatioMode: "assist",
  attackRatioBasePct: 5,
  attackRatioBreakevenPct: 50,
  attackRatioFloorPct: 25,
  attackRatioMaxCap: 30,
  attackRatioTelemetry: null,

  setAttackRatioRunning: (running) => set({ attackRatioRunning: running }),
  setAttackRatioMode: (mode) => set({ attackRatioMode: mode }),
  setAttackRatioBasePct: (pct) => set({ attackRatioBasePct: pct }),
  setAttackRatioBreakevenPct: (pct) => set({ attackRatioBreakevenPct: pct }),
  setAttackRatioFloorPct: (pct) => set({ attackRatioFloorPct: pct }),
  setAttackRatioMaxCap: (pct) => set({ attackRatioMaxCap: pct }),
  setAttackRatioTelemetry: (t) => set({ attackRatioTelemetry: t }),

  resetAttackRatio: () =>
    set({ attackRatioRunning: false, attackRatioTelemetry: null }),
});
