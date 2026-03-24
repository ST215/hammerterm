/**
 * send.ts — Game action infrastructure: troops, gold, emoji, quickchat, alliance.
 *
 * All send commands are dispatched to the MAIN world via the bridge,
 * where EventBus or WebSocket are used to execute them.
 *
 * A global intent queue enforces the server's rate limits:
 *   - Max 8 intents/second (server allows 10, we leave headroom)
 *   - Max 120 intents/minute (server allows 150)
 */

import { useStore } from "@store/index";
import { sendToMainWorld } from "../bridge";
import { record } from "../../recorder";

// ---------- Global intent rate limiter ----------

const MAX_PER_SECOND = 8; // server limit is 10, leave 2 for manual player actions
const MAX_PER_MINUTE = 120; // server limit is 150
const DRAIN_INTERVAL_MS = 125; // drain queue every 125ms (8/sec)

interface QueuedIntent {
  payload: any;
  recordCategory: string;
  recordDetail: string;
  recordMeta: Record<string, unknown>;
  logMsg: string;
  resolve: (sent: boolean) => void;
}

const intentQueue: QueuedIntent[] = [];
const sentTimestamps: number[] = []; // tracks when each intent was actually sent
let drainTimer: ReturnType<typeof setInterval> | null = null;

function pruneTimestamps(now: number): void {
  // Remove entries older than 60s
  while (sentTimestamps.length > 0 && now - sentTimestamps[0] > 60_000) {
    sentTimestamps.shift();
  }
}

function countInWindow(now: number, windowMs: number): number {
  let count = 0;
  for (let i = sentTimestamps.length - 1; i >= 0; i--) {
    if (now - sentTimestamps[i] <= windowMs) count++;
    else break;
  }
  return count;
}

function drainQueue(): void {
  if (intentQueue.length === 0) return;

  const now = Date.now();
  pruneTimestamps(now);

  // Check per-minute limit
  if (countInWindow(now, 60_000) >= MAX_PER_MINUTE) return;

  // Check per-second limit
  if (countInWindow(now, 1_000) >= MAX_PER_SECOND) return;

  const item = intentQueue.shift()!;
  sendToMainWorld(item.payload);
  sentTimestamps.push(now);
  record(item.recordCategory, item.recordDetail, item.recordMeta);
  log(item.logMsg);
  item.resolve(true);
}

function ensureDrainTimer(): void {
  if (drainTimer) return;
  drainTimer = setInterval(drainQueue, DRAIN_INTERVAL_MS);
}

function enqueueIntent(
  payload: any,
  recordCategory: string,
  recordDetail: string,
  recordMeta: Record<string, unknown>,
  logMsg: string,
): boolean {
  ensureDrainTimer();

  // If queue is empty and we're under limits, send immediately
  const now = Date.now();
  pruneTimestamps(now);
  if (
    intentQueue.length === 0 &&
    countInWindow(now, 1_000) < MAX_PER_SECOND &&
    countInWindow(now, 60_000) < MAX_PER_MINUTE
  ) {
    sendToMainWorld(payload);
    sentTimestamps.push(now);
    record(recordCategory, recordDetail, recordMeta);
    log(logMsg);
    return true;
  }

  // Otherwise queue it
  return new Promise<boolean>((resolve) => {
    intentQueue.push({ payload, recordCategory, recordDetail, recordMeta, logMsg, resolve });
  }) as unknown as boolean; // callers treat as sync boolean; queued = true
}

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- asSendTroops ----------

export function asSendTroops(targetId: string, amount: number | null): boolean {
  return enqueueIntent(
    { action: "troops", targetId, amount },
    "cmd", "send.troops", { targetId, amount: amount ?? 0 },
    `[SEND] Troops command dispatched: ${targetId} ${amount}`,
  );
}

// ---------- asSendGold ----------

export function asSendGold(targetId: string, amount: number): boolean {
  return enqueueIntent(
    { action: "gold", targetId, amount },
    "cmd", "send.gold", { targetId, amount },
    `[SEND] Gold command dispatched: ${targetId} ${amount}`,
  );
}

// ---------- sendEmoji ----------

export function sendEmoji(recipientId: string, emojiIndex: number): boolean {
  return enqueueIntent(
    { action: "emoji", recipientId, emojiIndex },
    "cmd", "send.emoji", { recipientId, emojiIndex },
    `[SEND] Emoji command dispatched: ${recipientId} ${emojiIndex}`,
  );
}

// ---------- sendQuickChat ----------

export function sendQuickChat(
  recipientId: string,
  quickChatKey: string,
  targetPlayerId?: string,
): boolean {
  return enqueueIntent(
    { action: "quickchat", recipientId, key: quickChatKey, targetPlayerId },
    "cmd", "send.quickchat", { recipientId, key: quickChatKey, targetPlayerId },
    `[SEND] QuickChat command dispatched: ${recipientId} ${quickChatKey}`,
  );
}

// ---------- sendAllianceRequest ----------

export function sendAllianceRequest(recipientId: string): boolean {
  return enqueueIntent(
    { action: "alliance", recipientId },
    "cmd", "send.alliance", { recipientId },
    `[SEND] Alliance command dispatched: ${recipientId}`,
  );
}

// ---------- sendBetray ----------

/** Break alliance with a player (uses separate break-alliance event class) */
export function sendBetray(recipientId: string): boolean {
  return enqueueIntent(
    { action: "betray", recipientId },
    "cmd", "send.betray", { recipientId },
    `[SEND] Betray command dispatched: ${recipientId}`,
  );
}

// ---------- sendEmbargo ----------

/** Stop trading with a player (embargo start) */
export function sendEmbargoStart(targetId: string): boolean {
  return enqueueIntent(
    { action: "embargo", targetId, embargoAction: "start" },
    "cmd", "embargo.start", { targetId },
    `[SEND] Embargo start (stop trading): ${targetId}`,
  );
}

/** Resume trading with a player (embargo stop) */
export function sendEmbargoStop(targetId: string): boolean {
  return enqueueIntent(
    { action: "embargo", targetId, embargoAction: "stop" },
    "cmd", "embargo.stop", { targetId },
    `[SEND] Embargo stop (resume trading): ${targetId}`,
  );
}

// ---------- getPlayerView ----------

/**
 * PlayerView objects live in the MAIN world — not accessible from isolated world.
 * This function is kept for API compatibility but always returns null.
 * All actual PlayerView access happens in hooks.content.ts (MAIN world).
 */
export function getPlayerView(_playerId: string): unknown | null {
  return null;
}

// ---------- verifyClientID ----------

export function verifyClientID(): {
  hammerClientID: string | null;
  gameViewClientID: string | null;
  transportClientID: string | null;
  match: boolean;
} {
  return {
    hammerClientID: useStore.getState().currentClientID,
    gameViewClientID: null,
    transportClientID: null,
    match: false,
  };
}
