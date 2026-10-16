/**
 * keyboard.ts — Keyboard shortcut handler for Hammer.
 *
 * Hotkeys:
 *   ALT+M  — Capture tile owner under mouse cursor and add as auto-send target
 *   ALT+F  — Toggle auto-troops feeder on/off
 *
 * ALT+M uses the bridge to request mouse target resolution from the MAIN world,
 * since canvas state and tile ownership data live there.
 */

import { useStore } from "@store/index";
import { captureMouseTargetViaMainWorld } from "../bridge";
import { record } from "../../recorder";

// ---------- Module-level state ----------

let installed = false;

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- captureMouseTarget ----------

/**
 * Requests the MAIN world to resolve the tile under the mouse cursor,
 * then adds the owner to auto-send targets.
 */
export async function captureMouseTarget(): Promise<void> {
  try {
    const result = await captureMouseTargetViaMainWorld();
    if (!result?.found) {
      log("[KEYBOARD] No target found:", result?.reason || "unknown");
      return;
    }

    const ownerSmallID = result.ownerSmallID;
    const store = useStore.getState();
    const player = store.playersBySmallId.get(ownerSmallID);
    if (!player) {
      log("[KEYBOARD] Player not found (ID:", ownerSmallID, ")");
      return;
    }

    const playerName = player.displayName || player.name || `Player ${ownerSmallID}`;
    const playerId = player.id;

    // Add to auto-troops targets (if not already present)
    const troopsTargets = store.asTroopsTargets;
    if (!troopsTargets.some((t) => t.id === playerId)) {
      store.addAsTroopsTarget(playerId, playerName);
    }

    // Add to auto-gold targets (if not already present)
    const goldTargets = store.asGoldTargets;
    if (!goldTargets.some((t) => t.id === playerId)) {
      store.addAsGoldTarget(playerId, playerName);
    }

    log("[KEYBOARD] Added target:", playerName);
  } catch (err) {
    console.error("[Hammer] ALT+M error:", err);
  }
}

// ---------- keydownHandler ----------

let lastTroopsToggle = 0;
let lastGovernorToggle = 0;

const keydownHandler = (e: KeyboardEvent): void | false => {
  let handled = false;

  // Record all ALT+ combos for diagnostics
  if (e.altKey) {
    record("keyboard", "alt-key", { code: e.code, key: e.key });
  }

  if (e.altKey && e.code === "KeyM") {
    e.preventDefault();
    e.stopImmediatePropagation();
    captureMouseTarget();
    handled = true;
  }

  if (e.altKey && e.code === "KeyF") {
    e.preventDefault();
    e.stopImmediatePropagation();

    // Debounce rapid toggles
    if (Date.now() - lastTroopsToggle < 600) {
      consumedCodes.set(e.code, Date.now());
      return false;
    }
    lastTroopsToggle = Date.now();

    const store = useStore.getState();
    if (store.asTroopsRunning) {
      // Lazy-import to avoid circular dependency
      import("../automation/auto-troops").then((m) => m.asTroopsStop());
    } else {
      const hasTargets =
        store.asTroopsTargets.length > 0 ||
        store.asTroopsAllTeamMode ||
        store.asTroopsAllAlliesMode;
      if (!hasTargets) {
        log("[KEYBOARD] Set targets first (ALT+M or AllTeam/AllAllies mode)");
      } else {
        import("../automation/auto-troops").then((m) => m.asTroopsStart());
      }
    }
    handled = true;
  }

  // ALT+G: toggle the attack governor — the escape hatch when it's holding
  // clicks you need to land (e.g. a counter-attack below your target level).
  if (e.altKey && e.code === "KeyG") {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (Date.now() - lastGovernorToggle < 400) {
      consumedCodes.set(e.code, Date.now());
      return false;
    }
    lastGovernorToggle = Date.now();
    import("../automation/attack-ratio").then((m) => m.asAttackRatioToggle());
    handled = true;
  }

  if (handled) {
    // The game fires its keybinds on KEYUP and ignores Alt (G = ground attack,
    // M = coordinate grid), so the release of a key we just consumed must be
    // swallowed too — by code, since Alt may already be up by then.
    consumedCodes.set(e.code, Date.now());
    return false;
  }
};

// code → when we consumed its keydown. Entries expire so a keyup lost to a
// focus change can't swallow the NEXT plain press of that key (G = attack).
const consumedCodes = new Map<string, number>();
const CONSUMED_KEYUP_MS = 2000;

const keyupHandler = (e: KeyboardEvent): void => {
  const at = consumedCodes.get(e.code);
  if (at === undefined) return;
  consumedCodes.delete(e.code);
  if (Date.now() - at > CONSUMED_KEYUP_MS) return;
  e.preventDefault();
  e.stopImmediatePropagation();
};

// ---------- Install / Remove ----------

export function installKeyboardHandler(): void {
  if (installed) return;
  // CRITICAL: Use capture phase (true) to intercept BEFORE the game
  window.addEventListener("keydown", keydownHandler, true);
  window.addEventListener("keyup", keyupHandler, true);
  installed = true;
  log("[KEYBOARD] Handler installed");
}

export function removeKeyboardHandler(): void {
  if (!installed) return;
  window.removeEventListener("keydown", keydownHandler, true);
  window.removeEventListener("keyup", keyupHandler, true);
  consumedCodes.clear();
  installed = false;
  log("[KEYBOARD] Handler removed");
}
