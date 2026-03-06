import type { StateCreator } from "zustand";

export interface UISlice {
  view: string;
  paused: boolean;
  minimized: boolean;
  sizeIdx: number;
  displayMode: "overlay" | "window";
  uiVisible: boolean;

  setView: (view: string) => void;
  togglePaused: () => void;
  toggleMinimized: () => void;
  setSizeIdx: (idx: number) => void;
  setDisplayMode: (mode: "overlay" | "window") => void;
  setUIVisible: (visible: boolean) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  view: "about",
  paused: false,
  minimized: false,
  sizeIdx: 1,
  displayMode: "overlay",
  uiVisible: true,

  setView: (view) => set({ view }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleMinimized: () => set((s) => ({ minimized: !s.minimized })),
  setSizeIdx: (sizeIdx) => set({ sizeIdx }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  setUIVisible: (uiVisible) => set({ uiVisible }),
});
