import { useStore } from "@store/index";
import type { PlayerData } from "@shared/types";

export interface MatchExport {
  version: "1.0";
  exportedAt: number;
  session: {
    startedAt: number;
    durationMs: number;
  };
  players: Array<{
    smallID: number;
    name: string;
    displayName: string;
    team: number;
    isAlive: boolean;
  }>;
  mySmallID: number | null;
  myTeam: number | null;
  transfers: Array<{
    ts: number;
    type: string;
    senderName: string;
    receiverName: string;
    amount: number;
  }>;
  flowGraph: Record<string, {
    sender: string;
    receiver: string;
    gold: number;
    troops: number;
    goldCount: number;
    troopsCount: number;
  }>;
  playerTotals: Record<string, {
    sentGold: number;
    sentTroops: number;
    recvGold: number;
    recvTroops: number;
    sentCount: number;
    recvCount: number;
  }>;
  feedIn: Array<{
    name: string;
    type: string;
    amount: number;
    ts: number;
    isPort?: boolean;
  }>;
  feedOut: Array<{
    name: string;
    type: string;
    amount: number;
    ts: number;
  }>;
}

export function exportMatchData(): void {
  const s = useStore.getState();

  const transfers = s.ciaState.transfers.map((t) => ({
    ts: t.ts,
    type: t.type,
    senderName: t.senderName,
    receiverName: t.receiverName,
    amount: t.amount,
  }));

  const flowGraph: MatchExport["flowGraph"] = {};
  s.ciaState.flowGraph.forEach((entry, key) => {
    flowGraph[key] = {
      sender: entry.sender,
      receiver: entry.receiver,
      gold: entry.gold,
      troops: entry.troops,
      goldCount: entry.goldCount,
      troopsCount: entry.troopsCount,
    };
  });

  const playerTotals: MatchExport["playerTotals"] = {};
  s.ciaState.playerTotals.forEach((total, name) => {
    playerTotals[name] = {
      sentGold: total.sentGold,
      sentTroops: total.sentTroops,
      recvGold: total.recvGold,
      recvTroops: total.recvTroops,
      sentCount: total.sentCount,
      recvCount: total.recvCount,
    };
  });

  const players = s.lastPlayers.map((p: PlayerData) => ({
    smallID: p.smallID ?? 0,
    name: p.name ?? "",
    displayName: p.displayName ?? p.name ?? "",
    team: p.team ?? 0,
    isAlive: p.isAlive,
  }));

  const startedAt =
    transfers.length > 0
      ? Math.min(...transfers.map((t) => t.ts))
      : Date.now();

  const payload: MatchExport = {
    version: "1.0",
    exportedAt: Date.now(),
    session: {
      startedAt,
      durationMs: Date.now() - startedAt,
    },
    players,
    mySmallID: s.mySmallID ?? null,
    myTeam: s.myTeam ?? null,
    transfers,
    flowGraph,
    playerTotals,
    feedIn: s.feedIn.map((e) => ({
      name: e.name,
      type: e.type,
      amount: e.amount,
      ts: e.ts,
      ...(e.isPort ? { isPort: true } : {}),
    })),
    feedOut: s.feedOut.map((e) => ({
      name: e.name,
      type: e.type,
      amount: e.amount,
      ts: e.ts,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hammer-match-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
