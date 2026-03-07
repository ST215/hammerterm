import type { StateCreator } from "zustand";

export interface AutoTroopsLogEntry {
  ts: number;
  target: string;
  amount: number;
}

export interface AutoTroopsTarget {
  id: string;
  name: string;
}

const LOG_CAP = 50;

export interface AutoTroopsSlice {
  asTroopsRunning: boolean;
  asTroopsTargets: AutoTroopsTarget[];
  asTroopsRatio: number;
  asTroopsThreshold: number;
  asTroopsCooldownSec: number;
  asTroopsLog: AutoTroopsLogEntry[];
  asTroopsLastSend: Record<string, number>;
  asTroopsNextSend: Record<string, number>;
  asTroopsAllTeamMode: boolean;
  asTroopsAllAlliesMode: boolean;

  setAsTroopsRunning: (running: boolean) => void;
  setAsTroopsRatio: (ratio: number) => void;
  setAsTroopsThreshold: (threshold: number) => void;
  setAsTroopsCooldown: (sec: number) => void;
  toggleAsTroopsAllTeamMode: () => void;
  toggleAsTroopsAllAlliesMode: () => void;
  addAsTroopsTarget: (id: string, name: string) => void;
  removeAsTroopsTarget: (id: string) => void;
  clearAsTroopsTargets: () => void;
  addAsTroopsLog: (entry: AutoTroopsLogEntry) => void;
  updateAsTroopsSendTimes: (targetId: string, lastSend: number, nextSend: number) => void;
  resetAutoTroops: () => void;
}

export const createAutoTroopsSlice: StateCreator<AutoTroopsSlice, [], [], AutoTroopsSlice> = (
  set,
) => ({
  asTroopsRunning: false,
  asTroopsTargets: [],
  asTroopsRatio: 20,
  asTroopsThreshold: 50,
  asTroopsCooldownSec: 10,
  asTroopsLog: [],
  asTroopsLastSend: {},
  asTroopsNextSend: {},
  asTroopsAllTeamMode: false,
  asTroopsAllAlliesMode: false,

  setAsTroopsRunning: (running) => set({ asTroopsRunning: running }),

  setAsTroopsRatio: (ratio) => set({ asTroopsRatio: ratio }),

  setAsTroopsThreshold: (threshold) => set({ asTroopsThreshold: threshold }),

  setAsTroopsCooldown: (sec) => set({ asTroopsCooldownSec: sec }),

  toggleAsTroopsAllTeamMode: () =>
    set((s) => {
      const next = !s.asTroopsAllTeamMode;
      // When enabling, clear manual targets (they overlap with group mode)
      return next
        ? { asTroopsAllTeamMode: true, asTroopsTargets: [] }
        : { asTroopsAllTeamMode: false };
    }),

  toggleAsTroopsAllAlliesMode: () =>
    set((s) => {
      const next = !s.asTroopsAllAlliesMode;
      return next
        ? { asTroopsAllAlliesMode: true, asTroopsTargets: [] }
        : { asTroopsAllAlliesMode: false };
    }),

  addAsTroopsTarget: (id, name) =>
    set((s) => {
      if (s.asTroopsTargets.some((t) => t.id === id)) return s;
      return {
        asTroopsTargets: [...s.asTroopsTargets, { id, name }],
        asTroopsAllTeamMode: false,
        asTroopsAllAlliesMode: false,
      };
    }),

  removeAsTroopsTarget: (id) =>
    set((s) => ({
      asTroopsTargets: s.asTroopsTargets.filter((t) => t.id !== id),
    })),

  clearAsTroopsTargets: () => set({ asTroopsTargets: [] }),

  addAsTroopsLog: (entry) =>
    set((s) => ({
      asTroopsLog: [entry, ...s.asTroopsLog].slice(0, LOG_CAP),
    })),

  updateAsTroopsSendTimes: (targetId, lastSend, nextSend) =>
    set((s) => ({
      asTroopsLastSend: { ...s.asTroopsLastSend, [targetId]: lastSend },
      asTroopsNextSend: { ...s.asTroopsNextSend, [targetId]: nextSend },
    })),

  resetAutoTroops: () =>
    set({
      asTroopsRunning: false,
      asTroopsTargets: [],
      asTroopsLog: [],
      asTroopsLastSend: {},
      asTroopsNextSend: {},
    }),
});
