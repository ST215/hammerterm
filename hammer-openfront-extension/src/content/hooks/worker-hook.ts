/**
 * Worker wrapping hook — intercepts the game's Web Worker to capture
 * player updates, tile ownership, city tracking, and display events.
 *
 * Ported from hammer.js lines ~1200-1727.
 */

import { useStore } from "@store/index";
import { GameUpdateType } from "@shared/constants";
import { num } from "@shared/utils";
import { upsertCity } from "@shared/logic/city";
import type { PlayerData, CityRecord } from "@shared/types";
import { registerTimeout, registerCleanup } from "../cleanup";

// ---------------------------------------------------------------------------
// Module-level state (not in Zustand — either internal bookkeeping or
// high-frequency data that would cause excessive re-renders)
// ---------------------------------------------------------------------------

let OriginalWorker: typeof Worker | null = null;
let foundWorker = false;

/** Tile ref -> ownerSmallID.  Updated every packed tile update. */
export const tileOwnerByRef: Map<number, number> = new Map();

/** City id -> CityRecord.  Mirrors hammer.js cityById. */
export const cityById: Map<string, CityRecord> = new Map();

/** smallID -> sum of city levels owned by that player. */
export const cityLevelSumByOwner: Map<number, number> = new Map();

/** Tick counter from last game_update message. */
let lastTick = 0;
let lastTickMs = 0;

// ---------------------------------------------------------------------------
// Helper — extract a consistent PlayerData record from a raw player update
// (which may have function-style getters from PlayerView objects)
// ---------------------------------------------------------------------------

function normalizePlayer(p: any): PlayerData {
  const id = typeof p.id === "function" ? p.id() : p.id;
  const smallID = typeof p.smallID === "function" ? p.smallID() : p.smallID;
  const clientID = typeof p.clientID === "function" ? p.clientID() : p.clientID;
  const name = typeof p.name === "function" ? p.name() : p.displayName || p.name;
  const isAlive = typeof p.isAlive === "function" ? p.isAlive() : p.isAlive;
  const team = typeof p.team === "function" ? p.team() : p.team;
  const troops = typeof p.troops === "function" ? p.troops() : p.troops;
  const gold = typeof p.gold === "function" ? p.gold() : p.gold;
  const tilesOwned =
    typeof p.numTilesOwned === "function"
      ? p.numTilesOwned()
      : p.tilesOwned || p.numTilesOwned;
  const allies = typeof p.allies === "function" ? p.allies() : p.allies;

  return {
    id,
    smallID,
    clientID,
    name,
    displayName: name,
    isAlive,
    team,
    troops,
    gold,
    tilesOwned,
    allies,
  };
}

// ---------------------------------------------------------------------------
// onWorkerMessage — handles every "message" event from the wrapped Worker
// ---------------------------------------------------------------------------

function onWorkerMessage(e: MessageEvent): void {
  const msg = e.data;
  try {
    if (!msg || msg.type !== "game_update" || !msg.gameUpdate) return;
    const { updates } = msg.gameUpdate;

    // Track tick
    if (msg.gameUpdate.tick) {
      lastTick = msg.gameUpdate.tick;
      lastTickMs = Date.now();
    }

    const store = useStore.getState();

    // --- Player updates (GameUpdateType.Player) ---
    const players: any[] | undefined = updates?.[GameUpdateType.Player];
    if (players?.length) {
      // Atomic merge: copy existing maps, overlay incremental updates, swap
      const newById = new Map(store.playersById);
      const newBySmallId = new Map(store.playersBySmallId);

      for (const p of players) {
        if (!p) continue;
        newById.set(p.id, p);
        if (p.smallID != null) newBySmallId.set(p.smallID, p);
      }

      const list = [...newById.values()];
      store.setPlayers(newById, newBySmallId, list);

      // Identify our player
      let my: any = null;
      if (store.currentClientID) {
        my = players.find((p: any) => p.clientID === store.currentClientID);
      }
      // Fallback: only use isAlive heuristic if we haven't identified yet
      if (!my && store.mySmallID === null) {
        my = players.find((p: any) => p.isAlive);
      }
      // If we already know our smallID, find ourselves by that
      if (!my && store.mySmallID !== null) {
        my = players.find((p: any) => p.smallID === store.mySmallID);
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

        // Mark player data ready on first identification
        if (!store.playerDataReady && smallID !== null) {
          store.markPlayerDataReady();
        }
      }
    }

    // --- Unit updates (city tracking via GameUpdateType.Unit) ---
    const units: any[] | undefined = updates?.[GameUpdateType.Unit];
    if (units?.length) {
      for (const u of units) {
        if (!u || u.id === undefined) continue;
        if (u.unitType === "City") {
          upsertCity(cityById, cityLevelSumByOwner, u);
        }
      }
    }

    // --- Packed tile updates ---
    const packed: any[] | undefined = msg.gameUpdate?.packedTileUpdates;
    if (packed?.length) {
      for (let i = 0; i < packed.length; i++) {
        try {
          let tu = packed[i];
          if (typeof tu === "string") tu = BigInt(tu);
          const ref = Number(tu >> 16n);
          const state = Number(tu & 0xffffn);
          const ownerSmall = state & 0x0fff;
          tileOwnerByRef.set(ref, ownerSmall);
        } catch {}
      }
    }

    // NOTE: DisplayEvent processing is handled by the GameView hook,
    // not here. DisplayEvents are UI-layer only and not in Worker messages.
  } catch (err) {
    console.warn("[Hammer] Worker message error:", err);
  }
}

