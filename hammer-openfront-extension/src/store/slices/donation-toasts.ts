import type { StateCreator } from "zustand";

export interface DonationToast {
  id: number;
  donorName: string;
  type: "troops" | "gold";
  amount: number;
  timestamp: number;
}

const TOAST_CAP = 8;

export interface DonationToastsSlice {
  donationToasts: DonationToast[];
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

  addDonationToast: (toast) =>
    set((s) => {
      const next = [...s.donationToasts, toast];
      if (next.length > TOAST_CAP) next.shift();
      return { donationToasts: next };
    }),

  dismissDonationToast: (id) =>
    set((s) => ({
      donationToasts: s.donationToasts.filter((t) => t.id !== id),
    })),

  resetDonationToasts: () => set({ donationToasts: [] }),
});
