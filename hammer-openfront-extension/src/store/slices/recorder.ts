import type { StateCreator } from "zustand";
import type { RecorderEvent } from "../../recorder";
import {
  getEventCount,
  getRecentEvents,
  exportRecording,
} from "../../recorder";

export interface RecorderSlice {
  recorderOn: boolean;
  recorderEventCount: number;
  recorderRecentEvents: RecorderEvent[];
  toggleRecorder: () => void;
  exportRecorder: () => void;
  refreshRecorderCount: () => void;
}

export const createRecorderSlice: StateCreator<RecorderSlice> = (set) => ({
  recorderOn: false,
  recorderEventCount: 0,
  recorderRecentEvents: [],

  toggleRecorder: () => {
    // Just flip the flag — bridge.ts subscribes and handles
    // startRecording/stopRecording in the content script context.
    set((s) => ({ recorderOn: !s.recorderOn }));
  },

  exportRecorder: () => {
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
    set({
      recorderEventCount: getEventCount(),
      recorderRecentEvents: getRecentEvents(20),
    });
  },
});
