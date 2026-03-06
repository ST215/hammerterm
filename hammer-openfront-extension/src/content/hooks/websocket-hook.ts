/**
 * WebSocket wrapping hook — intercepts the game's WebSocket connection to
 * capture clientID from join messages and track donation intents.
 *
 * Ported from hammer.js lines ~1729-1906.
 */

import { useStore } from "@store/index";
import { registerTimeout, registerCleanup } from "../cleanup";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let OriginalWebSocket: typeof WebSocket | null = null;
let foundWebSocket = false;

/** The active game WebSocket (used by send.ts for direct fallback sends). */
let gameSocket: WebSocket | null = null;

// ---------------------------------------------------------------------------
// wrapWebSocket — intercept send & incoming messages
// ---------------------------------------------------------------------------

function wrapWebSocket(ws: any): any {
  if (!ws || ws.__hammerWrapped) return ws;
  ws.__hammerWrapped = true;

  const origSend = ws.send;
  ws.send = function (data: any) {
    try {
      if (typeof data === "string") {
        const obj = JSON.parse(data);

        if (obj?.type === "intent") {
          // Track donation intent clientID mismatches
          if (
            obj.intent?.type === "donate_gold" ||
            obj.intent?.type === "donate_troops"
          ) {
            const store = useStore.getState();
            if (obj.intent.clientID !== store.currentClientID) {
              console.error(
                "[Hammer] Donation clientID mismatch! Intent:",
                obj.intent.clientID,
                "Hammer:",
                store.currentClientID,
              );
            }
          }
          gameSocket = this;
        }

        if (obj?.type === "join" && obj.clientID) {
          const store = useStore.getState();
          if (store.currentClientID && store.currentClientID !== obj.clientID) {
            console.warn(
              "[Hammer] ClientID changed:",
              store.currentClientID,
              "->",
              obj.clientID,
            );
          }
          store.setCurrentClientID(obj.clientID);
          gameSocket = this;
        }
      }
    } catch {}
    return origSend.call(this, data);
  };

  // Incoming messages — track game socket and server errors
  ws.addEventListener("message", (ev: MessageEvent) => {
    try {
      if (!ev?.data) return;
      const obj = typeof ev.data === "string" ? JSON.parse(ev.data) : null;

      if (
        obj &&
        (obj.type === "turn" || obj.type === "start" || obj.type === "ping")
      ) {
        gameSocket = ws;
      }

      if (obj?.type === "error" || obj?.error) {
        console.error("[Hammer] WebSocket server error:", obj);
      }
    } catch {}
  });

  gameSocket = ws;
  console.log("[Hammer] Wrapped WebSocket instance");
  return ws;
}

// ---------------------------------------------------------------------------
// deepFindWebSocket — search DOM for existing WebSocket instances
// ---------------------------------------------------------------------------

function deepFindWebSocket(): boolean {
  if (!OriginalWebSocket) return false;

  // Try window properties
  try {
    for (const prop in window) {
      try {
        const val = (window as any)[prop];
        if (
          val &&
          val instanceof OriginalWebSocket &&
          !(val as any).__hammerWrapped
        ) {
          console.log(`[Hammer] Found existing WebSocket at window.${prop}`);
          wrapWebSocket(val);
          foundWebSocket = true;
          return true;
        }
      } catch {}
    }
  } catch {}

  // Try common property names
  const commonProps = ["socket", "ws", "gameSocket", "_socket", "connection"];
  for (const prop of commonProps) {
    try {
      const val = (window as any)[prop];
      if (
        val &&
        val instanceof OriginalWebSocket &&
        !(val as any).__hammerWrapped
      ) {
        console.log(`[Hammer] Found existing WebSocket at window.${prop}`);
        wrapWebSocket(val);
        foundWebSocket = true;
        return true;
      }
    } catch {}
  }

  // Deep search: game-view component (multiplayer)
  try {
    const gameView = document.querySelector("game-view") as any;
    if (gameView) {
      const transport = gameView.clientGameRunner?.transport;
      // Try transport.socket
      if (transport?.socket && !transport.socket.__hammerWrapped) {
        console.log(
          "[Hammer] Found WebSocket in game-view.clientGameRunner.transport.socket",
        );
        wrapWebSocket(transport.socket);
        foundWebSocket = true;
        gameSocket = transport.socket;
        return true;
      }
      // Try transport.ws
      if (transport?.ws && !transport.ws.__hammerWrapped) {
        console.log(
          "[Hammer] Found WebSocket in game-view.clientGameRunner.transport.ws",
        );
        wrapWebSocket(transport.ws);
        foundWebSocket = true;
        gameSocket = transport.ws;
        return true;
      }
    }
  } catch (e) {
    console.warn("[Hammer] Deep WebSocket search error:", e);
  }

  // Deep search: events-display.game (singleplayer/team mode)
  try {
    const eventsDisplay = document.querySelector("events-display") as any;
    if (eventsDisplay?.game?.worker) {
      const workerClient = eventsDisplay.game.worker;
      if (
        workerClient?.transport?.socket &&
        !workerClient.transport.socket.__hammerWrapped
      ) {
        console.log(
          "[Hammer] Found WebSocket in events-display.game.worker.transport.socket",
        );
        wrapWebSocket(workerClient.transport.socket);
        foundWebSocket = true;
        gameSocket = workerClient.transport.socket;
        return true;
      }
    }
  } catch (e) {
    console.warn("[Hammer] Deep WebSocket search (events-display) error:", e);
  }

  return false;
}

// ---------------------------------------------------------------------------
// installWebSocketHook — replace window.WebSocket and start discovery
// ---------------------------------------------------------------------------

export function installWebSocketHook(): void {
  if (OriginalWebSocket) return; // idempotent

  OriginalWebSocket = (window as any).WebSocket;

  class WrappedWebSocket extends (OriginalWebSocket as any) {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      wrapWebSocket(this);
    }
  }

  Object.defineProperty(window, "WebSocket", {
    configurable: true,
    writable: true,
    value: WrappedWebSocket,
  });

  // Try to find existing WebSocket instances immediately
  deepFindWebSocket();

  if (!foundWebSocket) {
    console.log(
      "[Hammer] No existing WebSocket found - will intercept when created",
    );
    // Retry with escalating delays
    const retryDelays = [200, 500, 1000, 2000, 4000];
    for (const delay of retryDelays) {
      const tid = setTimeout(() => {
        if (!foundWebSocket) {
          deepFindWebSocket();
        }
      }, delay);
      registerTimeout(tid);
    }
  }

  registerCleanup(restoreWebSocketConstructor);
}

// ---------------------------------------------------------------------------
// restoreWebSocketConstructor — put back the original WebSocket
// ---------------------------------------------------------------------------

export function restoreWebSocketConstructor(): void {
  if (!OriginalWebSocket) return;

  Object.defineProperty(window, "WebSocket", {
    configurable: true,
    writable: true,
    value: OriginalWebSocket,
  });
  OriginalWebSocket = null;
  foundWebSocket = false;
  gameSocket = null;
}

// ---------------------------------------------------------------------------
// getWebSocketState — expose internal state for diagnostics / send fallback
// ---------------------------------------------------------------------------

export function getWebSocketState() {
  return {
    installed: OriginalWebSocket !== null,
    foundWebSocket,
    gameSocket,
  };
}

/** Get the active game WebSocket for direct sends (fallback path). */
export function getGameSocket(): WebSocket | null {
  return gameSocket;
}
