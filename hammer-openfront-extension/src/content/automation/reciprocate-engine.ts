/**
 * reciprocate-engine.ts — Reciprocation queue processor.
 *
 * Ported from handleAutoReciprocate, handleQuickReciprocate,
 * processReciprocateQueue in hammer.js.
 *
 * Cross-resource reciprocation: received gold -> send troops back,
 * received troops -> send gold back.
 *
 * The queue processor runs on a 1000ms interval and processes up to
 * 3 pending items per tick, respecting per-player cooldowns.
 */

import { useStore } from "@store/index";
import { asSendTroops, asSendGold } from "../game/send";
import { readMyPlayer } from "@shared/logic/player-helpers";
import { RECIPROCATE_COOLDOWN_MS } from "@shared/constants";
import { short } from "@shared/utils";
import { registerInterval } from "../cleanup";

// ---------- Module-level state ----------

/** Per-player cooldown tracker: playerId -> last-sent timestamp */
const reciprocateCooldowns = new Map<string, number>();

/** Maximum age for a pending item before it is dropped (5 minutes) */
const MAX_PENDING_AGE_MS = 300_000;

/** Maximum retry attempts per pending item */
const MAX_ATTEMPTS = 5;

let processorTimer: ReturnType<typeof setInterval> | null = null;

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- handleAutoReciprocate ----------

/**
 * Called when a donation is received and auto-reciprocate is enabled.
 * Checks cooldown then adds to the pending queue for deferred processing.
 */
export function handleAutoReciprocate(
  donorId: string,
  donorName: string,
  amountReceived: number,
  receivedType: string,
): void {
  log("[RECIPROCATE] Auto-reciprocate for", donorName, "|", receivedType, ":", amountReceived);

  // Check cooldown first
  const lastSent = reciprocateCooldowns.get(donorId);
  if (lastSent && Date.now() - lastSent < RECIPROCATE_COOLDOWN_MS) {
    log(`[RECIPROCATE] Cooldown active for ${donorName}, skipping`);
    return;
  }

  // Add to pending queue
  useStore.getState().addReciprocatePending({
    donorId,
    donorName,
    amountReceived,
    receivedType: receivedType || "troops",
    addedAt: Date.now(),
  });

  log(
    `[RECIPROCATE] Queued auto-send for ${donorName} (${amountReceived} ${receivedType}, queue size: ${useStore.getState().reciprocatePending.length})`,
  );
}

// ---------- handleQuickReciprocate ----------

/**
 * Manual reciprocate triggered from a notification popup button.
 */
export function handleQuickReciprocate(
  donorId: string,
  donorName: string,
  percentage: number,
  notificationId: number | null,
  sendType: string,
): void {
  const s = useStore.getState();
  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  if (!me) {
    log("[RECIPROCATE] Player data not available");
    return;
  }

  const sendTroops = sendType === "troops";
  const myResource = sendTroops ? Number(me.troops || 0) : Number(me.gold || 0n);
  const amountToSend = Math.floor((myResource * percentage) / 100);
  const resourceLabel = sendTroops ? "troops" : "gold";

  if (amountToSend === 0) {
    log(`[RECIPROCATE] Not enough ${resourceLabel} to send`);
    if (notificationId != null) s.dismissReciprocateNotification(notificationId);
    return;
  }

  const success = sendTroops
    ? asSendTroops(donorId, amountToSend)
    : asSendGold(donorId, amountToSend);

  if (success) {
    const historyEntry: Parameters<typeof s.addReciprocateHistory>[0] = {
      donorId,
      donorName,
      percentage,
      timestamp: Date.now(),
      mode: "manual",
    };
    if (sendTroops) {
      historyEntry.troopsSent = amountToSend;
    } else {
      historyEntry.goldSent = amountToSend;
    }
    s.addReciprocateHistory(historyEntry);

    log(
      `[RECIPROCATE] Sent ${short(amountToSend)} ${resourceLabel} (${percentage}%) to ${donorName}`,
    );
    if (notificationId != null) s.dismissReciprocateNotification(notificationId);
  } else {
    log(`[RECIPROCATE] Failed to send ${resourceLabel} to ${donorName}`);
  }
}