// ---------------------------------------------------------------------------
// wrapWorker — intercept postMessage (for clientID) and add message listener
// ---------------------------------------------------------------------------

function wrapWorker(w: any): any {
  if (!w || w.__hammerWrapped) return w;
  w.__hammerWrapped = true;

  const origPost = w.postMessage;
  w.postMessage = function (data: any, ...rest: any[]) {
    try {
      if (data?.type === "init" && data.clientID) {
        console.log("[Hammer] Worker init, clientID:", data.clientID);
        const store = useStore.getState();
        if (store.currentClientID && store.currentClientID !== data.clientID) {
          console.warn(
            "[Hammer] ClientID changed:",
            store.currentClientID,
            "->",
            data.clientID,
          );
        }
        useStore.getState().setCurrentClientID(data.clientID);
      }
    } catch {}
    return origPost.call(this, data, ...rest);
  };

  w.addEventListener("message", onWorkerMessage);
  console.log("[Hammer] Wrapped Worker instance");
  return w;
}

// ---------------------------------------------------------------------------
// deepFindWorker — search DOM for existing Worker instances
// ---------------------------------------------------------------------------

function deepFindWorker(): boolean {
  if (!OriginalWorker) return false;

  // Try window properties
  try {
    for (const prop in window) {
      try {
        const val = (window as any)[prop];
        if (val && val instanceof OriginalWorker && !(val as any).__hammerWrapped) {
          console.log(`[Hammer] Found existing Worker at window.${prop}`);
          wrapWorker(val);
          foundWorker = true;
          return true;
        }
      } catch {}
    }
  } catch {}

  // Try common property names
  const commonProps = ["gameWorker", "worker", "_worker", "mainWorker"];
  for (const prop of commonProps) {
    try {
      const val = (window as any)[prop];
      if (val && val instanceof OriginalWorker && !(val as any).__hammerWrapped) {
        console.log(`[Hammer] Found existing Worker at window.${prop}`);
        wrapWorker(val);
        foundWorker = true;
        return true;
      }
    } catch {}
  }

  // Deep search: game-view component (multiplayer)
  try {
    const gameView = document.querySelector("game-view") as any;
    if (gameView) {
      const workerClient = gameView.clientGameRunner?.worker;
      if (workerClient?.worker && !workerClient.worker.__hammerWrapped) {
        console.log(
          "[Hammer] Found Worker in game-view.clientGameRunner.worker.worker",
        );
        wrapWorker(workerClient.worker);
        foundWorker = true;
        return true;
      }
    }
  } catch (e) {
    console.warn("[Hammer] Deep Worker search error:", e);
  }

  // Deep search: events-display.game (singleplayer/team mode)
  try {
    const eventsDisplay = document.querySelector("events-display") as any;
    if (eventsDisplay?.game?.worker) {
      const workerClient = eventsDisplay.game.worker;
      const actualWorker = workerClient.worker || workerClient;
      if (
        actualWorker &&
        !actualWorker.__hammerWrapped &&
        actualWorker instanceof OriginalWorker
      ) {
        console.log("[Hammer] Found Worker in events-display.game.worker");
        wrapWorker(actualWorker);
        foundWorker = true;
        return true;
      }
    }
  } catch (e) {
    console.warn("[Hammer] Deep Worker search (events-display) error:", e);
  }

  return false;
}

