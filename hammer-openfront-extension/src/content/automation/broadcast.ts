/**
 * broadcast.ts — Auto-repeat emoji broadcast engine.
 *
 * Sends emoji broadcasts to "AllPlayers" on a fixed 10s interval
 * (matches the game's built-in cooldown).
 * Supports single emoji or cycling through a sequence.
 */

import { useStore } from "@store/index";
import { sendEmoji } from "../game/send";
import { registerInterval } from "../cleanup";
import { record } from "../../recorder";

const BROADCAST_INTERVAL_MS = 10_000;

let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let sequenceIdx = 0;

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

function broadcastTick(): void {
  const s = useStore.getState();

  if (s.isReplay) return; // no automation during replay playback

  if (!s.broadcastEnabled) {
    syncBroadcastLoop(false);
    return;
  }

  let emoji: number;
  if (s.broadcastUseSequence && s.broadcastSequence.length > 0) {
    emoji = s.broadcastSequence[sequenceIdx % s.broadcastSequence.length];
    sequenceIdx++;
  } else {
    emoji = s.broadcastEmojiIndex;
  }

  sendEmoji("AllPlayers", emoji);
  record("cmd", "broadcast", { emoji });
  log("[BROADCAST] Sent emoji", emoji);
}

// UI toggles only flip the flag; the loop runs in the game tab (automation runtime).
export function broadcastStart(): void {
  useStore.getState().setBroadcastEnabled(true);
}

export function broadcastStop(): void {
  useStore.getState().setBroadcastEnabled(false);
}

/** Game tab only (automation runtime): run or halt the loop to match the flag. */
export function syncBroadcastLoop(enabled: boolean): void {
  if (enabled && !broadcastTimer) {
    sequenceIdx = 0;
    broadcastTimer = setInterval(broadcastTick, BROADCAST_INTERVAL_MS);
    registerInterval(broadcastTimer);
    broadcastTick(); // Send immediately
    log("[BROADCAST] Started");
  } else if (!enabled && broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
    sequenceIdx = 0;
    log("[BROADCAST] Stopped");
  }
}
