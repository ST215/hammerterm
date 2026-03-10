/**
 * Shared target resolution logic for auto-troops and auto-gold engines.
 */

import {
  getTeammates,
  getAllies,
  readMyPlayer,
} from "./player-helpers";
import type { PlayerData } from "./state";

export interface ResolvedTarget {
  id: string;
  name: string;
}

export interface AutoSendState {
  allTeamMode: boolean;
  allAlliesMode: boolean;
  manualTargets: Array<{ id: string; name: string }>;
  lastPlayers: PlayerData[];
  playersById: Map<string, PlayerData>;
  currentClientID: string | null;
  mySmallID: number | null;
  myAllies: Set<number>;
}

/**
 * Resolve auto-send targets based on mode (AllTeam / AllAllies / manual list).
 * Used by both auto-troops and auto-gold engines.
 */
export function resolveAutoSendTargets(state: AutoSendState): ResolvedTarget[] {
  if (state.allTeamMode || state.allAlliesMode) {
    const result: ResolvedTarget[] = [];
    const ids = new Set<string>();

    const me = readMyPlayer(
      state.lastPlayers,
      state.playersById,
      state.currentClientID,
      state.mySmallID,
    );

    if (state.allTeamMode) {
      for (const p of getTeammates(state.playersById, me)) {
        result.push({ id: p.id, name: p.displayName || p.name || "" });
        ids.add(p.id);
      }
    }
    if (state.allAlliesMode) {
      for (const p of getAllies(state.playersById, me, state.myAllies)) {
        if (!ids.has(p.id)) {
          result.push({ id: p.id, name: p.displayName || p.name || "" });
        }
      }
    }
    return result;
  }

  return state.manualTargets.map((tgt) => ({ id: tgt.id, name: tgt.name }));
}
