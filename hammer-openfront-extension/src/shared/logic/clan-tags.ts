/**
 * clan-tags.ts — Parse clan tags from player names and group by tag.
 *
 * OpenFront players use [TAG] prefix format: "[MARS] Hammer", "[THT] Quelos"
 * This utility extracts tags and groups players for bulk selection.
 */

import type { PlayerData } from "../types";

/** Extract clan tag from a player name. Returns null if no tag found. */
export function parseClanTag(name: string): string | null {
  const match = name.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
}

export interface ClanGroup {
  tag: string;
  players: PlayerData[];
}

/**
 * Group players by clan tag. Returns ALL clan tags (any size).
 * Sorted by group size (largest first), then alphabetically.
 */
export function groupByClanTag(players: PlayerData[]): ClanGroup[] {
  const map = new Map<string, PlayerData[]>();

  for (const p of players) {
    const name = p.displayName || p.name || "";
    const tag = parseClanTag(name);
    if (!tag) continue;
    const list = map.get(tag);
    if (list) list.push(p);
    else map.set(tag, [p]);
  }

  return [...map.entries()]
    .map(([tag, players]) => ({ tag, players }))
    .sort((a, b) => b.players.length - a.players.length || a.tag.localeCompare(b.tag));
}

export interface SplitGroups {
  /** Clans with 2+ members — shown as individual chips */
  multi: ClanGroup[];
  /** Players whose clan tag has only 1 member in this list */
  solo: PlayerData[];
  /** Players with no [TAG] prefix at all */
  untagged: PlayerData[];
}

/**
 * Split players into three buckets for tiered selection UI:
 *   - multi:   clans with 2+ members (each gets its own chip)
 *   - solo:    one-member-clan players (lumped into a "Solo Clans" chip)
 *   - untagged: players with no [TAG] (lumped into a "No Tag" chip)
 */
export function splitClanGroups(players: PlayerData[]): SplitGroups {
  const all = groupByClanTag(players);
  const multi: ClanGroup[] = [];
  const solo: PlayerData[] = [];
  const untagged: PlayerData[] = [];

  for (const p of players) {
    const name = p.displayName || p.name || "";
    if (!parseClanTag(name)) untagged.push(p);
  }
  for (const g of all) {
    if (g.players.length >= 2) multi.push(g);
    else solo.push(...g.players);
  }

  return { multi, solo, untagged };
}

export interface TeamGroup {
  team: any;
  players: PlayerData[];
}

/**
 * Group players by team. Only returns groups with 1+ members.
 * Sorted by group size (largest first).
 */
export function groupByTeam(players: PlayerData[]): TeamGroup[] {
  const map = new Map<any, PlayerData[]>();

  for (const p of players) {
    if (p.team == null) continue;
    const list = map.get(p.team);
    if (list) list.push(p);
    else map.set(p.team, [p]);
  }

  return [...map.entries()]
    .map(([team, players]) => ({ team, players }))
    .sort((a, b) => b.players.length - a.players.length);
}
