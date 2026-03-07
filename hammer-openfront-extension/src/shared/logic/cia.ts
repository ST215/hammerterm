import type { CIAState, PlayerData, CIARollingRates, CIAPlayerRelationship, CIAAlertV2, AlertSeverity, AlertCategory, CIATransfer, CIAPlayerTotal } from "../types";
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

// --- Rolling window computations ---

export function computeRollingRates(
  transfers: CIATransfer[],
  windowMs: number,
  myName: string,
): CIARollingRates {
  const cutoff = Date.now() - windowMs;
  let goldIn = 0, goldOut = 0, troopsIn = 0, troopsOut = 0, count = 0;
  for (const t of transfers) {
    if (t.ts < cutoff || t.type === "port") continue;
    count++;
    if (t.receiverName === myName) {
      if (t.type === "gold") goldIn += t.amount;
      else troopsIn += t.amount;
    }
    if (t.senderName === myName) {
      if (t.type === "gold") goldOut += t.amount;
      else troopsOut += t.amount;
    }
  }
  return { windowMs, goldIn, goldOut, troopsIn, troopsOut, transferCount: count };
}

export function computeRelationships(
  transfers: CIATransfer[],
  playerTotals: Map<string, CIAPlayerTotal>,
  playersById: Map<string, PlayerData>,
  myTeam: number | null,
  myAllies: Set<number>,
  windowMs: number,
): CIAPlayerRelationship[] {
  const cutoff = Date.now() - windowMs;

  // Build name→PlayerData lookup
  const playerByName = new Map<string, PlayerData>();
  for (const p of playersById.values()) {
    const name = p.displayName || p.name || "";
    if (name) playerByName.set(name, p);
  }

  // Recent per-player accumulation
  const recent = new Map<string, { goldSent: number; goldRecv: number; troopsSent: number; troopsRecv: number; lastTs: number }>();
  for (const t of transfers) {
    if (t.ts < cutoff || t.type === "port") continue;
    for (const name of [t.senderName, t.receiverName]) {
      if (!recent.has(name)) recent.set(name, { goldSent: 0, goldRecv: 0, troopsSent: 0, troopsRecv: 0, lastTs: 0 });
    }
    const sr = recent.get(t.senderName)!;
    const rr = recent.get(t.receiverName)!;
    if (t.type === "gold") { sr.goldSent += t.amount; rr.goldRecv += t.amount; }
    else { sr.troopsSent += t.amount; rr.troopsRecv += t.amount; }
    sr.lastTs = Math.max(sr.lastTs, t.ts);
    rr.lastTs = Math.max(rr.lastTs, t.ts);
  }

  // Check who sends to non-ally/non-team (with gold/troops breakdown)
  const feedsNonAllyMap = new Map<string, { receivers: Map<string, { gold: number; troops: number }> }>();
  for (const t of transfers) {
    if (t.type === "port") continue;
    const receiverPlayer = playerByName.get(t.receiverName);
    if (!receiverPlayer) continue;
    const receiverIsTeam = receiverPlayer.team != null && myTeam != null && receiverPlayer.team === myTeam;
    const receiverIsAlly = receiverPlayer.smallID != null && myAllies.has(receiverPlayer.smallID);
    if (!receiverIsTeam && !receiverIsAlly) {
      if (!feedsNonAllyMap.has(t.senderName)) {
        feedsNonAllyMap.set(t.senderName, { receivers: new Map() });
      }
      const entry = feedsNonAllyMap.get(t.senderName)!;
      if (!entry.receivers.has(t.receiverName)) {
        entry.receivers.set(t.receiverName, { gold: 0, troops: 0 });
      }
      const recv = entry.receivers.get(t.receiverName)!;
      if (t.type === "gold") recv.gold += t.amount;
      else recv.troops += t.amount;
    }
  }

  // Build relationship list
  const result: CIAPlayerRelationship[] = [];
  const allNames = new Set([...playerTotals.keys(), ...recent.keys()]);

  for (const name of allNames) {
    const player = playerByName.get(name);
    const lt = playerTotals.get(name);
    const rc = recent.get(name);
    const isTeammate = player?.team != null && myTeam != null && player.team === myTeam;
    const isAlly = player?.smallID != null && myAllies.has(player.smallID);

    // Build feeding non-ally detail with gold/troops breakdown
    let feedsNonAllyDetail: string | null = null;
    const fnaEntry = feedsNonAllyMap.get(name);
    if (fnaEntry) {
      const parts: string[] = [];
      for (const [recvName, amounts] of fnaEntry.receivers) {
        const amtParts: string[] = [];
        if (amounts.gold > 0) amtParts.push(`${short(amounts.gold)}g`);
        if (amounts.troops > 0) amtParts.push(`${short(amounts.troops)}t`);
        parts.push(`${recvName} (${amtParts.join("+")})`);
      }
      feedsNonAllyDetail = parts.join(", ");
    }

    result.push({
      playerId: player?.id ?? "",
      name,
      team: player?.team ?? null,
      isTeammate,
      isAlly,
      recentGoldSent: rc?.goldSent ?? 0,
      recentGoldRecv: rc?.goldRecv ?? 0,
      recentTroopsSent: rc?.troopsSent ?? 0,
      recentTroopsRecv: rc?.troopsRecv ?? 0,
      lifetimeGoldSent: lt?.sentGold ?? 0,
      lifetimeGoldRecv: lt?.recvGold ?? 0,
      lifetimeTroopsSent: lt?.sentTroops ?? 0,
      lifetimeTroopsRecv: lt?.recvTroops ?? 0,
      lastActivity: rc?.lastTs ?? 0,
      feedsNonAlly: fnaEntry != null,
      feedsNonAllyDetail,
    });
  }

  result.sort((a, b) => {
    const aTotal = a.recentGoldSent + a.recentGoldRecv + a.recentTroopsSent + a.recentTroopsRecv;
    const bTotal = b.recentGoldSent + b.recentGoldRecv + b.recentTroopsSent + b.recentTroopsRecv;
    return bTotal - aTotal;
  });

  return result;
}

