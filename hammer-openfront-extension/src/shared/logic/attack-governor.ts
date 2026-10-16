/**
 * attack-governor.ts — pure decision logic for the attack-ratio governor.
 *
 * The governor runs in the MAIN world (hooks.content.ts) where it can read the
 * game's own numbers synchronously: live troops, and the EXACT troop cap from
 * `game.config().maxTroops(me)` (cities included). It decides how many troops
 * each manual attack may commit and enforces that at the instant of the click.
 *
 * Kept pure and import-free so the MAIN world can bundle it and tests can drive
 * it directly.
 *
 * Why an in-flight ledger: the client only sees an attack's troop deduction
 * after the server round-trips the intent (~100–500ms). The engine caps each
 * attack at what's left when it executes (AttackExecution: min(troops(),
 * requested)), so N fast clicks computed against the same pre-deduction count
 * drain the whole army. Subtracting troops already sent-but-not-yet-deducted
 * ("pending") from the observed count gives the true spendable amount.
 */

/** Store mode ids (kept for persistence/sync compatibility). */
export type GovernorMode = "manual" | "assist" | "breakeven" | "peak";

export interface GovernorConfig {
  running: boolean;
  mode: GovernorMode;
  /** assist ("Fixed %"): % of troops each attack sends */
  fixedPct: number;
  /** breakeven ("Hold %"): troop level to hold, % of max */
  holdPct: number;
  /** assist only: never let an attack take you below this % of max (0 = off) */
  floorPct: number;
  /** peak/hold: no single attack sends more than this % of current troops */
  capPct: number;
}

/** Troop level (fraction of max) where regen peaks: d/dT[T^0.73·(1−T/M)] = 0 → 0.73/1.73. */
export const PEAK_PCT = 0.42;

/**
 * Peak/hold won't fire attacks smaller than this fraction of max troops —
 * they'd stall uselessly; holding lets the surplus accumulate for a real push.
 */
export const MIN_USEFUL_SEND = 0.01;

/** Target troop level as a fraction of max (0 for modes without a target). */
export function targetFraction(cfg: GovernorConfig): number {
  if (cfg.mode === "peak") return PEAK_PCT;
  if (cfg.mode === "breakeven") return clamp01(cfg.holdPct / 100);
  return 0;
}

/**
 * Troop level (internal units) the governor waits for before engaging each
 * match. Until troops first reach it, the native slider is left alone — early
 * expansion needs every troop and sits far below the 42% band.
 */
export function armLevel(cfg: GovernorConfig, maxTroops: number): number {
  if (cfg.mode === "assist") return clamp01(cfg.floorPct / 100) * maxTroops;
  return targetFraction(cfg) * maxTroops;
}

/**
 * How many troops (internal units) an attack may commit right now.
 * `troops` must already have in-flight sends subtracted. Returns Infinity in
 * manual mode (no governing) and 0 when the click should be held.
 */
export function allowedSend(
  cfg: GovernorConfig,
  troops: number,
  maxTroops: number,
): number {
  if (cfg.mode === "manual") return Infinity;
  if (!(troops > 0) || !(maxTroops > 0)) return 0;

  if (cfg.mode === "assist") {
    let send = clamp01(cfg.fixedPct / 100) * troops;
    if (cfg.floorPct > 0) {
      send = Math.min(send, troops - clamp01(cfg.floorPct / 100) * maxTroops);
    }
    return Math.max(0, Math.floor(send));
  }

  // peak / breakeven: spend only the surplus above the target level, capped.
  let send = troops - targetFraction(cfg) * maxTroops;
  send = Math.min(send, clamp01(cfg.capPct / 100) * troops);
  if (send < MIN_USEFUL_SEND * maxTroops) return 0;
  return Math.floor(send);
}

export interface ClickDecision {
  troops: number; // troops the attack should carry
  held: boolean; // drop the attack entirely
  trimmed: boolean; // troops was reduced from the request
}

/** Apply `allowedSend` to one attack the player just fired. Never increases it. */
export function decideClick(
  cfg: GovernorConfig,
  requested: number,
  troops: number,
  maxTroops: number,
): ClickDecision {
  const allowed = allowedSend(cfg, troops, maxTroops);
  if (allowed === Infinity) return { troops: requested, held: false, trimmed: false };
  if (allowed <= 0) return { troops: 0, held: true, trimmed: false };
  if (requested > allowed) return { troops: allowed, held: false, trimmed: true };
  return { troops: requested, held: false, trimmed: false };
}

// ---------- In-flight ledger ----------

export interface PendingSend {
  amount: number; // troops committed by the attack
  tick: number; // game tick when the click was emitted
  t: number; // wall-clock ms when emitted
  base: number; // observed troops at emit time
}

/** Game ticks after which a send's deduction should be visible (≈700ms RTT headroom). */
export const SETTLE_TICKS = 8;
/** Hard wall-clock expiry so a rejected attack can't hold troops forever. */
export const SETTLE_MAX_MS = 3000;

/**
 * Drop sends whose deduction is now reflected in the observed count. A send
 * settles once enough game ticks have passed AND troops have actually dipped
 * to/below the level seen at emit (a rejected attack never dips, so it lingers
 * until SETTLE_MAX_MS — erring toward holding, never toward over-sending).
 * Ticks only advance as server turns arrive, so lag stretches the window.
 */
export function settlePending(
  pending: PendingSend[],
  nowTick: number,
  nowMs: number,
  observedTroops: number,
): PendingSend[] {
  return pending.filter((p) => {
    if (nowMs - p.t >= SETTLE_MAX_MS) return false;
    const ticksPassed = nowTick - p.tick >= SETTLE_TICKS;
    return !(ticksPassed && observedTroops <= p.base);
  });
}

export function pendingTotal(pending: PendingSend[]): number {
  let sum = 0;
  for (const p of pending) sum += p.amount;
  return sum;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}
