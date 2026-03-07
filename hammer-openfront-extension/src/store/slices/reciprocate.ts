import type { StateCreator } from "zustand";
import type { PalantirPhase } from "@shared/logic/palantir";

export interface PalantirDecision {
  sacrificeRatio: number;
  loyaltyMultiplier: number;
  teammateMultiplier: number;
  selfMod: number;
  phase: PalantirPhase;
  rawAmount: number;
  flooredAmount: number;
  cappedAmount: number;
  donorTroops: number;
  sendCount: number;
}

export interface ReciprocateHistoryEntry {
  donorId: string;
  donorName: string;
  percentage: number;
  timestamp: number;
  mode: string;
  troopsSent?: number;
  goldSent?: number;
  palantir?: PalantirDecision;
}

export interface ReciprocateNotification {
  id: number;
  donorId: string;
  donorName: string;
  troops: number;
  gold: number;
  timestamp: number;
  dismissed: boolean;
}

export interface ReciprocatePendingItem {
  donorId: string;
  donorName: string;
  amountReceived: number;
  receivedType: string;
  addedAt: number;
}

const HISTORY_CAP = 100;
const NOTIFICATION_CAP = 5;

export interface ReciprocateSlice {
  reciprocateEnabled: boolean;
  reciprocateMode: "manual" | "auto" | "palantir";
  reciprocateAutoPct: number;
  reciprocateOnTroops: boolean;
  reciprocateOnGold: boolean;
  reciprocatePopupsEnabled: boolean;
  reciprocateNotifyDuration: number;
  reciprocateNotifySound: boolean;
  reciprocateHistory: ReciprocateHistoryEntry[];
  reciprocateNotifications: ReciprocateNotification[];
  reciprocatePending: ReciprocatePendingItem[];

  toggleReciprocateEnabled: () => void;
  setReciprocateMode: (mode: "manual" | "auto" | "palantir") => void;
  setReciprocateAutoPct: (pct: number) => void;
  toggleReciprocateOnTroops: () => void;
  toggleReciprocateOnGold: () => void;
  toggleReciprocatePopupsEnabled: () => void;
  setReciprocateNotifyDuration: (duration: number) => void;
  addReciprocateHistory: (entry: ReciprocateHistoryEntry) => void;
  addReciprocateNotification: (notification: ReciprocateNotification) => void;
  dismissReciprocateNotification: (id: number) => void;
  clearReciprocateNotifications: () => void;
  addReciprocatePending: (item: ReciprocatePendingItem) => void;
  removeReciprocatePending: (index: number) => void;
  resetReciprocate: () => void;
}

export const createReciprocateSlice: StateCreator<ReciprocateSlice, [], [], ReciprocateSlice> = (
  set,
) => ({
  reciprocateEnabled: true,
  reciprocateMode: "manual",
  reciprocateAutoPct: 50,
  reciprocateOnTroops: true,
  reciprocateOnGold: false,
  reciprocatePopupsEnabled: true,
  reciprocateNotifyDuration: 30,
  reciprocateNotifySound: false,
  reciprocateHistory: [],
  reciprocateNotifications: [],
  reciprocatePending: [],

  toggleReciprocateEnabled: () =>
    set((s) => ({ reciprocateEnabled: !s.reciprocateEnabled })),

  setReciprocateMode: (mode) => set({ reciprocateMode: mode }),

  setReciprocateAutoPct: (pct) => set({ reciprocateAutoPct: pct }),

  toggleReciprocateOnTroops: () =>
    set((s) => ({ reciprocateOnTroops: !s.reciprocateOnTroops })),

  toggleReciprocateOnGold: () =>
    set((s) => ({ reciprocateOnGold: !s.reciprocateOnGold })),

  toggleReciprocatePopupsEnabled: () =>
    set((s) => ({ reciprocatePopupsEnabled: !s.reciprocatePopupsEnabled })),

  setReciprocateNotifyDuration: (duration) =>
    set({ reciprocateNotifyDuration: duration }),

  addReciprocateHistory: (entry) =>
    set((s) => ({
      reciprocateHistory: [entry, ...s.reciprocateHistory].slice(0, HISTORY_CAP),
    })),

  addReciprocateNotification: (notification) =>
    set((s) => {
      const existing = s.reciprocateNotifications.find(
        (n) => n.donorId === notification.donorId && !n.dismissed,
      );
      if (existing) {
        return {
          reciprocateNotifications: s.reciprocateNotifications.map((n) =>
            n === existing
              ? {
                  ...n,
                  troops: n.troops + notification.troops,
                  gold: n.gold + notification.gold,
                  timestamp: notification.timestamp,
                }
              : n,
          ),
        };
      }
      const next = [...s.reciprocateNotifications, notification];
      if (next.length > NOTIFICATION_CAP) next.shift();
      return { reciprocateNotifications: next };
    }),

  dismissReciprocateNotification: (id) =>
    set((s) => ({
      reciprocateNotifications: s.reciprocateNotifications.map((n) =>
        n.id === id ? { ...n, dismissed: true } : n,
      ),
    })),

  clearReciprocateNotifications: () => set({ reciprocateNotifications: [] }),

  addReciprocatePending: (item) =>
    set((s) => ({
      reciprocatePending: [...s.reciprocatePending, item],
    })),

  removeReciprocatePending: (index) =>
    set((s) => ({
      reciprocatePending: s.reciprocatePending.filter((_, i) => i !== index),
    })),

  resetReciprocate: () =>
    set({
      reciprocateHistory: [],
      reciprocateNotifications: [],
      reciprocatePending: [],
    }),
});