export function classifyAlerts(
  transfers: CIATransfer[],
  playersById: Map<string, PlayerData>,
  myTeam: number | null,
  myAllies: Set<number>,
): CIAAlertV2[] {
  const playerByName = new Map<string, PlayerData>();
  for (const p of playersById.values()) {
    const name = p.displayName || p.name || "";
    if (name) playerByName.set(name, p);
  }

  const alerts: CIAAlertV2[] = [];
  const seen = new Set<string>();

  for (const t of transfers) {
    if (t.type === "port") continue;

    const senderPlayer = playerByName.get(t.senderName);
    const receiverPlayer = playerByName.get(t.receiverName);

    // Critical: teammate sending to known enemy
    if (senderPlayer && receiverPlayer && myTeam != null) {
      const senderIsTeammate = senderPlayer.team != null && senderPlayer.team === myTeam;
      const receiverIsTeam = receiverPlayer.team != null && receiverPlayer.team === myTeam;
      const receiverIsAlly = receiverPlayer.smallID != null && myAllies.has(receiverPlayer.smallID);

      if (senderIsTeammate && !receiverIsTeam && !receiverIsAlly) {
        const key = `critical:${t.senderName}:${t.receiverName}:${t.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          alerts.push({
            ts: t.ts,
            severity: "critical",
            category: "threat",
            title: `${t.senderName} feeding enemy ${t.type}`,
            detail: `${short(t.amount)} ${t.type} to ${t.receiverName}`,
            playerNames: [t.senderName, t.receiverName],
          });
        }
      }
    }

    // Warning: any player sending to non-ally/non-team
    if (receiverPlayer && myTeam != null) {
      const receiverIsTeam = receiverPlayer.team != null && receiverPlayer.team === myTeam;
      const receiverIsAlly = receiverPlayer.smallID != null && myAllies.has(receiverPlayer.smallID);
      const senderIsTeam = senderPlayer?.team != null && senderPlayer.team === myTeam;

      if (!senderIsTeam && !receiverIsTeam && !receiverIsAlly) {
        const key = `warn:${t.senderName}:${t.receiverName}:${t.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          alerts.push({
            ts: t.ts,
            severity: "warning",
            category: "relationship",
            title: `${t.senderName} sends ${t.type} to non-ally`,
            detail: `${short(t.amount)} ${t.type} to ${t.receiverName}`,
            playerNames: [t.senderName, t.receiverName],
          });
        }
      }
    }

    // Info: large transfer
    const isLarge = (t.type === "gold" && t.amount >= CIA_BIG_GOLD_THRESHOLD) ||
      (t.type === "troops" && t.amount >= CIA_BIG_TROOPS_THRESHOLD);
    if (isLarge) {
      alerts.push({
        ts: t.ts,
        severity: "info",
        category: "economy",
        title: `Large ${t.type} transfer`,
        detail: `${t.senderName} sent ${short(t.amount)} ${t.type} to ${t.receiverName}`,
        playerNames: [t.senderName, t.receiverName],
      });
    }
  }

  alerts.sort((a, b) => b.ts - a.ts);
  return alerts;
}
