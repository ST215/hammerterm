/**
 * send.ts — Game action infrastructure: troops, gold, emoji, quickchat, alliance.
 *
 * All send commands are dispatched to the MAIN world via the bridge,
 * where EventBus or WebSocket are used to execute them.
 */

import { useStore } from "@store/index";
import { sendToMainWorld } from "../bridge";
import { record } from "../../recorder";

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- asSendTroops ----------

export function asSendTroops(targetId: string, amount: number | null): boolean {
  sendToMainWorld({ action: "troops", targetId, amount });
  record("cmd", "send.troops", { targetId, amount: amount ?? 0 });
  log("[SEND] Troops command dispatched:", targetId, amount);
  return true;
}

// ---------- asSendGold ----------

export function asSendGold(targetId: string, amount: number): boolean {
  sendToMainWorld({ action: "gold", targetId, amount });
  record("cmd", "send.gold", { targetId, amount });
  log("[SEND] Gold command dispatched:", targetId, amount);
  return true;
}

// ---------- sendEmoji ----------

export function sendEmoji(recipientId: string, emojiIndex: number): boolean {
  sendToMainWorld({ action: "emoji", recipientId, emojiIndex });
  record("cmd", "send.emoji", { recipientId, emojiIndex });
  log("[SEND] Emoji command dispatched:", recipientId, emojiIndex);
  return true;
}

// ---------- sendQuickChat ----------

export function sendQuickChat(
  recipientId: string,
  quickChatKey: string,
  targetPlayerId?: string,
): boolean {
  sendToMainWorld({
    action: "quickchat",
    recipientId,
    key: quickChatKey,
    targetPlayerId,
  });
  record("cmd", "send.quickchat", { recipientId, key: quickChatKey, targetPlayerId });
  log("[SEND] QuickChat command dispatched:", recipientId, quickChatKey);
  return true;
}

// ---------- sendAllianceRequest ----------

export function sendAllianceRequest(recipientId: string): boolean {
  sendToMainWorld({ action: "alliance", recipientId });
  record("cmd", "send.alliance", { recipientId });
  log("[SEND] Alliance command dispatched:", recipientId);
  return true;
}

// ---------- sendBetray ----------

/** Break alliance with a player (uses separate break-alliance event class) */
export function sendBetray(recipientId: string): boolean {
  sendToMainWorld({ action: "betray", recipientId });
  record("cmd", "send.betray", { recipientId });
  log("[SEND] Betray command dispatched:", recipientId);
  return true;
}

// ---------- sendEmbargo ----------

/** Stop trading with a player (embargo start) */
export function sendEmbargoStart(targetId: string): boolean {
  sendToMainWorld({ action: "embargo", targetId, embargoAction: "start" });
  record("cmd", "embargo.start", { targetId });
  log("[SEND] Embargo start (stop trading):", targetId);
  return true;
}

/** Resume trading with a player (embargo stop) */
export function sendEmbargoStop(targetId: string): boolean {
  sendToMainWorld({ action: "embargo", targetId, embargoAction: "stop" });
  record("cmd", "embargo.stop", { targetId });
  log("[SEND] Embargo stop (resume trading):", targetId);
  return true;
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
