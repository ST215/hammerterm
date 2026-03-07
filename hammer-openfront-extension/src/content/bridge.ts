/**
 * bridge.ts — Receives data from the MAIN world hooks via window.postMessage
 * and routes it to the Zustand store. Also provides sendToMainWorld() for
 * dispatching commands (send troops/gold/emoji/etc.) to the MAIN world.
 *
 * Additionally handles dashboard port connections for cross-context state sync.
 *
 * This module runs in the ISOLATED world content script.
 */

import { useStore } from "@store/index";
import type { PlayerData } from "@shared/types";
import { serialize } from "@shared/serialize";
import { processDisplayMessage, drainPendingMessages } from "./game/message-processor";
import { record } from "../recorder";

// ---------------------------------------------------------------------------
// Hook status (for diagnostics UI)
// ---------------------------------------------------------------------------

const hookStatus: Record<string, boolean> = {
  worker: false,
  websocket: false,
  gameview: false,
  eventbus: false,
};

let discoveredEventClasses: string[] = [];

// ---------------------------------------------------------------------------
// Dashboard port sync
// ---------------------------------------------------------------------------

let dashboardPort: chrome.runtime.Port | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 500;

function sendSnapshot(): void {
  if (!dashboardPort) return;
  try {
    const state = useStore.getState();
    const snapshot = serialize(state);
    dashboardPort.postMessage({ type: "snapshot", data: snapshot });
  } catch {
    // Port may be disconnected
  }
}

function startDashboardSync(port: chrome.runtime.Port): void {
  dashboardPort = port;

  record("bridge", "dashboard.connect");

  // Send initial snapshot
  sendSnapshot();

  // Periodic sync
  syncTimer = setInterval(sendSnapshot, SYNC_INTERVAL_MS);

  port.onDisconnect.addListener(() => {
    dashboardPort = null;
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    record("bridge", "dashboard.disconnect");
    console.log("[Hammer:Bridge] Dashboard disconnected");
  });

  // Listen for commands from dashboard
  port.onMessage.addListener((msg) => {
    if (msg.type === "command") {
      sendToMainWorld(msg.payload);
    }
    if (msg.type === "store-action") {
      // Dashboard wants to call a store action (e.g., setView, togglePaused)
      const store = useStore.getState();
      const fn = (store as any)[msg.action];
      if (typeof fn === "function") {
        fn(...(msg.args || []));
      }
    }
    if (msg.type === "sync-local" && msg.data) {
      // Dashboard pushes LOCAL_KEY changes so automation stays in sync
      record("bridge", "sync-local", { keys: Object.keys(msg.data) });
      useStore.setState(msg.data);
    }
  });

  console.log("[Hammer:Bridge] Dashboard connected, sync started");
}

// ---------------------------------------------------------------------------
// installBridge — start listening for messages from MAIN world
// ---------------------------------------------------------------------------

// Track current listener for cleanup on re-install (extension reload)
let currentBridgeListener: ((e: MessageEvent) => void) | null = null;

export function installBridge(): void {
  // Remove previous listener if re-installing after extension reload
  if (currentBridgeListener) {
    window.removeEventListener("message", currentBridgeListener);
  }
  currentBridgeListener = onBridgeMessage;
  window.addEventListener("message", onBridgeMessage);

  // Register with background so dashboard can find this tab
  chrome.runtime.sendMessage({ type: "CONTENT_READY" });

  // Accept port connections from dashboard
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "hammer-dashboard") {
      startDashboardSync(port);
    }
  });

  console.log("[Hammer:Bridge] Listening for main world messages");
}

