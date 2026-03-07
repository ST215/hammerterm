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
import { record } from "../../recorder";
import { calcPalantirAmount } from "@shared/logic/palantir";
import type { ReciprocatePendingItem, PalantirDecision } from "@store/slices/reciprocate";

// ---------- Module-level state ----------

/** Per-player cooldown tracker: playerId -> last-sent timestamp */
const reciprocateCooldowns = new Map<string, number>();

/** The actual mutable queue — avoids Zustand immutable array thrashing */
const pendingQueue: PendingItem[] = [];

interface PendingItem extends ReciprocatePendingItem {
  attempts: number;
  cooldownUntil?: number;
  donorTroops?: number;
  sendCount?: number;
}

/** Maximum age for a pending item before it is dropped (5 minutes) */
const MAX_PENDING_AGE_MS = 300_000;

/** Maximum retry attempts per pending item */
const MAX_ATTEMPTS = 5;

let processorTimer: ReturnType<typeof setInterval> | null = null;

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

/** Sync the mutable queue to the Zustand store for UI display */
function syncQueueToStore(): void {
  useStore.setState({
    reciprocatePending: pendingQueue.map((item) => ({
      donorId: item.donorId,
      donorName: item.donorName,
      amountReceived: item.amountReceived,
      receivedType: item.receivedType,
      addedAt: item.addedAt,
    })),
  });
}

// ---------- handleAutoReciprocate ----------

/**
 * Called when a donation is received and auto/palantir reciprocate is enabled.
 * Checks cooldown then adds to the pending queue for deferred processing.
 */
