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

// ---------------------------------------------------------------------------
// Team aggregate stats
// ---------------------------------------------------------------------------

export interface TeamStats {
  team: any;
  players: number;
  alive: number;
  troops: number;
  gold: number;
  tiles: number;
  cityLevels: number;
}

export function getTeamStats(
  playersById: Map<string, PlayerData>,
  cityLevelSumByOwner?: Map<number, number>,
): Map<any, TeamStats> {
  const stats = new Map<any, TeamStats>();

  for (const p of playersById.values()) {
    if (p.team == null) continue;

    let ts = stats.get(p.team);
    if (!ts) {
      ts = { team: p.team, players: 0, alive: 0, troops: 0, gold: 0, tiles: 0, cityLevels: 0 };
      stats.set(p.team, ts);
    }

    ts.players++;
    if (p.isAlive !== false) ts.alive++;
    ts.troops += Number(p.troops || 0);
    ts.gold += Number(p.gold || 0);
    ts.tiles += p.tilesOwned || 0;

    if (p.smallID != null && cityLevelSumByOwner) {
      ts.cityLevels += cityLevelSumByOwner.get(p.smallID) || 0;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Teammate / ally helpers
// ---------------------------------------------------------------------------

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
