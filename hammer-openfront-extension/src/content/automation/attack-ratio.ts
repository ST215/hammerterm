/**
 * attack-ratio.ts — Adaptive attack-ratio governor.
 *
 * Does NOT attack. It auto-tunes the game's attack-ratio slider (the fraction
 * of troops committed per manual attack) against the player's live troop count
 * and regeneration, so each attack the player fires by hand commits the optimal
 * amount. Setting the ratio is a pure client-side write — no server intent — so
 * this is unaffected by the intent rate limiter and carries no kick risk.
 *
 * Modes:
 *   - manual:    observe only — write nothing; the player drives the slider/T-Y.
 *   - assist:    hold a constant ratio % the player sets.
 *   - breakeven: hold the troop LEVEL at the player's target % (vary the ratio).
 *   - peak:      hold the troop LEVEL at 42% of max (the regen power-band).
 * A pre-emptive floor caps the ratio by remaining headroom above the floor, so
 * rapid clicks auto-tighten toward 1% as troops approach the floor — a counter
 * can't catch the player empty. Troops are read from a live (≤100ms) scalar so
 * the floor reacts to fast clicking despite the store's 1s stats throttle.
 */

import { useStore } from "@store/index";
import { readMyPlayer } from "@shared/logic/player-helpers";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner, getMyLiveTroops } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import type { AttackRatioMode, AttackRatioTelemetry } from "@store/slices/attack-ratio";
import { asSetAttackRatio, asReleaseAttackRatio } from "../game/send";
import { registerInterval } from "../cleanup";

// ---------- Tuning (module constants — not user-exposed) ----------

const TICK_MS = 150; // control loop — fast so floor protection reacts to rapid clicks
const TELEMETRY_MS = 500; // throttle HUD telemetry writes (control runs faster)
const SLOPE_WINDOW_MS = 4000; // trailing window for net troop-slope readout
const MIN_RATIO = 0.01; // game's slider minimum
const BASE_RATIO = 0.03; // ratio applied when troops sit exactly at the setpoint
const KP = 1.5; // proportional gain: ratio added per (troops-over-setpoint / maxT)
const WRITE_EPS = 0.005; // skip re-writing the slider for sub-half-percent changes

// ---------- Module-level state ----------

let timer: ReturnType<typeof setInterval> | null = null;
let history: Array<{ t: number; troops: number }> = [];
let lastApplied = -1;
let lastMode: AttackRatioMode | null = null;
let lastTelemetryMs = 0;

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

/** Push telemetry to the store at most every TELEMETRY_MS (control loop is faster). */
function pushTelemetry(now: number, tel: AttackRatioTelemetry | null): void {
  if (tel != null && now - lastTelemetryMs < TELEMETRY_MS) return;
  lastTelemetryMs = now;
  useStore.getState().setAttackRatioTelemetry(tel);
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

  // Troops from the live (≤100ms) scalar so floor protection sees rapid-click
  // drain immediately; the store value lags up to 1s (stats throttle). maxT uses
  // tilesOwned/cities (slow-moving), so the throttled store value is fine there.
  const troops = Number(getMyLiveTroops() || me.troops || 0);
  const maxT = estimateMaxTroops(me.tilesOwned ?? 0, me.smallID ?? 0, cityLevelSumByOwner);
  if (maxT <= 0) {
    s.setAttackRatioTelemetry(null);
    return;
  }

  const now = Date.now();
  history.push({ t: now, troops });
  const slope = netSlope(now);
  const regenPerSec = troopGrowthPerSec(troops, maxT);
  const troopPct = (troops / maxT) * 100;

  const mode = s.attackRatioMode;

  // Manual: observe only — write nothing. Hand the ratio back to the native
  // slider once on entry so the player's slider/T-Y is authoritative again.
  if (mode === "manual") {
    if (lastMode !== "manual") {
      asReleaseAttackRatio();
      lastApplied = -1;
    }
    lastMode = mode;
    pushTelemetry(now, { ratio: 0, regenPerSec, troops, maxT, troopPct, netSlope: slope });
    return;
  }
  lastMode = mode;

  // ---- Choose the ratio ----
  let ratio: number;
  if (mode === "assist") {
    // Hold a constant ratio (how much each attack commits).
    ratio = s.attackRatioBasePct / 100;
  } else {
    // Hold a troop LEVEL by varying the ratio. break-even targets the player's
    // chosen %, peak targets the 42% regen optimum. Above setpoint → attack
    // harder to drain; below → ease off and let regen climb back.
    const targetPct = mode === "peak" ? OPTIMAL_REGEN_PCT : s.attackRatioBreakevenPct / 100;
    const setpoint = targetPct * maxT;
    ratio = BASE_RATIO + KP * ((troops - setpoint) / maxT);
  }

  // Floor reserve — a PRE-EMPTIVE wall, not a tripwire. The most we can commit
  // without crossing the floor is (troops - floorTroops); express that as a ratio
  // ceiling. As troops approach the floor it → 0, so the ratio ramps to MIN (1%)
  // and even rapid clicks near the floor barely spend. At/below floor it pins to MIN.
  const floorPct = s.attackRatioFloorPct;
  if (floorPct > 0) {
    const floorTroops = (floorPct / 100) * maxT;
    const maxSafe = troops > 0 ? Math.max(0, (troops - floorTroops) / troops) : 0;
    ratio = Math.min(ratio, maxSafe);
  }

  // Send cap is the hard guarantee against over-sends.
  ratio = Math.max(MIN_RATIO, Math.min(s.attackRatioMaxCap / 100, ratio));

  if (Math.abs(ratio - lastApplied) >= WRITE_EPS) {
    asSetAttackRatio(ratio);
    lastApplied = ratio;
  }

  pushTelemetry(now, { ratio, regenPerSec, troops, maxT, troopPct, netSlope: slope });
}

// ---------- Start / Stop ----------

export function asAttackRatioStart(): void {
  const s = useStore.getState();
  if (s.attackRatioRunning) return;
  history = [];
  lastApplied = -1;
  lastMode = null;
  lastTelemetryMs = 0;
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
  // Hand the ratio back to the native slider so the next manual attack uses the
  // visible slider's value, not the governor's last write.
  asReleaseAttackRatio();
  log("[ATTACK-RATIO] Governor stopped");
}
