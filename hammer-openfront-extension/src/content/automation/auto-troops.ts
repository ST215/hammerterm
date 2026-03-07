/**
 * auto-troops.ts — Automatic troop donation engine.
 *
 * Ported from asResolveTargets, asTroopsTick, asTroopsStart, asTroopsStop
 * in hammer.js.
 *
 * Runs an 800ms tick loop that sends troops to configured targets when the
 * player's troop count exceeds the configured threshold percentage of max troops.
 */

import { useStore } from "@store/index";
import {
  getTeammates,
  getAllies,
  asIsAlly,
  readMyPlayer,
} from "@shared/logic/player-helpers";
import { estimateMaxTroops } from "@shared/logic/city";
import { dTroops, short } from "@shared/utils";
import { asSendTroops } from "../game/send";
import { registerInterval } from "../cleanup";
import { record } from "../../recorder";

// ---------- Module-level state ----------

let asTroopsTimer: ReturnType<typeof setInterval> | null = null;

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

function fmtTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

// ---------- asResolveTargets ----------

interface ResolvedTarget {
  id: string;
  name: string;
}

/**
 * Resolve auto-troops targets based on mode (AllTeam / AllAllies / manual list).
 */
export function asResolveTargets(): ResolvedTarget[] {
  const s = useStore.getState();

  if (s.asTroopsAllTeamMode || s.asTroopsAllAlliesMode) {
    const result: ResolvedTarget[] = [];
    const ids = new Set<string>();

    // Resolve "me" for helper functions
    const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);

    if (s.asTroopsAllTeamMode) {
      for (const p of getTeammates(s.playersById, me)) {
        result.push({ id: p.id, name: p.displayName || p.name || "" });
        ids.add(p.id);
      }
    }
    if (s.asTroopsAllAlliesMode) {
      for (const p of getAllies(s.playersById, me, s.myAllies)) {
        if (!ids.has(p.id)) {
          result.push({ id: p.id, name: p.displayName || p.name || "" });
        }
      }
    }
    return result;
  }

  // Manual target list: resolve names from store targets
  const resolved: ResolvedTarget[] = [];
  for (const tgt of s.asTroopsTargets) {
    // Targets are already stored as {id, name} in the extension store
    resolved.push({ id: tgt.id, name: tgt.name });
  }
  return resolved;
}

// ---------- asTroopsTick ----------

function asTroopsTick(): void {
  const s = useStore.getState();

  if (!s.asTroopsRunning) {
    if (asTroopsTimer) {
      clearInterval(asTroopsTimer);
      asTroopsTimer = null;
    }
    return;
  }

  const now = Date.now();
  const targets = asResolveTargets();
  if (!targets.length) return;

  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  if (!me) return;

  let troops = Number(me.troops || 0);
  // TODO: cityLevelSumByOwner is tracked by the worker hook (not yet wired).
  // For now pass an empty map; max troop estimates will be base-only.
  const cityLevelSumByOwner = new Map<number, number>();
  const maxT = estimateMaxTroops(me.tilesOwned ?? 0, me.smallID ?? 0, cityLevelSumByOwner);
  const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0;

  if (!maxT || troopPct < s.asTroopsThreshold) {
    record("auto-t", "skipped", { reason: "threshold", troopPct: Math.round(troopPct) });
    return;
  }

  for (const target of targets) {
    if (!useStore.getState().asTroopsRunning) return;
    if (!asIsAlly(target.id, s.playersById, s.myTeam, s.myAllies)) continue;

    const last = s.asTroopsLastSend[target.id] || 0;
    const cooldownMs = s.asTroopsCooldownSec * 1000;
    const nextSend = last + cooldownMs;

    // Update next-send time in store for UI display
    useStore.getState().updateAsTroopsSendTimes(target.id, last, nextSend);

    if (now >= nextSend) {
      // Recompute amount each iteration (troops decrease after each send)
      const toSend = Math.max(1, Math.floor(troops * (s.asTroopsRatio / 100)));
      // Don't send if remaining troops would drop below threshold
      const remainingPct = maxT > 0 ? ((troops - toSend) / maxT) * 100 : 0;
      if (remainingPct < s.asTroopsThreshold) {
        record("auto-t", "skipped", { target: target.name, reason: "below-threshold", remainingPct: Math.round(remainingPct) });
        log(`[AUTO-TROOPS] Skipping ${target.name}: would drop below threshold (${remainingPct.toFixed(0)}%)`);
        continue;
      }

      if (asSendTroops(target.id, toSend)) {
        record("auto-t", "sent", { target: target.name, amount: toSend });
        troops -= toSend; // Track locally so next target sees reduced amount
        useStore.getState().updateAsTroopsSendTimes(target.id, now, now + cooldownMs);
        useStore.getState().addAsTroopsLog({
          ts: Date.now(),
          target: target.name,
          amount: toSend,
        });
      } else {
        record("auto-t", "error", { target: target.name, reason: "send-failed" });
        log(`[AUTO-TROOPS] Send failed to ${target.name}`);
      }
    }
  }
}

// ---------- Start / Stop ----------

export function asTroopsStart(): void {
  const s = useStore.getState();
  if (s.asTroopsRunning) return; // Already running
  s.setAsTroopsRunning(true);
  if (asTroopsTimer) clearInterval(asTroopsTimer);
  asTroopsTimer = setInterval(asTroopsTick, 800);
  registerInterval(asTroopsTimer);
  log("[AUTO-TROOPS] Started");
}

export function asTroopsStop(): void {
  useStore.getState().setAsTroopsRunning(false);
  if (asTroopsTimer) {
    clearInterval(asTroopsTimer);
    asTroopsTimer = null;
  }
  log("[AUTO-TROOPS] Stopped");
}
