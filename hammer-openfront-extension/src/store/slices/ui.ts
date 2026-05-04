import type { StateCreator } from "zustand";
import type { NotifPosition } from "@shared/notif-position";

export interface UISlice {
  view: string;
  paused: boolean;
  minimized: boolean;
  sizeIdx: number;
  displayMode: "overlay" | "window";
  uiVisible: boolean;
  toastInboundTroops: boolean;
  toastInboundGold: boolean;
  toastOutboundTroops: boolean;
  toastOutboundGold: boolean;
  toastScale: number;
  statusToastScale: number;
  reciprocatePosition: NotifPosition;
  donationPosition: NotifPosition;

  setView: (view: string) => void;
  togglePaused: () => void;
  toggleMinimized: () => void;
  setSizeIdx: (idx: number) => void;
  setDisplayMode: (mode: "overlay" | "window") => void;
  setUIVisible: (visible: boolean) => void;
  setToastInboundTroops: (v: boolean) => void;
  setToastInboundGold: (v: boolean) => void;
  setToastOutboundTroops: (v: boolean) => void;
  setToastOutboundGold: (v: boolean) => void;
  setToastScale: (v: number) => void;
  setStatusToastScale: (v: number) => void;
  setReciprocatePosition: (v: NotifPosition) => void;
  setDonationPosition: (v: NotifPosition) => void;
  panelWidth: number;
  setPanelWidth: (w: number) => void;
  externalOpen: boolean;
  setExternalOpen: (v: boolean) => void;
  /** When false, in-browser overlay shows only the Hammer tab. Click to reveal the rest. */
  tabsRevealed: boolean;
  setTabsRevealed: (v: boolean) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  view: "hammer",
  paused: false,
  minimized: false,
  sizeIdx: 1,
  displayMode: "overlay",
  uiVisible: true,
  toastInboundTroops: true,
  toastInboundGold: true,
  toastOutboundTroops: true,
  toastOutboundGold: true,
  toastScale: 1.0,
  statusToastScale: 1.0,
  reciprocatePosition: "center-right",
  donationPosition: "center-right",

  setView: (view) => set({ view }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleMinimized: () => set((s) => ({ minimized: !s.minimized })),
  setSizeIdx: (sizeIdx) => set({ sizeIdx }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  setUIVisible: (uiVisible) => set({ uiVisible }),
  setToastInboundTroops: (v) => set({ toastInboundTroops: v }),
  setToastInboundGold: (v) => set({ toastInboundGold: v }),
  setToastOutboundTroops: (v) => set({ toastOutboundTroops: v }),
  setToastOutboundGold: (v) => set({ toastOutboundGold: v }),
  setToastScale: (v) => set({ toastScale: v }),
  setStatusToastScale: (v) => set({ statusToastScale: v }),
  setReciprocatePosition: (v) => set({ reciprocatePosition: v }),
  setDonationPosition: (v) => set({ donationPosition: v }),
  panelWidth: 850,
  setPanelWidth: (w) => set((s) => s.panelWidth === w ? s : { panelWidth: w }),
  externalOpen: false,
  setExternalOpen: (v) => set({ externalOpen: v }),
  tabsRevealed: false,
  setTabsRevealed: (v) => set({ tabsRevealed: v }),
});
