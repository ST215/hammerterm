/**
 * send.ts — Game action infrastructure: troops, gold, emoji, quickchat, alliance.
 *
 * All send commands are dispatched to the MAIN world via the bridge,
 * where EventBus or WebSocket are used to execute them.
 */

import { useStore } from "@store/index";
import { sendToMainWorld } from "../bridge";

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- asSendTroops ----------

export function asSendTroops(targetId: string, amount: number | null): boolean {
  sendToMainWorld({ action: "troops", targetId, amount });
  log("[SEND] Troops command dispatched:", targetId, amount);
  return true;
}

// ---------- asSendGold ----------

export function asSendGold(targetId: string, amount: number): boolean {
  sendToMainWorld({ action: "gold", targetId, amount });
  log("[SEND] Gold command dispatched:", targetId, amount);
  return true;
}

// ---------- sendEmoji ----------

export function sendEmoji(recipientId: string, emojiIndex: number): boolean {
  sendToMainWorld({ action: "emoji", recipientId, emojiIndex });
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
  log("[SEND] QuickChat command dispatched:", recipientId, quickChatKey);
  return true;
}

// ---------- sendAllianceRequest ----------

export function sendAllianceRequest(recipientId: string): boolean {
  sendToMainWorld({ action: "alliance", recipientId });
  log("[SEND] Alliance command dispatched:", recipientId);
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
