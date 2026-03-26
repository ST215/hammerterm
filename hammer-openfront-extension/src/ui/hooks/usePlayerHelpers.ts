import { useStore } from "@store/index";
import {
  readMyPlayer,
  getTeammates,
  getAllies,
} from "@shared/logic/player-helpers";
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
 * Zustand equality for the playersById Map. Only triggers re-render on
 * structural changes (join/leave/die/rename/team), not volatile stats.
 */
function mapStructurallyEqual(
  a: Map<string, PlayerData>,
  b: Map<string, PlayerData>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, pa] of a) {
    const pb = b.get(id);
    if (!pb) return false;
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
 * Returns teammates (same-team, alive). Re-renders only on structural changes.
 */
export function useTeammates() {
  return useStore(
    (s) => {
      const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
      return getTeammates(s.playersById, me);
    },
    playerListEqual,
  );
}

/**
 * Returns allies (alliance partners, alive). Re-renders only on structural changes.
 */
export function useAllies() {
  return useStore(
    (s) => {
      const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
      return getAllies(s.playersById, me, s.myAllies);
    },
    playerListEqual,
  );
}

/**
 * Returns all alive players except me, sorted by name.
 * Re-renders only on structural changes (join/leave/die/rename).
 */
export function useAllAlivePlayers() {
  return useStore(
    (s) => {
      const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
      const result: PlayerData[] = [];
      for (const p of s.playersById.values()) {
        if (me && p.id === me.id) continue;
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
 * Use this instead of `useStore((s) => s.playersById)` to avoid blink
 * from volatile stat updates (troops/gold ticking).
 */
export function usePlayersById() {
  return useStore((s) => s.playersById, mapStructurallyEqual);
}
