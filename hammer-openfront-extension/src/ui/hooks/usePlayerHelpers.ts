import { useStore } from "@store/index";
import {
  readMyPlayer,
  getTeammates,
  getAllies,
} from "@shared/logic/player-helpers";

export function useMyPlayer() {
  const lastPlayers = useStore((s) => s.lastPlayers);
  const playersById = useStore((s) => s.playersById);
  const currentClientID = useStore((s) => s.currentClientID);
  const mySmallID = useStore((s) => s.mySmallID);
  return readMyPlayer(lastPlayers, playersById, currentClientID, mySmallID);
}

export function useTeammates() {
  const playersById = useStore((s) => s.playersById);
  const lastPlayers = useStore((s) => s.lastPlayers);
  const currentClientID = useStore((s) => s.currentClientID);
  const mySmallID = useStore((s) => s.mySmallID);
  const me = readMyPlayer(lastPlayers, playersById, currentClientID, mySmallID);
  return getTeammates(playersById, me);
}

export function useAllies() {
  const playersById = useStore((s) => s.playersById);
  const lastPlayers = useStore((s) => s.lastPlayers);
  const currentClientID = useStore((s) => s.currentClientID);
  const mySmallID = useStore((s) => s.mySmallID);
  const myAllies = useStore((s) => s.myAllies);
  const me = readMyPlayer(lastPlayers, playersById, currentClientID, mySmallID);
  return getAllies(playersById, me, myAllies);
}
