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

  if (!s.broadcastEnabled) {
    broadcastStop();
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

export function broadcastStart(): void {
  const s = useStore.getState();
  if (s.broadcastEnabled) return;
  s.setBroadcastEnabled(true);
  sequenceIdx = 0;
  if (broadcastTimer) clearInterval(broadcastTimer);
  broadcastTick(); // Send immediately
  broadcastTimer = setInterval(broadcastTick, BROADCAST_INTERVAL_MS);
  registerInterval(broadcastTimer);
  log("[BROADCAST] Started");
}

export function broadcastStop(): void {
  useStore.getState().setBroadcastEnabled(false);
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  sequenceIdx = 0;
  log("[BROADCAST] Stopped");
}
