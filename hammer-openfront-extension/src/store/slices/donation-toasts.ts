import type { StateCreator } from "zustand";

export interface DonationToast {
  id: number;
  playerName: string;
  type: "troops" | "gold";
  amount: number;
  direction: "in" | "out";
  timestamp: number;
  /** @deprecated use playerName */
  donorName?: string;
}

export interface PlayerDonationStats {
  receivedCount: number;
  troopsReceived: number;
  goldReceived: number;
  troopsSent: number;
  goldSent: number;
}

const TOAST_CAP = 20;

export interface DonationToastsSlice {
  donationToasts: DonationToast[];
  donationHistory: Record<string, PlayerDonationStats>;
  addDonationToast: (toast: DonationToast) => void;
  dismissDonationToast: (id: number) => void;
  resetDonationToasts: () => void;
}

export const createDonationToastsSlice: StateCreator<
  DonationToastsSlice,
  [],
  [],
  DonationToastsSlice
> = (set) => ({
  donationToasts: [],
  donationHistory: {},

  addDonationToast: (toast) =>
    set((s) => {
      const key = toast.playerName;
      const prev: PlayerDonationStats = s.donationHistory[key] ?? {
        receivedCount: 0, troopsReceived: 0, goldReceived: 0, troopsSent: 0, goldSent: 0,
      };
      const updated: PlayerDonationStats = toast.direction === "in"
        ? {
            ...prev,
            receivedCount: prev.receivedCount + 1,
            troopsReceived: prev.troopsReceived + (toast.type === "troops" ? toast.amount : 0),
            goldReceived: prev.goldReceived + (toast.type === "gold" ? toast.amount : 0),
          }
        : {
            ...prev,
            troopsSent: prev.troopsSent + (toast.type === "troops" ? toast.amount : 0),
            goldSent: prev.goldSent + (toast.type === "gold" ? toast.amount : 0),
          };

      const next = [...s.donationToasts, toast];
      if (next.length > TOAST_CAP) next.shift();
      return {
        donationToasts: next,
        donationHistory: { ...s.donationHistory, [key]: updated },
      };
    }),

  dismissDonationToast: (id) =>
    set((s) => ({
      donationToasts: s.donationToasts.filter((t) => t.id !== id),
    })),

  resetDonationToasts: () => set({ donationToasts: [], donationHistory: {} }),
});
