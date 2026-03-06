/**
 * Pure functions extracted from hammer-scripts/hammer.js for testing.
 *
 * These are verbatim copies of the IIFE-scoped functions that have no
 * DOM or game-engine dependencies.  During the TypeScript refactor they
 * will become the canonical source; until then the copies here act as
 * the contract the refactored modules must satisfy.
 */

// ===== CONSTANTS =====
export const TROOP_DISPLAY_DIV = 10;

export const MessageType = {
  SENT_GOLD_TO_PLAYER: 18,
  RECEIVED_GOLD_FROM_PLAYER: 19,
  RECEIVED_GOLD_FROM_TRADE: 20,
  SENT_TROOPS_TO_PLAYER: 21,
  RECEIVED_TROOPS_FROM_PLAYER: 22,
} as const;

export const GameUpdateType = {
  Tile: 0,
  Unit: 1,
  Player: 2,
  DisplayEvent: 3,
  DisplayChatEvent: 4,
  AllianceRequest: 5,
  AllianceRequestReply: 6,
  BrokeAlliance: 7,
  AllianceExpired: 8,
  AllianceExtension: 9,
  TargetPlayer: 10,
  Emoji: 11,
  Win: 12,
  Hash: 13,
  UnitIncoming: 14,
  BonusEvent: 15,
  RailroadEvent: 16,
  ConquestEvent: 17,
  EmbargoEvent: 18,
} as const;

export const CITY_TROOP_INCREASE = 250_000;

export const CIA_BIG_GOLD_THRESHOLD = 500_000;
export const CIA_BIG_TROOPS_THRESHOLD = 500_000;
export const CIA_MAX_TRANSFERS = 2000;
export const CIA_MAX_ALERTS = 200;

export const SIZES = [
  { w: 520, h: 420, bodyH: 372, label: "S" },
  { w: 750, h: 580, bodyH: 532, label: "M" },
  { w: 1000, h: 720, bodyH: 672, label: "L" },
];

export const RECIPROCATE_COOLDOWN_MS = 10_000;

// ===== UTILITY FUNCTIONS =====

export const dTroops = (v: unknown): number => Number(v || 0) / TROOP_DISPLAY_DIV;

export const num = (v: unknown): number => Number(v) || 0;

export const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m: string) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] ?? m,
  );

export const short = (v: unknown): string => {
  let n = Math.abs(num(v));
  if (n >= 1e6) return Math.round(n / 1e5) / 10 + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(Math.round(n));
};

export const comma = (v: unknown): string =>
  Math.round(Math.abs(num(v))).toLocaleString();

export const fullNum = (v: unknown): string => {
  const n = Math.abs(num(v));
  const c = comma(n);
  return n >= 1e3 ? `${c} (${short(n)})` : c;
};

