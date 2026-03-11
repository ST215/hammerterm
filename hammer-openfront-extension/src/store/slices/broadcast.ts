import type { StateCreator } from "zustand";

export interface BroadcastSlice {
  broadcastEnabled: boolean;
  broadcastEmojiIndex: number;
  broadcastSequence: number[];
  broadcastUseSequence: boolean;

  setBroadcastEnabled: (v: boolean) => void;
  setBroadcastEmojiIndex: (i: number) => void;
  setBroadcastSequence: (seq: number[]) => void;
  setBroadcastUseSequence: (v: boolean) => void;
  resetBroadcast: () => void;
}

export const createBroadcastSlice: StateCreator<BroadcastSlice, [], [], BroadcastSlice> = (
  set,
) => ({
  broadcastEnabled: false,
  broadcastEmojiIndex: 33,
  broadcastSequence: [],
  broadcastUseSequence: false,

  setBroadcastEnabled: (v) => set({ broadcastEnabled: v }),
  setBroadcastEmojiIndex: (i) => set({ broadcastEmojiIndex: i }),
  setBroadcastSequence: (seq) => set({ broadcastSequence: seq }),
  setBroadcastUseSequence: (v) => set({ broadcastUseSequence: v }),
  resetBroadcast: () =>
    set({
      broadcastEnabled: false,
      broadcastSequence: [],
      broadcastUseSequence: false,
    }),
});
