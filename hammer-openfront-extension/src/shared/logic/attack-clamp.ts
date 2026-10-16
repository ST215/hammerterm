/**
 * attack-clamp.ts — recognise the game's own attack events on the EventBus.
 *
 * The MAIN-world emit wrapper (hooks.content.ts) passes these through the
 * attack governor (attack-governor.ts) before Transport's listener runs.
 * Kept pure and import-free so the MAIN world can bundle it.
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
