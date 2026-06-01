import type { StateCreator } from "zustand";
import type { NotifPosition } from "@shared/notif-position";

/**
 * The in-game overlay's presentation state — one canonical enum replacing the
 * old uiVisible/minimized/tabsRevealed/displayMode tangle.
 *
 *  - "disguised": innocuous "match analytics" card (default; stream-safe).
 *  - "revealed":  full Hammer terminal inline (tab bar + active view).
 *  - "hidden":    overlay renders nothing at all (used while the external
 *                 window is driving, so a shared screen shows only the game).
 *
 * Invariant: externalOpen === true  ⇒  inGameView === "hidden".
 * Enforced in setExternalOpen below — the one place external state changes.
 */
export type InGameView = "disguised" | "revealed" | "hidden";

export interface UISlice {
  view: string;
  paused: boolean;
  sizeIdx: number;
  inGameView: InGameView;
  externalOpen: boolean;
  toastInboundTroops: boolean;
  toastInboundGold: boolean;
  toastOutboundTroops: boolean;
  toastOutboundGold: boolean;
  toastScale: number;
  statusToastScale: number;
  reciprocatePosition: NotifPosition;
  donationPosition: NotifPosition;
  statusPosition: NotifPosition;
  growthPosition: NotifPosition;
  /** Master switch — when false, no on-screen popups render at all. */
  popupsEnabled: boolean;
  /** Show the Growth HUD overlay (independent of auto-troops running). */
  growthHudEnabled: boolean;
  panelWidth: number;

  setView: (view: string) => void;
  togglePaused: () => void;
  setSizeIdx: (idx: number) => void;
  setInGameView: (next: InGameView) => void;
  revealInGame: () => void;
  disguiseInGame: () => void;
  hideInGame: () => void;
  setExternalOpen: (v: boolean) => void;
  setToastInboundTroops: (v: boolean) => void;
  setToastInboundGold: (v: boolean) => void;
  setToastOutboundTroops: (v: boolean) => void;
  setToastOutboundGold: (v: boolean) => void;
  setToastScale: (v: number) => void;
  setStatusToastScale: (v: number) => void;
  setReciprocatePosition: (v: NotifPosition) => void;
  setDonationPosition: (v: NotifPosition) => void;
  setStatusPosition: (v: NotifPosition) => void;
  setGrowthPosition: (v: NotifPosition) => void;
  setPopupsEnabled: (v: boolean) => void;
  setGrowthHudEnabled: (v: boolean) => void;
  setPanelWidth: (w: number) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  view: "hammer",
  paused: false,
  sizeIdx: 1,
  inGameView: "disguised",
  externalOpen: false,
  toastInboundTroops: true,
  toastInboundGold: true,
  toastOutboundTroops: true,
  toastOutboundGold: true,
  toastScale: 1.0,
  statusToastScale: 1.0,
  reciprocatePosition: "center-right",
  donationPosition: "center-right",
  statusPosition: "center",
  growthPosition: "bottom-left",
  popupsEnabled: true,
  growthHudEnabled: true,
  panelWidth: 850,

  setView: (view) => set({ view }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setSizeIdx: (sizeIdx) => set({ sizeIdx }),

  setInGameView: (inGameView) => set({ inGameView }),
  revealInGame: () => set({ inGameView: "revealed" }),
  disguiseInGame: () => set({ inGameView: "disguised" }),
  hideInGame: () => set({ inGameView: "hidden" }),

  // Authoritative external-window state. Opening hides the in-game overlay;
  // closing restores it to the disguised card (the guaranteed "way back").
  setExternalOpen: (v) =>
    set((s) => {
      if (v) return { externalOpen: true, inGameView: "hidden" };
      return {
        externalOpen: false,
        inGameView: s.inGameView === "hidden" ? "disguised" : s.inGameView,
      };
    }),

  setToastInboundTroops: (v) => set({ toastInboundTroops: v }),
  setToastInboundGold: (v) => set({ toastInboundGold: v }),
  setToastOutboundTroops: (v) => set({ toastOutboundTroops: v }),
  setToastOutboundGold: (v) => set({ toastOutboundGold: v }),
  setToastScale: (v) => set({ toastScale: v }),
  setStatusToastScale: (v) => set({ statusToastScale: v }),
  setReciprocatePosition: (v) => set({ reciprocatePosition: v }),
  setDonationPosition: (v) => set({ donationPosition: v }),
  setStatusPosition: (v) => set({ statusPosition: v }),
  setGrowthPosition: (v) => set({ growthPosition: v }),
  setPopupsEnabled: (v) => set({ popupsEnabled: v }),
  setGrowthHudEnabled: (v) => set({ growthHudEnabled: v }),
  setPanelWidth: (w) => set((s) => (s.panelWidth === w ? s : { panelWidth: w })),
});
