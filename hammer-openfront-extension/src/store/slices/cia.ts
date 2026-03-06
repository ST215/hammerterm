import type { StateCreator } from "zustand";
import type { CIAState } from "@shared/types";
import { createCIAState } from "@shared/logic/cia";

export interface CIASlice {
  ciaState: CIAState;
  goldRateEnabled: boolean;
  gps30: number;
  gpm60: number;
  gpm120: number;

  getCIAState: () => CIAState;
  setGoldRates: (gps30: number, gpm60: number, gpm120: number) => void;
}

export const createCIASlice: StateCreator<CIASlice, [], [], CIASlice> = (set, get) => ({
  ciaState: createCIAState(),
  goldRateEnabled: true,
  gps30: 0,
  gpm60: 0,
  gpm120: 0,

  getCIAState: () => get().ciaState,

  setGoldRates: (gps30, gpm60, gpm120) => set({ gps30, gpm60, gpm120 }),
});
