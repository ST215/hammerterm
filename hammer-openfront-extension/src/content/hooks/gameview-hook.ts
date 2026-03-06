/**
 * GameView hook — patches game.updatesSinceLastTick to intercept
 * DisplayEvents (donation confirmations, server messages, etc.).
 *
 * Ported from hammer.js lines ~2286-2431.
 */

import { GameUpdateType } from "@shared/constants";
import { registerInterval, registerTimeout, registerCleanup } from "../cleanup";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let gameViewHooked = false;
let gameViewHookAttempts = 0;
const MAX_GAMEVIEW_ATTEMPTS = 200; // 20 seconds max at 100ms interval
let hookCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Callback invoked for each DisplayEvent captured from the GameView.
 * Set via setDisplayEventHandler() before installing the hook.
 * Defaults to console.log until a real handler is wired up.
 */
let displayEventHandler: (evt: any) => void = (evt) => {
  console.log("[Hammer] DisplayEvent (no handler registered):", evt);
};

// ---------------------------------------------------------------------------
// clearStaleHooks — remove __hammerHooked flags from previous injections
// ---------------------------------------------------------------------------

function clearStaleHooks(): void {
  try {
    const eventsDisplay = document.querySelector("events-display") as any;
    if (eventsDisplay?.game?.__hammerHooked) {
      console.log("[Hammer] Clearing stale hook from previous session");
      delete eventsDisplay.game.__hammerHooked;
    }
    if (eventsDisplay?.__hammerComponentHooked) {
      console.log(
        "[Hammer] Clearing stale component hook from previous session",
      );
      delete eventsDisplay.__hammerComponentHooked;
    }
  } catch {
    // Ignore errors during cleanup
  }
}

// ---------------------------------------------------------------------------
// hookGameView — patch updatesSinceLastTick to capture DisplayEvents
// ---------------------------------------------------------------------------

function hookGameView(): boolean {
  // Try to find GameView instance via events-display element
  // (singleplayer path: events-display.game; multiplayer: game-view is null in SP)
  const eventsDisplay = document.querySelector("events-display") as any;

  if (!eventsDisplay) {
    return false;
  }

  if (!eventsDisplay.game) {
    return false;
  }

  const gameView = eventsDisplay.game;

  if (!gameView.updatesSinceLastTick) {
    console.warn("[Hammer] GameView found but no updatesSinceLastTick method");
    return false;
  }

  // Check if already hooked by THIS session (not stale)
  if (gameView.__hammerHooked && gameViewHooked) {
    return true;
  }

  // Clear stale hook if present
  if (gameView.__hammerHooked && !gameViewHooked) {
    console.log("[Hammer] Re-hooking GameView (stale hook detected)");
    delete gameView.__hammerHooked;
  }

  const originalUpdatesSinceLastTick =
    gameView.updatesSinceLastTick.bind(gameView);

  gameView.updatesSinceLastTick = function () {
    const updates = originalUpdatesSinceLastTick();

    if (updates) {
      // Process DisplayEvents (type 3)
      const displayEvents = updates[GameUpdateType.DisplayEvent];
      if (displayEvents?.length) {
        for (const evt of displayEvents) {
          try {
            displayEventHandler(evt);
          } catch (err) {
            console.warn("[Hammer] DisplayEvent processing error:", err);
          }
        }
      }
    }

    return updates;
  };

  gameView.__hammerHooked = true;
  gameViewHooked = true;
  console.log(
    "[Hammer] Successfully hooked GameView.updatesSinceLastTick() after",
    gameViewHookAttempts,
    "attempts",
  );
  return true;
}

// ---------------------------------------------------------------------------
// tryHookGameView — single attempt with logging and limit checking
// ---------------------------------------------------------------------------

function tryHookGameView(): boolean {
  if (hookGameView()) {
    if (hookCheckInterval) {
      clearInterval(hookCheckInterval);
      hookCheckInterval = null;
    }
    return true;
  }

  gameViewHookAttempts++;
  if (gameViewHookAttempts >= MAX_GAMEVIEW_ATTEMPTS) {
    console.warn(
      "[Hammer] Failed to hook GameView after",
      MAX_GAMEVIEW_ATTEMPTS,
      "attempts",
    );
    console.warn(
      "[Hammer] Donation tracking will NOT work - DisplayEvents cannot be captured",
    );
    if (hookCheckInterval) {
      clearInterval(hookCheckInterval);
      hookCheckInterval = null;
    }
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// installGameViewHook — start periodic attempts to hook the GameView
// ---------------------------------------------------------------------------

export function installGameViewHook(): void {
  // Idempotent — if already hooked, skip
  if (gameViewHooked) return;

  // Reset state for fresh install
  gameViewHookAttempts = 0;

  // Clear stale hooks from previous injection
  clearStaleHooks();

  // Periodic hook attempts until successful (every 100ms for fast mid-match hooking)
  hookCheckInterval = setInterval(() => {
    if (!gameViewHooked) {
      tryHookGameView();
    } else {
      if (hookCheckInterval) {
        clearInterval(hookCheckInterval);
        hookCheckInterval = null;
      }
    }
  }, 100);
  registerInterval(hookCheckInterval);

  // Immediate attempts with escalating delays for mid-match start
  tryHookGameView(); // Immediate
  const earlyDelays = [50, 100, 250, 500];
  for (const delay of earlyDelays) {
    const tid = setTimeout(() => tryHookGameView(), delay);
    registerTimeout(tid);
  }

  // Status log after 1 second
  const statusTimeout = setTimeout(() => {
    if (gameViewHooked) {
      console.log("[Hammer] Donation tracking ready");
    } else {
      console.log(
        "[Hammer] Still waiting for game to load... (this is normal if in lobby)",
      );
    }
  }, 1000);
  registerTimeout(statusTimeout);

  registerCleanup(() => {
    if (hookCheckInterval) {
      clearInterval(hookCheckInterval);
      hookCheckInterval = null;
    }
    gameViewHooked = false;
  });
}

// ---------------------------------------------------------------------------
// setDisplayEventHandler — wire up the callback for DisplayEvents
// ---------------------------------------------------------------------------

export function setDisplayEventHandler(handler: (evt: any) => void): void {
  displayEventHandler = handler;
}

// ---------------------------------------------------------------------------
// getGameViewHookState — expose internal state for diagnostics
// ---------------------------------------------------------------------------

export function getGameViewHookState() {
  return {
    hooked: gameViewHooked,
    attempts: gameViewHookAttempts,
    maxAttempts: MAX_GAMEVIEW_ATTEMPTS,
  };
}
