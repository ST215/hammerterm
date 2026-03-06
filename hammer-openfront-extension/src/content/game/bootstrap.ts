/**
 * bootstrap.ts — Bootstraps player data from the game DOM.
 *
 * Ported from bootstrapPlayerData(), bootstrapPlayersFromList(),
 * refreshPlayerData(), and updatePlayersFromList() in hammer.js.
 *
 * Two paths:
 *  1. Multiplayer: game-view.clientGameRunner -> ._players, ._myPlayer, ._myClientID
 *  2. Singleplayer: events-display.game -> ._players, ._myPlayer, ._myClientID
 */

import { useStore } from "@store/index";
import type { PlayerData } from "@shared/types";
import { drainPendingMessages } from "./message-processor";

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

/**
 * Read a value from a PlayerView-like object.
 * Game objects may expose fields as plain properties OR as getter methods.
 */
function readProp<T>(obj: unknown, prop: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[prop];
  if (typeof v === "function") return (v as () => T).call(obj);
  return v as T | undefined;
}

/**
 * Normalize a raw player list (Map | Array | plain object) into an array.
 */
function normalizePlayerList(raw: unknown): unknown[] {
  if (raw instanceof Map) return [...raw.values()];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

/**
 * Extract a PlayerData record from a raw game player/PlayerView object.
 */
function extractPlayerData(p: unknown): PlayerData | null {
  if (!p) return null;
  const id = readProp<string>(p, "id");
  const smallID = readProp<number>(p, "smallID");
  const clientID = readProp<string>(p, "clientID");
  const rawName = readProp<string>(p, "name");
  const displayName = readProp<string>(p, "displayName") || rawName;
  const isAlive = readProp<boolean>(p, "isAlive") ?? true;
  const team = readProp<number>(p, "team") ?? null;
  const troops = readProp<number>(p, "troops") ?? 0;
  const gold = readProp<number | bigint>(p, "gold") ?? 0;
  const tilesOwned =
    readProp<number>(p, "numTilesOwned") ??
    readProp<number>(p, "tilesOwned") ??
    0;
  const allies = readProp<number[]>(p, "allies") ?? undefined;

  if (id == null) return null;

  return {
    id: String(id),
    smallID: smallID ?? null,
    clientID: clientID ?? null,
    name: rawName,
    displayName: displayName || rawName,
    isAlive,
    team,
    troops: Number(troops),
    gold,
    tilesOwned,
    allies,
  };
}

// ---------- Bootstrap from list ----------

function bootstrapPlayersFromList(playerList: unknown[], source: string): boolean {
  const store = useStore.getState();
  const currentClientID = store.currentClientID;

  let foundMyPlayer = false;
  const newById = new Map<string, PlayerData>();
  const newBySmallId = new Map<number, PlayerData>();

  for (const rawP of playerList) {
    const p = extractPlayerData(rawP);
    if (!p) continue;

    newById.set(p.id, p);
    if (p.smallID != null) newBySmallId.set(p.smallID, p);

    // Identify our player by clientID match
    if (currentClientID && p.clientID === currentClientID) {
      if (p.smallID != null) {
        store.setMyIdentity(p.smallID, p.team);
      }
      if (Array.isArray(p.allies) && p.allies.length > 0) {
        store.updateAllies(new Set(p.allies));
      }
      foundMyPlayer = true;
      log("Bootstrapped player data from", source, "- mySmallID:", p.smallID);
    }
  }

  // Atomic swap of player maps
  if (newById.size > 0) {
    store.setPlayers(newById, newBySmallId, [...newById.values()]);
    log("Bootstrapped", newById.size, "players from", source);

    if (foundMyPlayer && store.mySmallID != null) {
      store.markPlayerDataReady();
      drainPendingMessages();
    }
    return true;
  }
  return false;
}

// ---------- bootstrapPlayerData ----------

export function bootstrapPlayerData(): boolean {
  const store = useStore.getState();

  // Try game-view path first (multiplayer)
  try {
    const gameView = (document.querySelector("game-view") as any);
    if (gameView?.clientGameRunner) {
      const runner = gameView.clientGameRunner;

      // Get clientID from lobby
      if (runner.lobby?.clientID && !store.currentClientID) {
        store.setCurrentClientID(runner.lobby.clientID);
        log("Bootstrapped clientID from game-view:", runner.lobby.clientID);
      }

      // Try to get players from gameView
      const gv = runner.gameView;
      if (gv?.players) {
        const playersRaw = typeof gv.players === "function" ? gv.players() : gv.players;
        const playerList = normalizePlayerList(playersRaw);
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
    const eventsDisplay = (document.querySelector("events-display") as any);
    if (eventsDisplay?.game) {
      const game = eventsDisplay.game;

      // Get clientID from _myClientID
      if (game._myClientID && !store.currentClientID) {
        store.setCurrentClientID(game._myClientID);
        log("Bootstrapped clientID from events-display:", game._myClientID);
      }

      // Try to get players from _players
      if (game._players) {
        const playerList = normalizePlayerList(game._players);
        if (playerList.length > 0) {
          return bootstrapPlayersFromList(playerList, "events-display");
        }
      }

      // Also try _myPlayer directly if we have clientID
      if (game._myPlayer && store.currentClientID) {
        const p = game._myPlayer;
        const smallID = readProp<number>(p, "smallID");
        if (smallID != null) {
          const team = readProp<number>(p, "team") ?? null;
          store.setMyIdentity(smallID, team);
          store.markPlayerDataReady();
          drainPendingMessages();
          log("Bootstrapped myPlayer from events-display - mySmallID:", smallID);
          return true;
        }
      }
    }
  } catch (e) {
    console.warn("[Hammer] Bootstrap (events-display) error:", e);
  }

  return false;
}

// ---------- refreshPlayerData ----------

function updatePlayersFromList(playerList: unknown[]): void {
  const store = useStore.getState();
  const currentClientID = store.currentClientID;

  const newPlayersById = new Map(store.playersById);
  const newPlayersBySmallId = new Map(store.playersBySmallId);

  for (const rawP of playerList) {
    const p = extractPlayerData(rawP);
    if (!p) continue;

    newPlayersById.set(p.id, p);
    if (p.smallID != null) newPlayersBySmallId.set(p.smallID, p);

    // Update our player's data
    if (currentClientID && p.clientID === currentClientID) {
      if (p.smallID != null) {
        store.setMyIdentity(p.smallID, p.team);
      }
      // NOTE: myAllies intentionally NOT updated here -- Worker handler is
      // the authoritative source. Game object p.allies() can return stale data.
      if (!store.playerDataReady) {
        store.markPlayerDataReady();
        drainPendingMessages();
      }
    }
  }

  // Atomic merge-and-swap
  if (newPlayersById.size > 0) {
    store.setPlayers(newPlayersById, newPlayersBySmallId, [...newPlayersById.values()]);
  }
}

export function refreshPlayerData(): void {
  // Try events-display.game._players (singleplayer/team mode)
  try {
    const eventsDisplay = (document.querySelector("events-display") as any);
    if (eventsDisplay?.game?._players) {
      const playerList = normalizePlayerList(eventsDisplay.game._players);
      if (playerList.length > 0) {
        updatePlayersFromList(playerList);
        return;
      }
    }
  } catch (e) {
    log("[DEBUG] refreshPlayerData events-display error:", e);
  }

  // Try game-view path (multiplayer)
  try {
    const gameView = (document.querySelector("game-view") as any);
    if (gameView?.clientGameRunner?.gameView?.players) {
      const playersRaw =
        typeof gameView.clientGameRunner.gameView.players === "function"
          ? gameView.clientGameRunner.gameView.players()
          : gameView.clientGameRunner.gameView.players;
      const playerList = normalizePlayerList(playersRaw);
      if (playerList.length > 0) {
        updatePlayersFromList(playerList);
        return;
      }
    }
  } catch (e) {
    log("[DEBUG] refreshPlayerData game-view error:", e);
  }
}

// ---------- scheduleBootstrap ----------

const BOOTSTRAP_DELAYS = [200, 500, 1000, 2000, 4000];

export function scheduleBootstrap(): void {
  // Try immediately
  if (bootstrapPlayerData()) return;

  // Then at escalating delays
  for (const delay of BOOTSTRAP_DELAYS) {
    setTimeout(() => {
      if (!useStore.getState().playerDataReady) {
        bootstrapPlayerData();
      }
    }, delay);
  }
}
