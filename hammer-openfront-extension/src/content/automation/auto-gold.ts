/**
 * auto-gold.ts — Automatic gold donation engine.
 *
 * Ported from asResolveGoldTargets, asGoldTick, asGoldStart, asGoldStop
 * in hammer.js.
 *
 * Runs an 800ms tick loop that sends gold to configured targets
 * based on the configured ratio of current gold.
 */

import { useStore } from "@store/index";
import {
  asIsAlly,
  readMyPlayer,
} from "@shared/logic/player-helpers";
import { resolveAutoSendTargets, type ResolvedTarget } from "@shared/logic/auto-send-helpers";
import { short } from "@shared/utils";
import { asSendGold } from "../game/send";
import { registerInterval } from "../cleanup";
import { record } from "../../recorder";

// ---------- Module-level state ----------

let asGoldTimer: ReturnType<typeof setInterval> | null = null;

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- asResolveGoldTargets ----------

/**
 * Resolve auto-gold targets based on mode (AllTeam / AllAllies / manual list).
 */
export function asResolveGoldTargets(): ResolvedTarget[] {
  const s = useStore.getState();
  return resolveAutoSendTargets({
    allTeamMode: s.asGoldAllTeamMode,
    allAlliesMode: s.asGoldAllAlliesMode,
    manualTargets: s.asGoldTargets,
    lastPlayers: s.lastPlayers,
    playersById: s.playersById,
    currentClientID: s.currentClientID,
    mySmallID: s.mySmallID,
    myAllies: s.myAllies,
  });
}

// ---------- asGoldTick ----------

function asGoldTick(): void {
  const s = useStore.getState();

  if (!s.asGoldRunning) {
    if (asGoldTimer) {
      clearInterval(asGoldTimer);
      asGoldTimer = null;
    }
    return;
  }

  const now = Date.now();
  const targets = asResolveGoldTargets();
  if (!targets.length) return;

  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  if (!me) return;

  let gold = Number(me.gold || 0n);
  if (gold <= 0) {
    record("auto-g", "skipped", { reason: "no-gold" });
    return;
  }

  for (const target of targets) {
    if (!useStore.getState().asGoldRunning) return;
    if (!asIsAlly(target.id, s.playersById, s.myTeam, s.myAllies)) continue;

    const last = s.asGoldLastSend[target.id] || 0;
    const cooldownMs = s.asGoldCooldownSec * 1000;
    const nextSend = last + cooldownMs;

    // Update next-send time in store for UI display
    useStore.getState().updateAsGoldSendTimes(target.id, last, nextSend);

    if (now >= nextSend) {
      // Recompute each iteration (gold decreases after each send)
      const toSend = Math.max(1, Math.floor(gold * (s.asGoldRatio / 100)));
      if (toSend <= 0 || gold < toSend) {
        record("auto-g", "skipped", { target: target.name, reason: "insufficient", gold });
        log(`[AUTO-GOLD] Skipping ${target.name}: insufficient gold (${gold})`);
        continue;
      }

      if (asSendGold(target.id, toSend)) {
        record("auto-g", "sent", { target: target.name, amount: toSend });
        gold -= toSend; // Track locally so next target sees reduced amount
        useStore.getState().updateAsGoldSendTimes(target.id, now, now + cooldownMs);
        useStore.getState().addAsGoldLog({
          ts: Date.now(),
          target: target.name,
          amount: toSend,
        });
      } else {
        record("auto-g", "error", { target: target.name, reason: "send-failed" });
        log(`[AUTO-GOLD] Send failed to ${target.name}`);
      }
    }
  }
}

// ---------- Start / Stop ----------

export function asGoldStart(): void {
  const s = useStore.getState();
  if (s.asGoldRunning) return; // Already running
  s.setAsGoldRunning(true);
  if (asGoldTimer) clearInterval(asGoldTimer);
  asGoldTimer = setInterval(asGoldTick, 800);
  registerInterval(asGoldTimer);
  log("[AUTO-GOLD] Started");
}

export function asGoldStop(): void {
  useStore.getState().setAsGoldRunning(false);
  if (asGoldTimer) {
    clearInterval(asGoldTimer);
    asGoldTimer = null;
  }
  log("[AUTO-GOLD] Stopped");
}
