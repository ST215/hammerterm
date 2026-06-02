/**
 * attack-ratio.ts — Adaptive attack-ratio governor.
 *
 * Does NOT attack. It auto-tunes the game's attack-ratio slider (the fraction
 * of troops committed per manual attack) against the player's live troop count
 * and regeneration, so each attack the player fires by hand commits the optimal
 * amount. Setting the ratio is a pure client-side write — no server intent — so
 * this is unaffected by the intent rate limiter and carries no kick risk.
 *
 * One proportional controller drives the ratio; the mode only changes the
 * troop-level setpoint it aims for:
 *   - fixed:     open loop — hold a constant %.
 *   - breakeven: setpoint = the troop level when cruise was engaged (hold flat).
 *   - peak:      setpoint = 42% of max (the regen power-band) for max throughput.
 * A floor-reserve clamp overrides any mode: below the floor, the ratio is pinned
 * low so a counter-attack can't catch the player empty.
 */

import { useStore } from "@store/index";
import { readMyPlayer } from "@shared/logic/player-helpers";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import type { AttackRatioMode } from "@store/slices/attack-ratio";
import { asSetAttackRatio } from "../game/send";
import { registerInterval } from "../cleanup";

// ---------- Tuning (module constants — not user-exposed) ----------

const TICK_MS = 500;
const SLOPE_WINDOW_MS = 4000; // trailing window for net troop-slope readout
const MIN_RATIO = 0.01; // game's slider minimum
const BASE_RATIO = 0.03; // ratio applied when troops sit exactly at the setpoint
const KP = 1.5; // proportional gain: ratio added per (troops-over-setpoint / maxT)
const WRITE_EPS = 0.005; // skip re-writing the slider for sub-half-percent changes

// ---------- Module-level state ----------

let timer: ReturnType<typeof setInterval> | null = null;
let history: Array<{ t: number; troops: number }> = [];
let lastApplied = -1;
let refTroops = 0; // frozen setpoint for breakeven mode
let lastMode: AttackRatioMode | null = null;

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

/** Net troop change (internal units/sec) over the trailing window. */
function netSlope(now: number): number {
  while (history.length > 1 && now - history[0].t > SLOPE_WINDOW_MS) {
    history.shift();
  }
  if (history.length < 2) return 0;
  const first = history[0];
  const last = history[history.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return 0;
  return (last.troops - first.troops) / dt;
}

function tick(): void {
  const s = useStore.getState();

  if (s.isReplay) return;

  if (!s.attackRatioRunning) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return;
  }

  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  if (!me) {
    s.setAttackRatioTelemetry(null);
    return;
  }

  const troops = Number(me.troops || 0);
  const maxT = estimateMaxTroops(me.tilesOwned ?? 0, me.smallID ?? 0, cityLevelSumByOwner);
  if (maxT <= 0) {
    s.setAttackRatioTelemetry(null);
    return;
  }

  const now = Date.now();
  history.push({ t: now, troops });
  const slope = netSlope(now);
  const regenPerSec = troopGrowthPerSec(troops, maxT);

  // Freeze the breakeven setpoint at the troop level present when cruise engaged;
  // otherwise keep it tracking the live count so a later switch starts from "now".
  const mode = s.attackRatioMode;
  if (mode === "breakeven") {
    if (lastMode !== "breakeven") refTroops = troops;
  } else {
    refTroops = troops;
  }
  lastMode = mode;

  // ---- Choose the ratio ----
  let ratio: number;
  if (mode === "fixed") {
    ratio = s.attackRatioFixedPct / 100;
  } else {
    const setpoint = mode === "peak" ? OPTIMAL_REGEN_PCT * maxT : refTroops;
    // Above setpoint → attack harder to drain; below → ease off and let regen climb.
    ratio = BASE_RATIO + KP * ((troops - setpoint) / maxT);
  }

  // Floor reserve overrides everything: pin low when below the defensive floor.
  const floorPct = s.attackRatioFloorPct;
  if (floorPct > 0 && troops < (floorPct / 100) * maxT) {
    ratio = MIN_RATIO;
  }

  ratio = Math.max(MIN_RATIO, Math.min(s.attackRatioMaxCap / 100, ratio));

  if (Math.abs(ratio - lastApplied) >= WRITE_EPS) {
    asSetAttackRatio(ratio);
    lastApplied = ratio;
  }

  s.setAttackRatioTelemetry({
    ratio,
    regenPerSec,
    troops,
    maxT,
    troopPct: (troops / maxT) * 100,
    netSlope: slope,
  });
}

// ---------- Start / Stop ----------

export function asAttackRatioStart(): void {
  const s = useStore.getState();
  if (s.attackRatioRunning) return;
  history = [];
  lastApplied = -1;
  lastMode = null;
  s.setAttackRatioRunning(true);
  if (timer) clearInterval(timer);
  timer = setInterval(tick, TICK_MS);
  registerInterval(timer);
  log("[ATTACK-RATIO] Governor started");
}

export function asAttackRatioStop(): void {
  useStore.getState().setAttackRatioRunning(false);
  useStore.getState().setAttackRatioTelemetry(null);
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  log("[ATTACK-RATIO] Governor stopped");
}
