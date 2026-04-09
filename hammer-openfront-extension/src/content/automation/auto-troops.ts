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
  asIsAlly,
  readMyPlayer,
} from "@shared/logic/player-helpers";
import { resolveAutoSendTargets, type ResolvedTarget } from "@shared/logic/auto-send-helpers";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { dTroops, short } from "@shared/utils";
import { palantirTroopAmount, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { PALANTIR_RATIO } from "@store/slices/auto-troops";
import { asSendTroops } from "../game/send";
import { registerInterval } from "../cleanup";
import { record } from "../../recorder";

// ---------- Module-level state ----------

let asTroopsTimer: ReturnType<typeof setInterval> | null = null;

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- asResolveTargets ----------

/**
 * Resolve auto-troops targets based on mode (AllTeam / AllAllies / manual list).
 */
export function asResolveTargets(): ResolvedTarget[] {
  const s = useStore.getState();
  return resolveAutoSendTargets({
    allTeamMode: s.asTroopsAllTeamMode,
    allAlliesMode: s.asTroopsAllAlliesMode,
    manualTargets: s.asTroopsTargets,
    lastPlayers: s.lastPlayers,
    playersById: s.playersById,
    currentClientID: s.currentClientID,
    mySmallID: s.mySmallID,
    myAllies: s.myAllies,
  });
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
  const maxT = estimateMaxTroops(me.tilesOwned ?? 0, me.smallID ?? 0, cityLevelSumByOwner);
  const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0;

  // Palantir manages its own floor (42%); fixed ratio uses the threshold setting
  if (s.asTroopsRatio === PALANTIR_RATIO) {
    if (!maxT || troopPct < OPTIMAL_REGEN_PCT * 100) {
      record("auto-t", "skipped", { reason: "palantir-below-floor", troopPct: Math.round(troopPct) });
      return;
    }
  } else {
    if (!maxT || troopPct < s.asTroopsThreshold) {
      record("auto-t", "skipped", { reason: "threshold", troopPct: Math.round(troopPct) });
      return;
    }
  }

  for (const target of targets) {
    if (!useStore.getState().asTroopsRunning) return;
    if (!asIsAlly(target.id, s.playersById, s.myTeam, s.myAllies)) continue;

    const last = s.asTroopsLastSend[target.id] || 0;
    const cooldownMs = s.asTroopsCooldownSec * 1000;
    const nextSend = last + cooldownMs;

    if (now >= nextSend) {
      let toSend: number;

      if (s.asTroopsRatio === PALANTIR_RATIO) {
        // Palantir: send surplus above optimal regen floor (42%), split across targets
        toSend = palantirTroopAmount(troops, maxT, targets.length);
        if (toSend <= 0) {
          record("auto-t", "skipped", { target: target.name, reason: "palantir-below-floor", troopPct: Math.round((troops / maxT) * 100) });
          continue;
        }
      } else {
        // Fixed ratio: send X% of current troops
        toSend = Math.max(1, Math.floor(troops * (s.asTroopsRatio / 100)));
        // Don't send if remaining troops would drop below threshold
        const remainingPct = maxT > 0 ? ((troops - toSend) / maxT) * 100 : 0;
        if (remainingPct < s.asTroopsThreshold) {
          record("auto-t", "skipped", { target: target.name, reason: "below-threshold", remainingPct: Math.round(remainingPct) });
          log(`[AUTO-TROOPS] Skipping ${target.name}: would drop below threshold (${remainingPct.toFixed(0)}%)`);
          continue;
        }
      }

      if (asSendTroops(target.id, toSend)) {
        const displayAmount = dTroops(toSend); // convert internal→display for UI
        record("auto-t", "sent", { target: target.name, amount: displayAmount });
        troops -= toSend; // Track locally so next target sees reduced amount
        useStore.getState().updateAsTroopsSendTimes(target.id, now, now + cooldownMs);
        useStore.getState().addAsTroopsLog({
          ts: Date.now(),
          target: target.name,
          amount: displayAmount,
        });
        const { toastOutboundTroops } = useStore.getState();
        if (toastOutboundTroops) {
          useStore.getState().addDonationToast({
            id: Date.now() + Math.random(),
            playerName: target.name,
            type: "troops",
            amount: displayAmount,
            direction: "out",
            timestamp: Date.now(),
          });
        }
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