// ---------------------------------------------------------------------------
// installWorkerHook — replace window.Worker and start discovery
// ---------------------------------------------------------------------------

export function installWorkerHook(): void {
  if (OriginalWorker) return; // already installed — idempotent

  OriginalWorker = (window as any).Worker;

  // WrappedWorker class that auto-wraps on construction
  class WrappedWorker extends (OriginalWorker as any) {
    constructor(...args: any[]) {
      super(...args);
      wrapWorker(this);
    }
  }

  Object.defineProperty(window, "Worker", {
    configurable: true,
    writable: true,
    value: WrappedWorker,
  });

  // Try to find existing Worker instances immediately
  deepFindWorker();

  if (!foundWorker) {
    console.log(
      "[Hammer] No existing Worker found - will intercept when created",
    );
    // Retry with escalating delays (game might still be initializing)
    const retryDelays = [200, 500, 1000, 2000, 4000];
    for (const delay of retryDelays) {
      const tid = setTimeout(() => {
        if (!foundWorker) {
          deepFindWorker();
        }
      }, delay);
      registerTimeout(tid);
    }
  }

  registerCleanup(restoreWorkerConstructor);
}

// ---------------------------------------------------------------------------
// restoreWorkerConstructor — put back the original Worker
// ---------------------------------------------------------------------------

export function restoreWorkerConstructor(): void {
  if (!OriginalWorker) return;

  Object.defineProperty(window, "Worker", {
    configurable: true,
    writable: true,
    value: OriginalWorker,
  });
  OriginalWorker = null;
  foundWorker = false;
}

// ---------------------------------------------------------------------------
// getWorkerState — expose internal state for diagnostics / other hooks
// ---------------------------------------------------------------------------

export function getWorkerState() {
  return {
    installed: OriginalWorker !== null,
    foundWorker,
    lastTick,
    lastTickMs,
    tileOwnerByRef,
    cityById,
    cityLevelSumByOwner,
  };
}

// ---------------------------------------------------------------------------
// bootstrapPlayerData — pull player data from live game objects
// (for mid-match injection when Worker messages may have been missed)
// ---------------------------------------------------------------------------

export function bootstrapPlayerData(): boolean {
  const store = useStore.getState();

  // Try game-view path first (multiplayer)
  try {
    const gameView = document.querySelector("game-view") as any;
    if (gameView?.clientGameRunner) {
      const runner = gameView.clientGameRunner;

      // Get clientID from lobby
      if (runner.lobby?.clientID && !store.currentClientID) {
        store.setCurrentClientID(runner.lobby.clientID);
        console.log(
          "[Hammer] Bootstrapped clientID from game-view:",
          runner.lobby.clientID,
        );
      }

      // Try to get players from gameView
      const gv = runner.gameView;
      if (gv?.players) {
        const playersFunc =
          typeof gv.players === "function" ? gv.players() : gv.players;
        const playerList =
          playersFunc instanceof Map
            ? [...playersFunc.values()]
            : Array.isArray(playersFunc)
              ? playersFunc
              : [];

        if (playerList.length > 0) {
          return bootstrapPlayersFromList(playerList, "game-view");
        }
      }
    }
  } catch (e) {
    console.warn("[Hammer] Bootstrap (game-view) error:", e);
  }

  // Try events-display.game path (singleplayer/team mode)
  try {
    const eventsDisplay = document.querySelector("events-display") as any;
    if (eventsDisplay?.game) {
      const game = eventsDisplay.game;

      // Get clientID from _myClientID
      if (game._myClientID && !store.currentClientID) {
        store.setCurrentClientID(game._myClientID);
        console.log(
          "[Hammer] Bootstrapped clientID from events-display:",
          game._myClientID,
        );
      }

      // Try to get players from _players
      if (game._players) {
        const playersMap = game._players;
        const playerList =
          playersMap instanceof Map
            ? [...playersMap.values()]
            : Array.isArray(playersMap)
              ? playersMap
              : Object.values(playersMap);

        if ((playerList as any[]).length > 0) {
          return bootstrapPlayersFromList(playerList as any[], "events-display");
        }
      }

      // Also try _myPlayer directly if we have clientID
      if (game._myPlayer && store.currentClientID) {
        const p = game._myPlayer;
        const smallID = typeof p.smallID === "function" ? p.smallID() : p.smallID;
        if (smallID != null) {
          const team = typeof p.team === "function" ? p.team() : p.team;
          store.setMyIdentity(smallID, team);
          store.markPlayerDataReady();
          console.log(
            "[Hammer] Bootstrapped myPlayer from events-display - mySmallID:",
            smallID,
          );
          return true;
        }
      }
    }
  } catch (e) {
    console.warn("[Hammer] Bootstrap (events-display) error:", e);
  }

  return false;
}

