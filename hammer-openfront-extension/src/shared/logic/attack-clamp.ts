/**
 * attack-clamp.ts — pure per-click attack-troop floor clamp.
 *
 * The MAIN-world emit wrapper (hooks.content.ts) intercepts the game's own
 * SendAttackIntentEvent / SendBoatAttackIntentEvent BEFORE Transport's listener
 * runs and clamps `evt.troops` so a manual attack can never spend below the
 * governor's reserve floor — closing the residual window where rapid clicks
 * reuse a ~150ms-stale ratio against an already-drained troop count (the
 * governor only rewrites the ratio every tick; the game reads
 * `uiState.attackRatio × troops()` synchronously at click time).
 *
 * Kept pure and import-free so it can be unit-tested and bundled into the MAIN
 * world without dragging in a dependency chain.
 */

/**
 * Field-signature test for the two attack events:
 *   SendAttackIntentEvent      = { targetID, troops }
 *   SendBoatAttackIntentEvent  = { dst, troops }
 * Property names survive minification (the game reads them); constructor names
 * do NOT, so callers may use constructor.name only as positive corroboration,
 * never as a rejection. `recipient` excludes SendDonateTroopsIntentEvent, which
 * also carries a `troops` field.
 */
export function isAttackEvent(evt: any): boolean {
  if (!evt || typeof evt !== "object") return false;
  if (typeof evt.troops !== "number") return false;
  if ("recipient" in evt) return false; // donate-troops: { recipient, troops }
  return "targetID" in evt || "dst" in evt;
}

export interface ClampResult {
  troops: number; // clamped troop count (unchanged if within floor)
  clamped: boolean; // true if troops was reduced
  swallow: boolean; // true if the attack should be dropped entirely
}

/**
 * Decide the allowed attack size given the live troop count and the absolute
 * floor (both INTERNAL units). `floorAbs <= 0` (or a non-finite live count)
 * disables the clamp. When the live count is already at/below the floor the
 * attack is swallowed so it can't breach the reserve.
 */
export function clampAttackTroops(
  reqTroops: number,
  liveTroops: number,
  floorAbs: number,
): ClampResult {
  if (!(floorAbs > 0) || !Number.isFinite(liveTroops)) {
    return { troops: reqTroops, clamped: false, swallow: false };
  }
  const allowed = Math.max(0, liveTroops - floorAbs);
  if (allowed <= 0) {
    return { troops: 0, clamped: true, swallow: true };
  }
  if (reqTroops > allowed) {
    return { troops: allowed, clamped: true, swallow: false };
  }
  return { troops: reqTroops, clamped: false, swallow: false };
}
