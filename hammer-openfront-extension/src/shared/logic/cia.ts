import type { CIAState, PlayerData } from "../types";
import { MessageType, CIA_BIG_GOLD_THRESHOLD, CIA_BIG_TROOPS_THRESHOLD, CIA_MAX_TRANSFERS, CIA_MAX_ALERTS } from "../constants";
import { num, short, parseAmt } from "../utils";
import { findPlayerByName, asIsAlly } from "./player-helpers";

export function createCIAState(): CIAState {
  return {
    transfers: [],
    flowGraph: new Map(),
    playerTotals: new Map(),
    alerts: [],
    seen: new Set(),
  };
}

/**
 * Pure CIA event tracking logic, extracted from trackCIAEvent().
 * Returns true if the event was tracked (not deduped/filtered).
 */
export function trackCIAEvent(
  cia: CIAState,
  mt: number,
  pid: number,
  params: { name?: string; troops?: unknown; gold?: unknown },
  msg: { goldAmount?: unknown },
  playersBySmallId: Map<number, PlayerData>,
  // For betrayal detection:
  mySmallID: number | null,
  myTeam: number | null,
  playersById: Map<string, PlayerData>,
  myAllies: Set<number>,
): boolean {
  const actorPlayer = playersBySmallId.get(pid);
  const actorName = actorPlayer
    ? actorPlayer.displayName || actorPlayer.name || `PID:${pid}`
    : `PID:${pid}`;
  const otherName = params.name || "Unknown";
  const now = Date.now();

  let type: string | null = null;
  let dir: string | null = null;
  let amount = 0;
  let senderName: string | null = null;
  let receiverName: string | null = null;

  if (mt === MessageType.SENT_TROOPS_TO_PLAYER) {
    type = "troops"; dir = "sent"; amount = parseAmt(params.troops);
    senderName = actorName; receiverName = otherName;
  } else if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
    type = "troops"; dir = "received"; amount = parseAmt(params.troops);
    senderName = otherName; receiverName = actorName;
  } else if (mt === MessageType.SENT_GOLD_TO_PLAYER) {
    type = "gold"; dir = "sent";
    amount = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold);
    senderName = actorName; receiverName = otherName;
  } else if (mt === MessageType.RECEIVED_GOLD_FROM_PLAYER) {
    type = "gold"; dir = "received";
    amount = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold);
    senderName = otherName; receiverName = actorName;
  } else if (mt === MessageType.RECEIVED_GOLD_FROM_TRADE) {
    type = "port"; dir = "received";
    amount = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold);
    senderName = otherName; receiverName = actorName;
  }

  if (!type || amount <= 0) return false;

  // Only count SENT events for flow/totals
  if (mt === MessageType.RECEIVED_GOLD_FROM_PLAYER) return false;
  if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) return false;

  // Dedup
  const dedupKey = `${type}:${senderName}:${receiverName}:${amount}:${Math.floor(now / 10000)}`;
  if (cia.seen.has(dedupKey)) return false;
  cia.seen.add(dedupKey);

  // Record transfer
  cia.transfers.push({
    ts: now, type, dir: dir!, actorPID: pid, actorName, otherName,
    senderName: senderName!, receiverName: receiverName!, amount,
  });
  if (cia.transfers.length > CIA_MAX_TRANSFERS) cia.transfers.shift();

  // Update flow graph (skip port trades)
  if (type !== "port" && senderName && receiverName) {
    const flowKey = `${senderName}\u2192${receiverName}`;
    if (!cia.flowGraph.has(flowKey)) {
      cia.flowGraph.set(flowKey, {
        gold: 0, troops: 0, goldCount: 0, troopsCount: 0, lastTs: 0,
        sender: senderName, receiver: receiverName,
      });
    }
    const flow = cia.flowGraph.get(flowKey)!;
    if (type === "gold") { flow.gold += amount; flow.goldCount++; }
    else { flow.troops += amount; flow.troopsCount++; }
    flow.lastTs = now;

    // Update player totals
    for (const name of [senderName, receiverName]) {
      if (!cia.playerTotals.has(name)) {
        cia.playerTotals.set(name, {
          sentGold: 0, sentTroops: 0, recvGold: 0, recvTroops: 0, sentCount: 0, recvCount: 0,
        });
      }
    }
    const senderTotals = cia.playerTotals.get(senderName)!;
    const receiverTotals = cia.playerTotals.get(receiverName)!;
    if (type === "gold") { senderTotals.sentGold += amount; receiverTotals.recvGold += amount; }
    else { senderTotals.sentTroops += amount; receiverTotals.recvTroops += amount; }
    senderTotals.sentCount++;
    receiverTotals.recvCount++;

    // Alerts
    if (type === "gold" && amount >= CIA_BIG_GOLD_THRESHOLD) {
      cia.alerts.push({ ts: now, level: "big", message: `${senderName} sent ${short(amount)} gold to ${receiverName}` });
    }
    if (type === "troops" && amount >= CIA_BIG_TROOPS_THRESHOLD) {
      cia.alerts.push({ ts: now, level: "big", message: `${senderName} sent ${short(amount)} troops to ${receiverName}` });
    }

    // Betrayal detection
    if (mySmallID != null) {
      const senderPlayer = findPlayerByName(senderName, playersById);
      const receiverPlayer = findPlayerByName(receiverName, playersById);
      if (senderPlayer && receiverPlayer && myTeam != null) {
        const senderIsTeammate = senderPlayer.team != null && senderPlayer.team === myTeam;
        const receiverIsAlly = asIsAlly(receiverPlayer.id, playersById, myTeam, myAllies);
        if (senderIsTeammate && !receiverIsAlly && receiverPlayer.team !== myTeam) {
          cia.alerts.push({
            ts: now, level: "betrayal",
            message: `Your teammate ${senderName} is feeding enemy ${receiverName}!`,
          });
        }
      }
    }

    if (cia.alerts.length > CIA_MAX_ALERTS) cia.alerts.shift();
  }

  return true;
}