export function handleAutoReciprocate(
  donorId: string,
  donorName: string,
  amountReceived: number,
  receivedType: string,
  donorTroops?: number,
  sendCount?: number,
): void {
  log("[RECIPROCATE] Auto-reciprocate for", donorName, "|", receivedType, ":", amountReceived);

  // Check cooldown first
  const lastSent = reciprocateCooldowns.get(donorId);
  if (lastSent && Date.now() - lastSent < RECIPROCATE_COOLDOWN_MS) {
    record("recip", "skipped", { donor: donorName, reason: "cooldown" });
    log(`[RECIPROCATE] Cooldown active for ${donorName}, skipping`);
    return;
  }

  record("recip", "queued", { donor: donorName, type: receivedType, amt: amountReceived });

  // Add to pending queue
  pendingQueue.push({
    donorId,
    donorName,
    amountReceived,
    receivedType: receivedType || "troops",
    addedAt: Date.now(),
    attempts: 0,
    donorTroops,
    sendCount,
  });

  syncQueueToStore();

  log(
    `[RECIPROCATE] Queued auto-send for ${donorName} (${amountReceived} ${receivedType}, queue size: ${pendingQueue.length})`,
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
 * Matches the old hammer.js approach: splice items out, process, re-queue failures.
 */
function processReciprocateQueue(): void {
  const s = useStore.getState();
  const mode = s.reciprocateMode;

  if (!s.reciprocateEnabled || (mode !== "auto" && mode !== "palantir")) {
    if (pendingQueue.length > 0) {
      record("recip", "cleared", { reason: "disabled", count: pendingQueue.length });
      pendingQueue.length = 0;
      syncQueueToStore();
    }
    return;
  }

  if (pendingQueue.length === 0) return;

  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  if (!me) {
    log("[RECIPROCATE] Player data not ready, deferring queue processing");
    return;
  }

  const myGold = Number(me.gold || 0n);
  const myTroops = Number(me.troops || 0);
  const now = Date.now();

  // Take up to 3 items OUT of the queue (splice, not slice)
  const batch = pendingQueue.splice(0, 3);

  for (const item of batch) {
    // Skip items still waiting for cooldown (silently re-queue)
    if (item.cooldownUntil && now < item.cooldownUntil) {
      pendingQueue.push(item);
      continue;
    }

    // Check if too old (5 minutes)
    if (now - item.addedAt > MAX_PENDING_AGE_MS) {
      record("recip", "dropped", { donor: item.donorName, reason: "stale", ageMs: now - item.addedAt });
      log(
        `[RECIPROCATE] Dropping stale request for ${item.donorName} (age: ${Math.floor((now - item.addedAt) / 1000)}s)`,
      );
      continue; // Drop it — don't re-queue
    }

    // Check cooldown
    const lastSent = reciprocateCooldowns.get(item.donorId);
    if (lastSent && now - lastSent < RECIPROCATE_COOLDOWN_MS) {
      record("recip", "deferred", { donor: item.donorName, reason: "cooldown", resumeIn: RECIPROCATE_COOLDOWN_MS - (now - lastSent) });
      item.cooldownUntil = lastSent + RECIPROCATE_COOLDOWN_MS;
      pendingQueue.push(item);
      continue;
    }

    // Cross-resource: received gold -> send troops, received troops -> send gold
    const sendTroops = item.receivedType === "gold";
    const resourceLabel = sendTroops ? "troops" : "gold";

    let amountToSend: number;
    let percentage: number;
    let palantirDecision: PalantirDecision | undefined;

    if (mode === "palantir") {
      // Determine if donor is a teammate
      const donorPlayer = s.playersById.get(item.donorId);
      const isTeammate = donorPlayer != null && s.myTeam != null && donorPlayer.team === s.myTeam;

      // Use the resource we're sending FROM for the Palantir calc
      const myResource = sendTroops ? myTroops : myGold;

      const result = calcPalantirAmount({
        amountSent: item.amountReceived,
        donorTroops: item.donorTroops ?? 0,
        sendCount: item.sendCount ?? 1,
        myGold: myResource,
        myTroops,
        isTeammate,
      });

      amountToSend = result.final;
      percentage = Math.round(result.sacrificeRatio * 100);
      palantirDecision = {
        sacrificeRatio: result.sacrificeRatio,
        loyaltyMultiplier: result.loyaltyMultiplier,
        teammateMultiplier: result.teammateMultiplier,
        selfMod: result.selfMod,
        phase: result.phase,
        rawAmount: result.rawAmount,
        flooredAmount: result.flooredAmount,
        cappedAmount: result.cappedAmount,
        donorTroops: item.donorTroops ?? 0,
        sendCount: item.sendCount ?? 1,
      };
    } else {
      // Classic auto mode: flat percentage
      percentage = s.reciprocateAutoPct;
      amountToSend = sendTroops
        ? Math.floor((myTroops * percentage) / 100)
        : Math.floor((myGold * percentage) / 100);
    }

    if (amountToSend === 0) {
      item.attempts++;
      if (item.attempts < MAX_ATTEMPTS) {
        record("recip", "retry", { donor: item.donorName, reason: "no-resource", attempt: item.attempts });
        log(
          `[RECIPROCATE] Not enough ${resourceLabel}, re-queueing (attempt ${item.attempts}/${MAX_ATTEMPTS})`,
        );
        pendingQueue.push(item); // Re-queue for later
      } else {
        record("recip", "dropped", { donor: item.donorName, reason: "max-attempts" });
        log(`[RECIPROCATE] Max attempts reached for ${item.donorName}, dropping`);
      }
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
        mode: mode,
        palantir: palantirDecision,
      };
      if (sendTroops) {
        historyEntry.troopsSent = amountToSend;
      } else {
        historyEntry.goldSent = amountToSend;
      }
      s.addReciprocateHistory(historyEntry);

      // Set cooldown
      reciprocateCooldowns.set(item.donorId, now);

      const palantirLog = palantirDecision
        ? { palantir: true, sacrifice: palantirDecision.sacrificeRatio, loyalty: palantirDecision.loyaltyMultiplier, phase: palantirDecision.phase, raw: palantirDecision.rawAmount, final: amountToSend }
        : {};
      record("recip", "sent", { donor: item.donorName, type: resourceLabel, amt: amountToSend, ...palantirLog });
      log(
        `[RECIPROCATE] Successfully sent ${amountToSend} ${resourceLabel} to ${item.donorName} (queue size: ${pendingQueue.length})`,
      );
    } else {
      // Failed to send — re-queue with attempt tracking
      item.attempts++;
      if (item.attempts < MAX_ATTEMPTS) {
        record("recip", "error", { donor: item.donorName, reason: "send-failed", attempt: item.attempts });
        log(
          `[RECIPROCATE] Send failed, re-queueing (attempt ${item.attempts}/${MAX_ATTEMPTS})`,
        );
        pendingQueue.push(item);
      } else {
        record("recip", "dropped", { donor: item.donorName, reason: "max-attempts" });
        log(`[RECIPROCATE] Max attempts reached for ${item.donorName}, dropping`);
      }
    }
  }

  syncQueueToStore();
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