export const fmtSec = (sec: number): string => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const fmtDuration = (ms: number): string => {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  if (hrs > 0) return `${hrs}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
};

export function parseAmt(str: unknown): number {
  if (!str) return 0;
  const clean = String(str).replace(/,/g, "");
  const m = clean.match(/([\d.]+)([KkMm])?/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  if (m[2]) v *= m[2].toUpperCase() === "M" ? 1e6 : 1e3;
  return Math.round(v);
}

// ===== STATE HELPERS =====

export interface DonationRecord {
  gold: number;
  troops: number;
  count: number;
  goldSends: number;
  troopsSends: number;
  last: Date | null;
  lastDonorTroops: number;
}

export function bump(map: Map<string, DonationRecord>, key: string): DonationRecord {
  if (!map.has(key))
    map.set(key, {
      gold: 0,
      troops: 0,
      count: 0,
      goldSends: 0,
      troopsSends: 0,
      last: null,
      lastDonorTroops: 0,
    });
  return map.get(key)!;
}

export interface PortRecord {
  totalGold: number;
  times: number[];
  avgIntSec: number;
  lastIntSec: number;
  gpm: number;
}

export function bumpPorts(ports: Map<string, PortRecord>, playerId: string, gold: number, t: number): void {
  if (!ports.has(playerId))
    ports.set(playerId, { totalGold: 0, times: [], avgIntSec: 0, lastIntSec: 0, gpm: 0 });
  const p = ports.get(playerId)!;
  p.totalGold += gold;
  p.times.push(t);
  if (p.times.length > 60) p.times.shift();
  if (p.times.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < p.times.length; i++) diffs.push((p.times[i] - p.times[i - 1]) / 1000);
    const sum = diffs.reduce((a, b) => a + b, 0);
    p.avgIntSec = Math.round(sum / diffs.length);
    p.lastIntSec = Math.round(diffs[diffs.length - 1]);
    p.gpm = Math.round(p.totalGold / (sum / 60 || 0.0001));
  }
}

// ===== CITY / TROOP CALCULATIONS =====

export function addToOwnerSum(
  cityLevelSumByOwner: Map<number, number>,
  ownerID: number,
  deltaLevel: number,
): void {
  if (typeof ownerID !== "number") return;
  const prev = cityLevelSumByOwner.get(ownerID) || 0;
  cityLevelSumByOwner.set(ownerID, prev + deltaLevel);
}

export interface CityRecord {
  ownerID: number;
  level: number;
}

export function upsertCity(
  cityById: Map<string, CityRecord>,
  cityLevelSumByOwner: Map<number, number>,
  u: { id: unknown; level?: unknown; ownerID?: unknown; isActive?: boolean },
): void {
  const idKey = String(u.id);
  const newLevel = num(u.level);
  const newOwner = num(u.ownerID);
  const prev = cityById.get(idKey);
  if (u.isActive === false) {
    if (prev) {
      addToOwnerSum(cityLevelSumByOwner, prev.ownerID, -prev.level);
      cityById.delete(idKey);
    }
    return;
  }
  if (prev) {
    if (prev.ownerID !== newOwner) {
      addToOwnerSum(cityLevelSumByOwner, prev.ownerID, -prev.level);
      addToOwnerSum(cityLevelSumByOwner, newOwner, newLevel);
    } else if (prev.level !== newLevel) {
      addToOwnerSum(cityLevelSumByOwner, newOwner, newLevel - prev.level);
    }
  } else {
    addToOwnerSum(cityLevelSumByOwner, newOwner, newLevel);
  }
  cityById.set(idKey, { ownerID: newOwner, level: newLevel });
}

export function estimateMaxTroops(
  tilesOwned: number,
  smallID: number,
  cityLevelSumByOwner: Map<number, number>,
): number {
  const tiles = Math.max(0, num(tilesOwned));
  const base = 2 * (Math.pow(tiles, 0.6) * 1000 + 50000);
  const cityLevels = cityLevelSumByOwner.get(num(smallID)) || 0;
  return Math.max(0, Math.floor(base + cityLevels * CITY_TROOP_INCREASE));
}

// ===== PLAYER LOOKUP =====

export interface PlayerData {
  id: string;
  smallID: number | null;
  clientID: string | null;
  name?: string;
  displayName?: string;
  isAlive: boolean;
  team: number | null;
  troops: number;
  gold: number | bigint;
  tilesOwned?: number;
  allies?: number[];
}

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

// ===== LOGGER =====

export const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
export const LEVEL_NAMES = ["debug", "info", "warn", "error"] as const;
export const CONSOLE_LEVEL_MAP: Record<string, number> = { debug: 0, log: 1, info: 1, warn: 2, error: 3 };

export function extractCategory(args: unknown[]): string | null {
  if (args.length > 0 && typeof args[0] === "string") {
    const match = (args[0] as string).match(/\[([^\]]+)\]/);
    return match ? match[1] : null;
  }
  return null;
}

export function serializeValue(value: unknown): unknown {
  try {
    if (value instanceof Error) {
      return { type: "Error", message: value.message, stack: value.stack, name: value.name };
    } else if (typeof value === "object" && value !== null) {
      try {
        JSON.stringify(value);
        return value;
      } catch {
        return "[Circular]";
      }
    }
    return value;
  } catch {
    return "[SerializationError]";
  }
}

export interface LogEntry {
  level: string;
  args: unknown[];
  timestamp: string;
  category?: string | null;
}

export function createLogBuffer(maxEntries: number = 1000) {
  let minLogLevel = LOG_LEVELS.DEBUG;
  const logBuffer: LogEntry[] = [];
  let logIndex = 0;

  function addLog(entry: LogEntry): void {
    const entryLevel = CONSOLE_LEVEL_MAP[entry.level] || LOG_LEVELS.INFO;
    if (entryLevel < minLogLevel) return;
    entry.category = extractCategory(entry.args);
    if (logBuffer.length < maxEntries) {
      logBuffer.push(entry);
    } else {
      logBuffer[logIndex % maxEntries] = entry;
      logIndex++;
    }
  }

  function exportLogs(options: { limit?: number; level?: string | null; minLevel?: string | null } = {}) {
    const { limit = 100, level = null, minLevel = null } = options;
    let logs = logBuffer.slice();
    if (level) logs = logs.filter((log) => log.level === level);
    if (minLevel) {
      const minLevelNum = LOG_LEVELS[minLevel.toUpperCase() as keyof typeof LOG_LEVELS] || 0;
      logs = logs.filter((log) => (CONSOLE_LEVEL_MAP[log.level] || 0) >= minLevelNum);
    }
    logs = logs.slice(-limit);
    return {
      totalLogs: logBuffer.length,
      exportedLogs: logs.length,
      logs,
    };
  }

  function setMinLevel(level: number) {
    minLogLevel = level;
  }

  return { addLog, exportLogs, getBuffer: () => logBuffer, setMinLevel };
}

// ===== CIA TRACKING (pure logic) =====

export interface CIATransfer {
  ts: number;
  type: string;
  dir: string;
  actorPID: number;
  actorName: string;
  otherName: string;
  senderName: string;
  receiverName: string;
  amount: number;
}

export interface CIAFlowEntry {
  gold: number;
  troops: number;
  goldCount: number;
  troopsCount: number;
  lastTs: number;
  sender: string;
  receiver: string;
}

export interface CIAPlayerTotal {
  sentGold: number;
  sentTroops: number;
  recvGold: number;
  recvTroops: number;
  sentCount: number;
  recvCount: number;
}

export interface CIAAlert {
  ts: number;
  level: string;
  message: string;
}

export interface CIAState {
  transfers: CIATransfer[];
  flowGraph: Map<string, CIAFlowEntry>;
  playerTotals: Map<string, CIAPlayerTotal>;
  alerts: CIAAlert[];
  seen: Set<string>;
}

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
    ts: now, type, dir, actorPID: pid, actorName, otherName,
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
