import type { PlayerData } from "../types";

export function findPlayer(
  name: string | null,
  playersById: Map<string, PlayerData>,
): { id: string; name: string } | null {
  if (!name || playersById.size === 0) return null;
  const lower = String(name).toLowerCase();
  for (const p of playersById.values()) {
    const pn = (p.displayName || p.name || "").toLowerCase();
    if (pn === lower) return { id: p.id, name: p.displayName || p.name || name };
  }
  return null;
}

export function findPlayerByName(
  name: string | null,
  playersById: Map<string, PlayerData>,
): PlayerData | null {
  if (!name || playersById.size === 0) return null;
  const lower = String(name).toLowerCase();
  for (const p of playersById.values()) {
    if ((p.displayName || p.name || "").toLowerCase() === lower) return p;
  }
  return null;
}

export function readMyPlayer(
  lastPlayers: PlayerData[],
  playersById: Map<string, PlayerData>,
  currentClientID: string | null,
  mySmallID: number | null,
): PlayerData | null {
  let me: PlayerData | undefined;
  if (currentClientID) me = lastPlayers.find((p) => p.clientID === currentClientID);
  if (!me && mySmallID != null) me = lastPlayers.find((p) => p.smallID === mySmallID);
  if (!me && playersById.size > 0) {
    if (currentClientID) {
      for (const p of playersById.values()) {
        if (p.clientID === currentClientID) { me = p; break; }
      }
    }
    if (!me && mySmallID != null) {
      for (const p of playersById.values()) {
        if (p.smallID === mySmallID) { me = p; break; }
      }
    }
  }
  return me || null;
}

export function asIsAlly(
  tid: string,
  playersById: Map<string, PlayerData>,
  myTeam: number | null,
  myAllies: Set<number>,
): boolean {
  const p = playersById.get(tid);
  if (!p) return false;
  if (p.team != null && myTeam != null && p.team === myTeam) return true;
  if (p.smallID != null && myAllies.has(p.smallID)) return true;
  return false;
}

export function getTeammates(
  playersById: Map<string, PlayerData>,
  me: PlayerData | null,
): PlayerData[] {
  if (!me || me.team == null) return [];
  return [...playersById.values()]
    .filter((p) => p.id !== me.id && p.team === me.team && p.isAlive)
    .sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
}

export function getAllies(
  playersById: Map<string, PlayerData>,
  me: PlayerData | null,
  myAllies: Set<number>,
): PlayerData[] {
  if (!me) return [];
  return [...playersById.values()]
    .filter((p) => p.id !== me.id && p.isAlive && p.smallID != null && myAllies.has(p.smallID))
    .sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
}
