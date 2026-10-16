import type { StateCreator } from "zustand";

export interface CommsRecentEntry {
  type: string;
  label: string;
  targetName: string;
  ts: number;
}

export interface CommsPendingQC {
  key: string;
  targetId: string;
}

export interface CommsActiveBatch {
  label: string;
  sent: number;
  total: number;
}

const RECENT_CAP = 20;

export interface CommsSlice {
  commsTargets: Set<string>;
  commsGroupMode: string;
  commsOthersExpanded: boolean;
  commsPendingQC: CommsPendingQC | null;
  commsRecentSent: CommsRecentEntry[];
  allianceCommsExpanded: Map<string, boolean>;
  /** Multi-target send pacing (persisted — survive resetComms). Average gap, ms. */
  commsPaceMs: number;
  /** Humanize: wider random gaps, delayed first send, occasional long pause. */
  commsPaceHuman: boolean;
  /** Active paced batch (context-local; shown by the status strip). */
  commsActiveBatch: CommsActiveBatch | null;

  setCommsTargets: (targets: Set<string>) => void;
  addCommsTarget: (id: string) => void;
  removeCommsTarget: (id: string) => void;
  clearCommsTargets: () => void;
  setCommsGroupMode: (mode: string) => void;
  toggleCommsOthersExpanded: () => void;
  setCommsPendingQC: (pending: CommsPendingQC | null) => void;
  setCommsPace: (ms: number, human: boolean) => void;
  setCommsActiveBatch: (batch: CommsActiveBatch | null) => void;
  addCommsRecentSent: (entry: CommsRecentEntry) => void;
  toggleAllianceCommsExpanded: (id: string) => void;
  resetComms: () => void;
}

export const createCommsSlice: StateCreator<CommsSlice, [], [], CommsSlice> = (set) => ({
  commsTargets: new Set(),
  commsGroupMode: "none",
  commsOthersExpanded: false,
  commsPendingQC: null,
  commsRecentSent: [],
  allianceCommsExpanded: new Map(),
  commsPaceMs: 5000,
  commsPaceHuman: true,
  commsActiveBatch: null,

  setCommsTargets: (targets) => set({ commsTargets: targets }),

  addCommsTarget: (id) =>
    set((s) => {
      const next = new Set(s.commsTargets);
      next.add(id);
      return { commsTargets: next };
    }),

  removeCommsTarget: (id) =>
    set((s) => {
      const next = new Set(s.commsTargets);
      next.delete(id);
      return { commsTargets: next };
    }),

  clearCommsTargets: () => set({ commsTargets: new Set() }),

  setCommsGroupMode: (mode) => set({ commsGroupMode: mode }),

  toggleCommsOthersExpanded: () =>
    set((s) => ({ commsOthersExpanded: !s.commsOthersExpanded })),

  setCommsPendingQC: (pending) => set({ commsPendingQC: pending }),

  setCommsPace: (ms, human) => set({ commsPaceMs: ms, commsPaceHuman: human }),

  setCommsActiveBatch: (batch) => set({ commsActiveBatch: batch }),

  addCommsRecentSent: (entry) =>
    set((s) => ({
      commsRecentSent: [entry, ...s.commsRecentSent].slice(0, RECENT_CAP),
    })),

  toggleAllianceCommsExpanded: (id) =>
    set((s) => {
      const next = new Map(s.allianceCommsExpanded);
      next.set(id, !next.get(id));
      return { allianceCommsExpanded: next };
    }),

  resetComms: () =>
    set({
      commsTargets: new Set(),
      commsPendingQC: null,
      commsRecentSent: [],
      allianceCommsExpanded: new Map(),
      commsActiveBatch: null,
    }),
});