// ---------------------------------------------------------------------------
// bootstrapPlayersFromList — shared helper to import a list of player objects
// ---------------------------------------------------------------------------

function bootstrapPlayersFromList(playerList: any[], source: string): boolean {
  const store = useStore.getState();
  let foundMyPlayer = false;

  const newById = new Map<string, PlayerData>();
  const newBySmallId = new Map<number, PlayerData>();

  for (const p of playerList) {
    if (!p) continue;
    const data = normalizePlayer(p);
    newById.set(data.id, data);
    if (data.smallID != null) newBySmallId.set(data.smallID, data);

    // Find our player
    if (data.clientID === store.currentClientID) {
      if (data.smallID != null) {
        store.setMyIdentity(data.smallID, data.team);
      }
      if (Array.isArray(data.allies) && data.allies.length > 0) {
        store.updateAllies(new Set(data.allies));
      }
      foundMyPlayer = true;
      console.log(
        "[Hammer] Bootstrapped player data from",
        source,
        "- mySmallID:",
        data.smallID,
      );
    }
  }

  if (newById.size > 0) {
    const list = [...newById.values()];
    store.setPlayers(newById, newBySmallId, list);
    console.log("[Hammer] Bootstrapped", newById.size, "players from", source);

    if (foundMyPlayer && store.mySmallID !== null) {
      store.markPlayerDataReady();
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// refreshPlayerData — periodic refresh from live game objects
// ---------------------------------------------------------------------------

export function refreshPlayerData(): void {
  const store = useStore.getState();

  // Try events-display.game._players (singleplayer/team mode)
  try {
    const eventsDisplay = document.querySelector("events-display") as any;
    if (eventsDisplay?.game?._players) {
      const playersMap = eventsDisplay.game._players;
      const playerList: any[] =
        playersMap instanceof Map
          ? [...playersMap.values()]
          : Array.isArray(playersMap)
            ? playersMap
            : Object.values(playersMap);

      if (playerList.length > 0) {
        updatePlayersFromList(playerList);
        return;
      }
    }
  } catch {}

  // Try game-view path (multiplayer)
  try {
    const gameView = document.querySelector("game-view") as any;
    if (gameView?.clientGameRunner?.gameView?.players) {
      const playersFunc =
        typeof gameView.clientGameRunner.gameView.players === "function"
          ? gameView.clientGameRunner.gameView.players()
          : gameView.clientGameRunner.gameView.players;
      const playerList: any[] =
        playersFunc instanceof Map
          ? [...playersFunc.values()]
          : Array.isArray(playersFunc)
            ? playersFunc
            : [];

      if (playerList.length > 0) {
        updatePlayersFromList(playerList);
        return;
      }
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// updatePlayersFromList — merge incremental player data from live objects
// ---------------------------------------------------------------------------

function updatePlayersFromList(playerList: any[]): void {
  const store = useStore.getState();
  const newById = new Map(store.playersById);
  const newBySmallId = new Map(store.playersBySmallId);

  for (const p of playerList) {
    if (!p) continue;
    const data = normalizePlayer(p);
    newById.set(data.id, data);
    if (data.smallID != null) newBySmallId.set(data.smallID, data);

    // Update our player's data
    if (data.clientID === store.currentClientID) {
      if (data.smallID != null) {
        store.setMyIdentity(data.smallID, data.team);
      }
      // myAllies intentionally NOT updated here — Worker handler is the
      // authoritative source. Game object p.allies() can return stale/wrong-format
      // data that causes allies to blink every 3s refresh cycle.
      if (!store.playerDataReady) {
        store.markPlayerDataReady();
      }
    }
  }

  if (newById.size > 0) {
    const list = [...newById.values()];
    store.setPlayers(newById, newBySmallId, list);
  }
}