function onBridgeMessage(e: MessageEvent): void {
  if (!e.data?.__hammer) return;
  const { type, payload } = e.data;

  switch (type) {
    case "init":
      handleInit(payload);
      break;
    case "players":
      handlePlayerUpdate(payload);
      break;
    case "display":
      handleDisplayEvent(payload);
      break;
    case "bootstrap":
      handleBootstrap(payload);
      break;
    case "refresh":
      handleRefresh(payload);
      break;
    case "tiles":
      handleTiles(payload);
      break;
    case "status":
      handleStatus(payload);
      break;
    case "mouse-target":
      handleMouseTarget(payload);
      break;
    case "send-result":
      // Could add callback handling here if needed
      break;
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handleInit(payload: { clientID: string }): void {
  if (!payload?.clientID) return;
  useStore.getState().setCurrentClientID(payload.clientID);
  console.log("[Hammer:Bridge] ClientID set:", payload.clientID);
}

function handlePlayerUpdate(payload: {
  players: any[];
  tick?: number;
}): void {
  if (!payload?.players?.length) return;

  const store = useStore.getState();

  // Atomic merge: copy existing maps, overlay incremental updates
  const newById = new Map(store.playersById);
  const newBySmallId = new Map(store.playersBySmallId);

  for (const p of payload.players) {
    if (!p) continue;
    newById.set(p.id, p);
    if (p.smallID != null) newBySmallId.set(p.smallID, p);
  }

  const list = [...newById.values()];
  store.setPlayers(newById, newBySmallId, list);

  // Identify our player
  let my: any = null;
  if (store.currentClientID) {
    my = payload.players.find(
      (p: any) => p.clientID === store.currentClientID,
    );
  }
  if (!my && store.mySmallID === null) {
    my = payload.players.find((p: any) => p.isAlive);
  }
  if (!my && store.mySmallID !== null) {
    my = payload.players.find(
      (p: any) => p.smallID === store.mySmallID,
    );
  }

  if (my) {
    const smallID = my.smallID ?? store.mySmallID;
    const team = my.team ?? store.myTeam;
    if (smallID != null) {
      store.setMyIdentity(smallID, team);
    }
    if (Array.isArray(my.allies) && my.allies.length > 0) {
      store.updateAllies(new Set(my.allies));
    }
    if (!store.playerDataReady && smallID !== null) {
      store.markPlayerDataReady();
      drainPendingMessages();
    }
  }
}

function handleDisplayEvent(payload: { event: any }): void {
  if (payload?.event) {
    processDisplayMessage(payload.event);
  }
}

function handleBootstrap(payload: {
  players: any[];
  source: string;
  clientID?: string | null;
}): void {
  if (!payload?.players?.length) return;
  record("bridge", "bootstrap", { playerCount: payload.players.length, source: payload.source });

  const store = useStore.getState();

  if (payload.clientID && !store.currentClientID) {
    store.setCurrentClientID(payload.clientID);
  }

  let foundMyPlayer = false;
  const newById = new Map<string, PlayerData>();
  const newBySmallId = new Map<number, PlayerData>();

  for (const p of payload.players) {
    if (!p) continue;
    newById.set(p.id, p);
    if (p.smallID != null) newBySmallId.set(p.smallID, p);

    if (
      store.currentClientID &&
      p.clientID === store.currentClientID
    ) {
      if (p.smallID != null) store.setMyIdentity(p.smallID, p.team);
      if (Array.isArray(p.allies) && p.allies.length > 0) {
        store.updateAllies(new Set(p.allies));
      }
      foundMyPlayer = true;
      console.log(
        "[Hammer:Bridge] Bootstrapped from",
        payload.source,
        "mySmallID:",
        p.smallID,
      );
    }
  }

  if (newById.size > 0) {
    store.setPlayers(newById, newBySmallId, [...newById.values()]);
    if (foundMyPlayer && store.mySmallID != null) {
      store.markPlayerDataReady();
      drainPendingMessages();
    }
  }
}

function handleRefresh(payload: { players: any[] }): void {
  if (!payload?.players?.length) return;

  const store = useStore.getState();
  const newById = new Map(store.playersById);
  const newBySmallId = new Map(store.playersBySmallId);

  for (const p of payload.players) {
    if (!p) continue;
    newById.set(p.id, p);
    if (p.smallID != null) newBySmallId.set(p.smallID, p);

    if (
      store.currentClientID &&
      p.clientID === store.currentClientID
    ) {
      if (p.smallID != null) store.setMyIdentity(p.smallID, p.team);
      if (!store.playerDataReady) {
        store.markPlayerDataReady();
        drainPendingMessages();
      }
    }
  }

  if (newById.size > 0) {
    store.setPlayers(newById, newBySmallId, [...newById.values()]);
  }
}

function handleTiles(payload: { packed: string[] }): void {
  // Tiles are processed in the main world for mouse targeting.
  // We store them here too if needed for UI display.
  // For now, tile data stays in the main world only.
}

function handleStatus(payload: {
  hook: string;
  found: boolean;
  classes?: string[];
}): void {
  if (payload?.hook) {
    hookStatus[payload.hook] = !!payload.found;
    record("hook", payload.hook + (payload.found ? ".found" : ".missing"), {
      found: payload.found,
      ...(payload.classes ? { classes: payload.classes } : {}),
    });
  }
  if (payload?.classes) {
    discoveredEventClasses = payload.classes;
  }
}

// ALT+M mouse target result callback
let mouseTargetCallback: ((result: any) => void) | null = null;

function handleMouseTarget(payload: any): void {
  if (mouseTargetCallback) {
    mouseTargetCallback(payload);
    mouseTargetCallback = null;
  }
}

// ---------------------------------------------------------------------------
// Send commands to MAIN world
// ---------------------------------------------------------------------------

export function sendToMainWorld(payload: any): void {
  window.postMessage(
    { __hammer: true, type: "send", payload },
    "*",
  );
}

/**
 * Request ALT+M mouse target capture from main world.
 * Returns a promise that resolves with the target info.
 */
export function captureMouseTargetViaMainWorld(): Promise<any> {
  return new Promise((resolve) => {
    mouseTargetCallback = resolve;
    sendToMainWorld({ action: "capture-mouse" });
    // Timeout in case main world doesn't respond
    setTimeout(() => {
      if (mouseTargetCallback === resolve) {
        mouseTargetCallback = null;
        resolve({ found: false, reason: "timeout" });
      }
    }, 500);
  });
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export function getHookStatus() {
  return { ...hookStatus };
}

export function getDiscoveredEventClassNames(): string[] {
  return [...discoveredEventClasses];
}
