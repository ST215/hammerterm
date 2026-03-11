import type { StateCreator } from "zustand";
import type { RecorderEvent } from "../../recorder";
import {
  getEventCount,
  getRecentEvents,
  exportRecording,
  setMetadata,
} from "../../recorder";

export interface RecorderSlice {
  recorderOn: boolean;
  recorderEventCount: number;
  recorderRecentEvents: RecorderEvent[];
  toggleRecorder: () => void;
  exportRecorder: () => void;
  refreshRecorderCount: () => void;
}

export const createRecorderSlice: StateCreator<RecorderSlice> = (set, get) => ({
  recorderOn: false,
  recorderEventCount: 0,
  recorderRecentEvents: [],

  toggleRecorder: () => {
    // Just flip the flag — bridge.ts subscribes and handles
    // startRecording/stopRecording in the content script context.
    set((s) => ({ recorderOn: !s.recorderOn }));
  },

  exportRecorder: () => {
    // Enrich export with current game state for diagnostics
    const state = get() as any;
    setMetadata({
      playerCount: state.playersById?.size ?? 0,
      players: (state.lastPlayers ?? []).map((p: any) => ({
        id: p.id,
        smallID: p.smallID,
        name: p.displayName || p.name,
        team: p.team,
        isAlive: p.isAlive,
        clientID: p.clientID,
      })),
      mySmallID: state.mySmallID ?? null,
      myTeam: state.myTeam ?? null,
      myAllies: state.myAllies ? [...state.myAllies] : [],
      currentClientID: state.currentClientID ?? null,
    });
    const data = exportRecording();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hammer-recording-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  refreshRecorderCount: () => {
    const count = getEventCount();
    set((s) => {
      if (s.recorderEventCount === count) return s;
      return {
        recorderEventCount: count,
        recorderRecentEvents: getRecentEvents(20),
      };
    });
  },
});
