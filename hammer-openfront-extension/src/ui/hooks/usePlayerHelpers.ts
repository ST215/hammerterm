import { useCallback } from "react";
import { useStore } from "@store/index";
import { readMyPlayer } from "@shared/logic/player-helpers";
import type { PlayerData } from "@shared/types";

/**
 * Zustand equality for a single player: skip re-render if all UI-visible fields match.
 */
function playerEqual(a: PlayerData | null, b: PlayerData | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.troops === b.troops &&
    a.gold === b.gold &&
    a.isAlive === b.isAlive &&
    a.team === b.team &&
    a.displayName === b.displayName &&
    a.name === b.name &&
    a.tilesOwned === b.tilesOwned &&
    a.smallID === b.smallID
  );
}

/**
 * Zustand equality for a player list used in target pickers / player grids.
 * Only compares structural fields (name, team, alive) — ignores volatile
 * stats (troops, gold, tiles) so the UI doesn't blink on every tick.
 */
function playerListEqual(a: PlayerData[], b: PlayerData[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (
      pa.id !== pb.id ||
      pa.isAlive !== pb.isAlive ||
      pa.team !== pb.team ||
      pa.displayName !== pb.displayName ||
      pa.name !== pb.name ||
      pa.smallID !== pb.smallID ||
      pa.clientID !== pb.clientID
    ) return false;
  }
  return true;
}

/**
 * Structural-only equality for a single player.
 * Ignores volatile stats (troops, gold, tiles) — only triggers on
 * identity/state changes (join, die, rename, team change).
 */
function playerStructuralEqual(a: PlayerData | null, b: PlayerData | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.isAlive === b.isAlive &&
    a.team === b.team &&
    a.displayName === b.displayName &&
    a.name === b.name &&
    a.smallID === b.smallID &&
    a.clientID === b.clientID
  );
}

/**
 * Returns the current user's player data. Re-renders only when the player's
 * own fields change, not when unrelated players update.
 */
export function useMyPlayer() {
  return useStore(
    (s) => readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID),
    playerEqual,
  );
}

/**
 * Returns the current user's player data with structural-only equality.
 * Does NOT re-render on troops/gold/tiles ticking — only on identity changes.
 * Use this in target pickers, player lists, and other UI that doesn't display live stats.
 */
export function useMyPlayerStructural() {
  return useStore(
    (s) => readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID),
    playerStructuralEqual,
  );
}

/**
 * Returns teammates (same-team, alive). Re-renders only on structural changes.
 *
 * Uses s.mySmallID and s.myTeam directly (stable store fields) instead of
 * readMyPlayer() which can transiently return null during handleRefresh()
 * map replacement — causing the team section to flash empty.
 */
export function useTeammates() {
  return useStore(
    (s) => {
      if (s.myTeam == null || s.mySmallID == null) return [];
      const result: PlayerData[] = [];
      for (const p of s.playersById.values()) {
        if (p.smallID === s.mySmallID) continue;
        if (p.team !== s.myTeam || !p.isAlive) continue;
        result.push(p);
      }
      return result.sort((a, b) =>
        (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""),
      );
    },
    playerListEqual,
  );
}

/**
 * Returns allies (alliance partners, alive). Re-renders only on structural changes.
 *
 * Uses s.mySmallID directly instead of readMyPlayer().
 */
export function useAllies() {
  return useStore(
    (s) => {
      if (s.mySmallID == null) return [];
      const result: PlayerData[] = [];
      for (const p of s.playersById.values()) {
        if (p.smallID === s.mySmallID) continue;
        if (!p.isAlive || p.smallID == null || !s.myAllies.has(p.smallID)) continue;
        result.push(p);
      }
      return result.sort((a, b) =>
        (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""),
      );
    },
    playerListEqual,
  );
}

/**
 * Returns all alive players except me, sorted by name.
 * Re-renders only on structural changes (join/leave/die/rename).
 *
 * Uses s.mySmallID directly instead of readMyPlayer().
 */
export function useAllAlivePlayers() {
  return useStore(
    (s) => {
      const result: PlayerData[] = [];
      for (const p of s.playersById.values()) {
        if (s.mySmallID != null && p.smallID === s.mySmallID) continue;
        if (!p.isAlive) continue;
        result.push(p);
      }
      return result.sort((a, b) =>
        (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""),
      );
    },
    playerListEqual,
  );
}

/**
 * Returns the playersById Map with structural-only equality.
 *
 * WARNING: Re-renders on ANY structural change across ALL players.
 * In large games this fires 1-3x/sec. Prefer usePlayerLookup() for
 * non-reactive reads or useAllAlivePlayers()/useTeammates() for filtered lists.
 */
export function usePlayersById() {
  return useStore(
    (s) => s.playersById,
    (a, b) => {
      if (a === b) return true;
      if (a.size !== b.size) return false;
      for (const [id, pa] of a) {
        const pb = b.get(id);
        if (!pb) return false;
        if (
          pa.id !== pb.id || pa.isAlive !== pb.isAlive || pa.team !== pb.team ||
          pa.displayName !== pb.displayName || pa.name !== pb.name ||
          pa.smallID !== pb.smallID || pa.clientID !== pb.clientID
        ) return false;
      }
      return true;
    },
  );
}

/**
 * Returns a stable lookup function for reading player data by ID.
 * Does NOT subscribe to store changes — zero re-renders.
 * Use this for cosmetic lookups (name colors, display names).
 */
export function usePlayerLookup() {
  return useCallback((id: string): PlayerData | undefined => {
    return useStore.getState().playersById.get(id);
  }, []);
}
