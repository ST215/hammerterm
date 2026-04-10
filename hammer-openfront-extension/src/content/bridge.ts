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
import {
  record, startRecording, stopRecording,
  trackMetric, registerSnapshotProviders,
  type PlayerSnapshot, type ConfigSnapshot,
} from "../recorder";

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
let lastSnapshotJson = "";

function sendSnapshot(): void {
  if (!dashboardPort) return;
  try {
    const state = useStore.getState();
    const snapshot = serialize(state);
    const json = JSON.stringify(snapshot);
    if (json === lastSnapshotJson) {
      trackMetric("dashboardSyncsSkipped");
      return;
    }
    trackMetric("dashboardSyncs");
    lastSnapshotJson = json;
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
    // When dashboard disconnects, always revert to overlay mode.
    // This fixes the race condition where the dashboard's sync-local
    // message (setting displayMode="overlay") might not arrive before
    // the port closes.
    if (useStore.getState().displayMode === "window") {
      useStore.setState({ displayMode: "overlay" });
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
    if (msg.type === "dismiss-notification" && msg.id != null) {
      useStore.getState().dismissReciprocateNotification(msg.id);
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

  // React to recorder toggle — start/stop recording in the content script
  // context where all record() calls actually happen.
  let recorderRefreshInterval: ReturnType<typeof setInterval> | null = null;

  useStore.subscribe((state, prev) => {
    if (state.recorderOn === prev.recorderOn) return;

    if (state.recorderOn) {
      startRecording();
      // Snapshot current hook status so recording always starts with context
      for (const [hook, found] of Object.entries(hookStatus)) {
        record("hook", hook + (found ? ".found" : ".missing"), { found, snapshot: true });
      }
      record("state", "init", {
        hooks: { ...hookStatus },
        eventClasses: [...discoveredEventClasses],
      });
      // Periodically refresh recorder data in the store (for dashboard sync)
      recorderRefreshInterval = setInterval(() => {
        useStore.getState().refreshRecorderCount();
      }, 1000);
    } else {
      stopRecording();
      if (recorderRefreshInterval) {
        clearInterval(recorderRefreshInterval);
        recorderRefreshInterval = null;
      }
      // Final count update
      useStore.getState().refreshRecorderCount();
    }
  });

  // Register snapshot providers for the flight recorder
  registerSnapshotProviders(
    // Player snapshot provider
    (): PlayerSnapshot[] => {
      const s = useStore.getState();
      const result: PlayerSnapshot[] = [];
      for (const p of s.playersById.values()) {
        result.push({
          id: p.id,
          sid: p.smallID ?? null,
          name: p.displayName || p.name || "",
          team: p.team ?? null,
          alive: p.isAlive !== false,
          troops: Number(p.troops || 0),
          gold: Number(p.gold || 0),
          tiles: p.tilesOwned ?? 0,
          clientID: p.clientID ?? null,
        });
      }
      return result;
    },
    // Config snapshot provider
    (): ConfigSnapshot => {
      const s = useStore.getState();
      return {
        asTroops: {
          running: s.asTroopsRunning,
          ratio: s.asTroopsRatio,
          threshold: s.asTroopsThreshold,
          cooldownSec: s.asTroopsCooldownSec,
          allTeam: s.asTroopsAllTeamMode,
          allAllies: s.asTroopsAllAlliesMode,
          targetCount: s.asTroopsTargets.length,
        },
        asGold: {
          running: s.asGoldRunning,
          ratio: s.asGoldRatio,
          threshold: s.asGoldThreshold,
          cooldownSec: s.asGoldCooldownSec,
          allTeam: s.asGoldAllTeamMode,
          allAllies: s.asGoldAllAlliesMode,
          targetCount: s.asGoldTargets.length,
        },
        reciprocate: {
          enabled: s.reciprocateEnabled,
          mode: s.reciprocateMode,
          autoPct: s.reciprocateAutoPct,
          palantirMin: s.palantirMinPct,
          palantirMax: s.palantirMaxPct,
          onTroops: s.reciprocateOnTroops,
          onGold: s.reciprocateOnGold,
        },
        broadcast: {
          enabled: s.broadcastEnabled,
          useSequence: s.broadcastUseSequence,
          sequenceLen: s.broadcastSequence.length,
        },
      };
    },
  );

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
      record("cmd", "result", payload);
      break;
    case "ws-out":
      trackMetric("wsMessagesOut");
      record("ws", "out", payload?.data ?? payload);
      break;
    case "ws-in":
      trackMetric("wsMessagesIn");
      record("ws", "in", payload?.data ?? payload);
      break;
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handleInit(payload: { clientID: string }): void {
  if (!payload?.clientID) return;

  const store = useStore.getState();

  // If player data was already ready, this is a new game — reset all stale state
  if (store.playerDataReady) {
    console.log("[Hammer:Bridge] New game detected, resetting game state");
    record("bridge", "game-reset", { prevSmallID: store.mySmallID });
    store.resetPlayerState();
    store.resetDonations();
    store.resetAutoTroops();
    store.resetAutoGold();
    store.resetBroadcast();
    store.resetReciprocate();
    store.resetComms();
    store.resetCIA();
    store.resetDonationToasts();
  }

  store.setCurrentClientID(payload.clientID);
  console.log("[Hammer:Bridge] ClientID set:", payload.clientID);
}

/**
 * Structural fields: player join/leave/die, team changes, name, tile count.
 * Changes here always propagate to the store immediately.
 */
function playerStructurallyChanged(prev: PlayerData, next: PlayerData): boolean {
  return (
    prev.isAlive !== next.isAlive ||
    prev.team !== next.team ||
    prev.displayName !== next.displayName ||
    prev.name !== next.name ||
    prev.clientID !== next.clientID
  );
}

/**
 * Volatile stats: troops, gold, and tiles tick constantly during gameplay.
 * These are throttled to at most once per STATS_THROTTLE_MS to prevent
 * continuous UI re-renders from every game tick.
 */
function playerStatsChanged(prev: PlayerData, next: PlayerData): boolean {
  return (
    prev.troops !== next.troops ||
    prev.gold !== next.gold ||
    prev.tilesOwned !== next.tilesOwned
  );
}

/** Combined check — used by bootstrap/refresh where we have no prior context. */
function playerChanged(prev: PlayerData | undefined, next: PlayerData): boolean {
  if (!prev) return true;
  return playerStructurallyChanged(prev, next) || playerStatsChanged(prev, next);
}

/** How often stat-only player updates (troops/gold ticks) land in the store. */
const STATS_THROTTLE_MS = 1000;
let lastStatsUpdateMs = 0;

/** Compare two Sets of numbers for equality. */
function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function handlePlayerUpdate(payload: {
  players: any[];
  tick?: number;
}): void {
  if (!payload?.players?.length) return;

  const store = useStore.getState();

  // Separate structural changes (instant) from stats-only changes (throttled).
  let hasStructuralChange = false;
  let hasStatsChange = false;
  for (const p of payload.players) {
    if (!p) continue;
    const prev = store.playersById.get(p.id);
    if (!prev) { hasStructuralChange = true; break; }
    if (playerStructurallyChanged(prev, p)) { hasStructuralChange = true; break; }
    if (!hasStatsChange && playerStatsChanged(prev, p)) hasStatsChange = true;
  }

  const now = Date.now();
  const shouldUpdate =
    hasStructuralChange ||
    (hasStatsChange && now - lastStatsUpdateMs >= STATS_THROTTLE_MS);

  trackMetric("playerUpdatesReceived");
  if (shouldUpdate) {
    trackMetric("playerUpdatesApplied");
    lastStatsUpdateMs = now;
    const newById = new Map(store.playersById);
    const newBySmallId = new Map(store.playersBySmallId);
    for (const p of payload.players) {
      if (!p) continue;
      newById.set(p.id, p);
      if (p.smallID != null) newBySmallId.set(p.smallID, p);
    }
    const list = [...newById.values()];
    store.setPlayers(newById, newBySmallId, list);
  } else if (hasStatsChange) {
    trackMetric("playerUpdatesThrottled");
  }

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
      if (store.mySmallID !== smallID || store.myTeam !== team) {
        store.setMyIdentity(smallID, team);
      }
    }
    if (Array.isArray(my.allies) && my.allies.length > 0) {
      const newAllies = new Set<number>(my.allies);
      if (!setsEqual(store.myAllies, newAllies)) {
        store.updateAllies(newAllies);
      }
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
    // Skip setPlayers if nothing actually changed
    let changed = newById.size !== store.playersById.size;
    if (!changed) {
      for (const [id, p] of newById) {
        if (playerChanged(store.playersById.get(id), p)) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      store.setPlayers(newById, newBySmallId, [...newById.values()]);
    }
    if (foundMyPlayer && store.mySmallID != null) {
      store.markPlayerDataReady();
      drainPendingMessages();
    }
  }
}

function handleRefresh(payload: { players: any[] }): void {
  if (!payload?.players?.length) return;

  const store = useStore.getState();

  // Full replacement — refreshPlayers sends a complete snapshot every 3s,
  // so we discard stale players from previous games or dead players.
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
      // Only set identity if not already established, or if team actually changed.
      // Refresh can return team in a different format (string vs number),
      // so don't overwrite a working identity with a potentially broken one.
      if (p.smallID != null && store.mySmallID == null) {
        store.setMyIdentity(p.smallID, p.team);
      }
      if (!store.playerDataReady) {
        store.markPlayerDataReady();
        drainPendingMessages();
      }
    }
  }

  // Separate structural changes (instant) from stats-only changes (throttled).
  let hasStructuralChange = newById.size !== store.playersById.size;
  let hasStatsChange = false;
  if (!hasStructuralChange) {
    for (const [id, p] of newById) {
      const prev = store.playersById.get(id);
      if (!prev) { hasStructuralChange = true; break; }
      if (playerStructurallyChanged(prev, p)) { hasStructuralChange = true; break; }
      if (!hasStatsChange && playerStatsChanged(prev, p)) hasStatsChange = true;
    }
  }

  const now = Date.now();
  const shouldUpdate =
    hasStructuralChange ||
    (hasStatsChange && now - lastStatsUpdateMs >= STATS_THROTTLE_MS);

  trackMetric("playerUpdatesReceived");
  if (shouldUpdate) {
    trackMetric("playerUpdatesApplied");
    lastStatsUpdateMs = now;
    store.setPlayers(newById, newBySmallId, [...newById.values()]);
  } else if (hasStatsChange) {
    trackMetric("playerUpdatesThrottled");
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
