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

const keydownHandler = (e: KeyboardEvent): void | false => {
  let handled = false;

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

  if (handled) return false;
};

// ---------- Install / Remove ----------

export function installKeyboardHandler(): void {
  if (installed) return;
  // CRITICAL: Use capture phase (true) to intercept BEFORE the game
  window.addEventListener("keydown", keydownHandler, true);
  installed = true;
  log("[KEYBOARD] Handler installed");
}

export function removeKeyboardHandler(): void {
  if (!installed) return;
  window.removeEventListener("keydown", keydownHandler, true);
  installed = false;
  log("[KEYBOARD] Handler removed");
}
