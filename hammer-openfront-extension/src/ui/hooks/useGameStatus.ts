import { useStore } from "@store/index";

export function useGameStatus() {
  const playerDataReady = useStore((s) => s.playerDataReady);
  const currentClientID = useStore((s) => s.currentClientID);
  const playerCount = useStore((s) => s.playerSummary.count);
  return { playerDataReady, connected: !!currentClientID, playerCount };
}
