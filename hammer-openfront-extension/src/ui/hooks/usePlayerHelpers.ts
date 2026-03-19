import { useRef } from "react";
import { useStore } from "@store/index";
import {
  readMyPlayer,
  getTeammates,
  getAllies,
} from "@shared/logic/player-helpers";
import type { PlayerData } from "@shared/types";

/**
 * Stable equality check for a single player object.
 * Returns the previous reference if all fields the UI cares about are unchanged,
 * preventing downstream re-renders from Map-reference churn.
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
 * Stable equality for a player list: same length, same ids, same structural fields.
 * Ignores troops/gold changes (volatile stats) so the target picker doesn't blink.
 */
function playerListStructurallyEqual(a: PlayerData[], b: PlayerData[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (
      pa.id !== pb.id ||
      pa.isAlive !== pb.isAlive ||
      pa.team !== pb.team ||
      pa.displayName !== pb.displayName ||
      pa.name !== pb.name ||
      pa.smallID !== pb.smallID
    ) return false;
  }
  return true;
}

export function useMyPlayer() {
  const prev = useRef<PlayerData | null>(null);
  const result = useStore((s) =>
    readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID),
  );
  if (playerEqual(prev.current, result)) return prev.current;
  prev.current = result;
  return result;
}

export function useTeammates() {
  const prev = useRef<PlayerData[]>([]);
  const result = useStore((s) => {
    const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
    return getTeammates(s.playersById, me);
  });
  if (playerListStructurallyEqual(prev.current, result)) return prev.current;
  prev.current = result;
  return result;
}

export function useAllies() {
  const prev = useRef<PlayerData[]>([]);
  const result = useStore((s) => {
    const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
    return getAllies(s.playersById, me, s.myAllies);
  });
  if (playerListStructurallyEqual(prev.current, result)) return prev.current;
  prev.current = result;
  return result;
}
