import type { StateCreator } from "zustand";

export interface AutoGoldLogEntry {
  ts: number;
  target: string;
  amount: number;
}

export interface AutoGoldTarget {
  id: string;
  name: string;
}

const LOG_CAP = 50;

export interface AutoGoldSlice {
  asGoldRunning: boolean;
  asGoldTargets: AutoGoldTarget[];
  asGoldRatio: number;
  asGoldThreshold: number;
  asGoldCooldownSec: number;
  asGoldLog: AutoGoldLogEntry[];
  asGoldLastSend: Record<string, number>;
  asGoldNextSend: Record<string, number>;
  asGoldAllTeamMode: boolean;
  asGoldAllAlliesMode: boolean;

  setAsGoldRunning: (running: boolean) => void;
  setAsGoldRatio: (ratio: number) => void;
  setAsGoldThreshold: (threshold: number) => void;
  setAsGoldCooldown: (sec: number) => void;
  toggleAsGoldAllTeamMode: () => void;
  toggleAsGoldAllAlliesMode: () => void;
  addAsGoldTarget: (id: string, name: string) => void;
  removeAsGoldTarget: (id: string) => void;
  clearAsGoldTargets: () => void;
  addAsGoldLog: (entry: AutoGoldLogEntry) => void;
  updateAsGoldSendTimes: (targetId: string, lastSend: number, nextSend: number) => void;
  resetAutoGold: () => void;
}

export const createAutoGoldSlice: StateCreator<AutoGoldSlice, [], [], AutoGoldSlice> = (set) => ({
  asGoldRunning: false,
  asGoldTargets: [],
  asGoldRatio: 20,
  asGoldThreshold: 0,
  asGoldCooldownSec: 10,
  asGoldLog: [],
  asGoldLastSend: {},
  asGoldNextSend: {},
  asGoldAllTeamMode: false,
  asGoldAllAlliesMode: false,

  setAsGoldRunning: (running) => set({ asGoldRunning: running }),

  setAsGoldRatio: (ratio) => set({ asGoldRatio: ratio }),

  setAsGoldThreshold: (threshold) => set({ asGoldThreshold: threshold }),

  setAsGoldCooldown: (sec) => set({ asGoldCooldownSec: sec }),

  toggleAsGoldAllTeamMode: () =>
    set((s) => {
      const next = !s.asGoldAllTeamMode;
      return next
        ? { asGoldAllTeamMode: true, asGoldTargets: [] }
        : { asGoldAllTeamMode: false };
    }),

  toggleAsGoldAllAlliesMode: () =>
    set((s) => {
      const next = !s.asGoldAllAlliesMode;
      return next
        ? { asGoldAllAlliesMode: true, asGoldTargets: [] }
        : { asGoldAllAlliesMode: false };
    }),

  addAsGoldTarget: (id, name) =>
    set((s) => {
      if (s.asGoldTargets.some((t) => t.id === id)) return s;
      return {
        asGoldTargets: [...s.asGoldTargets, { id, name }],
        asGoldAllTeamMode: false,
        asGoldAllAlliesMode: false,
      };
    }),

  removeAsGoldTarget: (id) =>
    set((s) => ({
      asGoldTargets: s.asGoldTargets.filter((t) => t.id !== id),
    })),

  clearAsGoldTargets: () => set({ asGoldTargets: [] }),

  addAsGoldLog: (entry) =>
    set((s) => ({
      asGoldLog: [entry, ...s.asGoldLog].slice(0, LOG_CAP),
    })),

  updateAsGoldSendTimes: (targetId, lastSend, nextSend) =>
    set((s) => ({
      asGoldLastSend: { ...s.asGoldLastSend, [targetId]: lastSend },
      asGoldNextSend: { ...s.asGoldNextSend, [targetId]: nextSend },
    })),

  resetAutoGold: () =>
    set({
      asGoldRunning: false,
      asGoldTargets: [],
      asGoldLog: [],
      asGoldLastSend: {},
      asGoldNextSend: {},
    }),
});
