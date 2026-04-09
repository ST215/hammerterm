/**
 * troop-math.ts — OpenFront troop growth formulas.
 *
 * Derived from OpenFrontIO/src/core/configuration/DefaultConfig.ts.
 * All formulas use INTERNAL troop units (10x display value).
 *
 * Key formula:
 *   growthPerTick = (10 + troops^0.73 / 4) × (1 - troops / maxTroops)
 *   1 tick = 100ms → 10 ticks/sec → 600 ticks/min
 *
 * Peak regeneration occurs at 42% of max capacity.
 * At 42%, the product of base growth and damping ratio is maximized.
 */

/**
 * Troop growth per game tick (100ms) at given troop level.
 * This is the exact formula from DefaultConfig.ts:troopIncreaseRate().
 * Human players only (no bot/nation modifiers).
 */
export function troopGrowthPerTick(troops: number, maxT: number): number {
  if (maxT <= 0) return 0;
  const base = 10 + Math.pow(troops, 0.73) / 4;
  const ratio = Math.max(0, 1 - troops / maxT);
  return base * ratio;
}

/** Troop growth per second (10 ticks/sec). */
export function troopGrowthPerSec(troops: number, maxT: number): number {
  return troopGrowthPerTick(troops, maxT) * 10;
}

/**
 * Simulate troop count after a given number of seconds.
 * Useful for "time to threshold" calculations.
 */
export function troopsAfterSeconds(
  startTroops: number,
  maxT: number,
  seconds: number,
): number {
  let t = startTroops;
  const ticks = Math.round(seconds * 10);
  for (let i = 0; i < ticks; i++) {
    t += troopGrowthPerTick(t, maxT);
    if (t >= maxT) return maxT;
  }
  return t;
}

/**
 * Seconds to regenerate from `current` to `target` troops.
 * Returns Infinity if target exceeds maxT.
 */
export function timeToReach(
  current: number,
  target: number,
  maxT: number,
): number {
  if (current >= target) return 0;
  if (target > maxT) return Infinity;
  let t = current;
  let ticks = 0;
  while (t < target && ticks < 1_000_000) {
    t += troopGrowthPerTick(t, maxT);
    ticks++;
  }
  return ticks / 10; // seconds
}

/**
 * The capacity percentage where troop regeneration is fastest.
 * Mathematically: the peak of f(x) = (10 + x^0.73/4) × (1 - x/max).
 * Empirically verified at 42% for all realistic max values.
 */
export const OPTIMAL_REGEN_PCT = 0.42;

/**
 * Calculate Palantir send amount for auto-troops.
 *
 * Strategy: send everything above the optimal regen floor (42% of max).
 * This creates a self-correcting oscillation:
 *   57% → send to 42% → wait 10s → recover to 57% → repeat
 *
 * With multiple targets, the total is split evenly.
 *
 * @returns per-target send amount (internal units), or 0 if below floor
 */
export function palantirTroopAmount(
  currentTroops: number,
  maxT: number,
  targetCount: number,
): number {
  if (targetCount <= 0 || maxT <= 0) return 0;
  const floor = maxT * OPTIMAL_REGEN_PCT;
  const surplus = currentTroops - floor;
  if (surplus <= 0) return 0;
  return Math.floor(surplus / targetCount);
}
