import type { StateCreator } from "zustand";
import type { PlayerData } from "@shared/types";

export interface PlayerSummary {
  count: number;
  names: string[];
  myName: string | null;
}

export interface PlayerSlice {
  playersById: Map<string, PlayerData>;
  playersBySmallId: Map<number, PlayerData>;
  lastPlayers: PlayerData[];
  mySmallID: number | null;
  myTeam: number | null;
  myAllies: Set<number>;
  currentClientID: string | null;
  playerDataReady: boolean;
  playerSummary: PlayerSummary;

  setPlayers: (
    byId: Map<string, PlayerData>,
    bySmallId: Map<number, PlayerData>,
    list: PlayerData[],
  ) => void;
  setMyIdentity: (smallID: number, team: number | null) => void;
  updateAllies: (allies: Set<number>) => void;
  setCurrentClientID: (clientID: string | null) => void;
  markPlayerDataReady: () => void;
}

export const createPlayerSlice: StateCreator<PlayerSlice, [], [], PlayerSlice> = (set) => ({
  playersById: new Map(),
  playersBySmallId: new Map(),
  lastPlayers: [],
  mySmallID: null,
  myTeam: null,
  myAllies: new Set(),
  currentClientID: null,
  playerDataReady: false,
  playerSummary: { count: 0, names: [], myName: null },

  setPlayers: (byId, bySmallId, list) =>
    set((s) => {
      const names = list
        .map((p) => p.displayName || p.name || "")
        .filter(Boolean);

      let myName: string | null = null;
      if (s.mySmallID != null) {
        const me = bySmallId.get(s.mySmallID);
        if (me) myName = me.displayName || me.name || null;
      }

      return {
        playersById: byId,
        playersBySmallId: bySmallId,
        lastPlayers: list,
        playerSummary: { count: list.length, names, myName },
      };
    }),

  setMyIdentity: (smallID, team) => set({ mySmallID: smallID, myTeam: team }),

  updateAllies: (allies) => set({ myAllies: allies }),

  setCurrentClientID: (clientID) => set({ currentClientID: clientID }),

  markPlayerDataReady: () => set({ playerDataReady: true }),
});