// ---------- processReciprocateQueue ----------

/**
 * Processes the pending reciprocation queue. Called every 1000ms.
 * Handles up to 3 items per tick.
 */
function processReciprocateQueue(): void {
  const s = useStore.getState();

  if (!s.reciprocateEnabled || s.reciprocateMode !== "auto") {
    // Clear queue if disabled
    if (s.reciprocatePending.length > 0) {
      // Remove all pending items one by one (reverse order to keep indices stable)
      for (let i = s.reciprocatePending.length - 1; i >= 0; i--) {
        s.removeReciprocatePending(i);
      }
    }
    return;
  }

  if (s.reciprocatePending.length === 0) return;

  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  if (!me) {
    log("[RECIPROCATE] Player data not ready, deferring queue processing");
    return;
  }

  const myGold = Number(me.gold || 0n);
  const myTroops = Number(me.troops || 0);
  const now = Date.now();

  // Process up to 3 pending reciprocations per interval
  // We work with a snapshot and track which indices to remove
  const pending = [...s.reciprocatePending];
  const toProcess = pending.slice(0, 3);
  const toRemove: number[] = [];
  const toRequeue: typeof s.reciprocatePending = [];

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];

    // Check if too old (5 minutes)
    if (now - item.addedAt > MAX_PENDING_AGE_MS) {
      log(
        `[RECIPROCATE] Dropping stale request for ${item.donorName} (age: ${Math.floor((now - item.addedAt) / 1000)}s)`,
      );
      toRemove.push(i);
      continue;
    }

    // Check cooldown
    const lastSent = reciprocateCooldowns.get(item.donorId);
    if (lastSent && now - lastSent < RECIPROCATE_COOLDOWN_MS) {
      log(`[RECIPROCATE] Cooldown active for ${item.donorName}, re-queueing`);
      // Don't remove -- keep in queue
      continue;
    }

    // Cross-resource: received gold -> send troops, received troops -> send gold
    const sendTroops = item.receivedType === "gold";
    const percentage = s.reciprocateAutoPct;
    const amountToSend = sendTroops
      ? Math.floor((myTroops * percentage) / 100)
      : Math.floor((myGold * percentage) / 100);
    const resourceLabel = sendTroops ? "troops" : "gold";

    if (amountToSend === 0) {
      // Not enough resources -- keep in queue for retry (up to MAX_ATTEMPTS)
      // Since the store doesn't track attempts, we drop after MAX_PENDING_AGE_MS
      log(`[RECIPROCATE] Not enough ${resourceLabel}, keeping in queue`);
      continue;
    }

    // Send the opposite resource back
    const success = sendTroops
      ? asSendTroops(item.donorId, amountToSend)
      : asSendGold(item.donorId, amountToSend);

    if (success) {
      // Record in history
      const historyEntry: Parameters<typeof s.addReciprocateHistory>[0] = {
        donorId: item.donorId,
        donorName: item.donorName,
        percentage,
        timestamp: Date.now(),
        mode: "auto",
      };
      if (sendTroops) {
        historyEntry.troopsSent = amountToSend;
      } else {
        historyEntry.goldSent = amountToSend;
      }
      s.addReciprocateHistory(historyEntry);

      // Set cooldown
      reciprocateCooldowns.set(item.donorId, now);

      log(
        `[RECIPROCATE] Successfully sent ${amountToSend} ${resourceLabel} to ${item.donorName} (queue size: ${pending.length})`,
      );

      toRemove.push(i);
    } else {
      // Failed to send -- keep in queue for retry
      log(`[RECIPROCATE] Send failed, keeping in queue for retry`);
    }
  }

  // Remove processed items (in reverse order to keep indices stable)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    useStore.getState().removeReciprocatePending(toRemove[i]);
  }
}

// ---------- Start / Stop ----------

export function startReciprocateProcessor(): void {
  if (processorTimer) return;
  processorTimer = setInterval(processReciprocateQueue, 1000);
  registerInterval(processorTimer);
  log("[RECIPROCATE] Queue processor started");
}

export function stopReciprocateProcessor(): void {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
  }
  log("[RECIPROCATE] Queue processor stopped");
}
