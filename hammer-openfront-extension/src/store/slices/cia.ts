import type { StateCreator } from "zustand";
import type { CIAState } from "@shared/types";
import { createCIAState } from "@shared/logic/cia";

export type CIAFeedFilter = "all" | "gold" | "troops" | "large";

export interface CIASlice {
  ciaState: CIAState;
  goldRateEnabled: boolean;
  gps30: number;
  gpm60: number;
  gpm120: number;
  ciaWindowMs: number;
  ciaFeedFilter: CIAFeedFilter;

  getCIAState: () => CIAState;
  setGoldRates: (gps30: number, gpm60: number, gpm120: number) => void;
  setCIAWindow: (ms: number) => void;
  setCIAFeedFilter: (filter: CIAFeedFilter) => void;
}

export const createCIASlice: StateCreator<CIASlice, [], [], CIASlice> = (set, get) => ({
  ciaState: createCIAState(),
  goldRateEnabled: true,
  gps30: 0,
  gpm60: 0,
  gpm120: 0,
  ciaWindowMs: 300_000,
  ciaFeedFilter: "all",

  getCIAState: () => get().ciaState,

  setGoldRates: (gps30, gpm60, gpm120) => set({ gps30, gpm60, gpm120 }),
  setCIAWindow: (ciaWindowMs) => set({ ciaWindowMs }),
  setCIAFeedFilter: (ciaFeedFilter) => set({ ciaFeedFilter }),
});
