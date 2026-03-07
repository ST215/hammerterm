import type { StateCreator } from "zustand";
import {
  startRecording,
  stopRecording,
  isRecording,
  getEventCount,
  exportRecording,
  record,
} from "../../recorder";
import { getHookStatus } from "../../content/bridge";

export interface RecorderSlice {
  recorderOn: boolean;
  recorderEventCount: number;
  toggleRecorder: () => void;
  exportRecorder: () => void;
  refreshRecorderCount: () => void;
}

export const createRecorderSlice: StateCreator<RecorderSlice> = (set) => ({
  recorderOn: false,
  recorderEventCount: 0,

  toggleRecorder: () => {
    if (isRecording()) {
      stopRecording();
      set({ recorderOn: false, recorderEventCount: getEventCount() });
    } else {
      startRecording();
      // Snapshot current hook status so recording always starts with context
      try {
        const status = getHookStatus();
        for (const [hook, found] of Object.entries(status)) {
          record("hook", hook + (found ? ".found" : ".missing"), { found, snapshot: true });
        }
      } catch {
        // getHookStatus may not be available in dashboard context
      }
      set({ recorderOn: true, recorderEventCount: 0 });
    }
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
    set({ recorderEventCount: getEventCount() });
  },
});
