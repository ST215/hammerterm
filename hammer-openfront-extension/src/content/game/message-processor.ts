/**
 * message-processor.ts — Processes DisplayEvent messages from the game.
 *
 * Ported from processDisplayMessage() in hammer.js.
 * Routes donation events (gold/troops sent/received) to the Zustand store
 * and triggers reciprocation when enabled.
 */

import { useStore } from "@store/index";
import { MessageType } from "@shared/constants";
import { parseAmt, num } from "@shared/utils";
import { trackCIAEvent } from "@shared/logic/cia";
import { findPlayer } from "@shared/logic/player-helpers";

// ---------- Module-level state ----------

const pendingMessages: unknown[] = [];

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- Main processor ----------

export function processDisplayMessage(msg: unknown): void {
  const raw = msg as Record<string, unknown> | null;
  if (!raw || typeof raw.messageType !== "number") {
    return;
  }

  // Push to raw messages ring buffer (for diagnostics)
  const store = useStore.getState();
  store.addRawMessage(raw);

  // If extension is paused, drop the message
  if (store.paused) {
    return;
  }

  // Buffer messages until player data is ready
  if (!store.playerDataReady) {
    pendingMessages.push(raw);
    return;
  }

  const mt = raw.messageType as number;
  const pid = (raw.playerID ?? -1) as number;
  const params = (raw.params || {}) as Record<string, unknown>;

  // CIA: Track ALL transfers server-wide (before self-filter)
  const { ciaState, playersBySmallId, mySmallID, myTeam, playersById, myAllies } = useStore.getState();
  trackCIAEvent(ciaState, mt, pid, params as { name?: string; troops?: unknown; gold?: unknown }, raw as { goldAmount?: unknown }, playersBySmallId, mySmallID, myTeam, playersById, myAllies);

  // Only process messages directed at us
  if (pid !== mySmallID) {
    return;
  }

  // Deduplication with 1-second granularity
  const timestamp = Math.floor(Date.now() / 1000);
  const key = `${mt}:${(params.name as string) || ""}:${params.troops || params.gold || ""}:${timestamp}`;
  const { seen } = useStore.getState();
  if (seen.has(key)) {
    return;
  }
  seen.add(key);

  // Route by message type
  if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
    handleReceivedTroops(params, raw);
  } else if (mt === MessageType.SENT_TROOPS_TO_PLAYER) {
    handleSentTroops(params);
  } else if (mt === MessageType.RECEIVED_GOLD_FROM_TRADE) {
    handleReceivedGoldTrade(params, raw);
  } else if (mt === MessageType.RECEIVED_GOLD_FROM_PLAYER) {
    handleReceivedGold(params, raw);
  } else if (mt === MessageType.SENT_GOLD_TO_PLAYER) {
    handleSentGold(params, raw);
  }
}

// ---------- Message-type handlers ----------

function handleReceivedTroops(
  params: Record<string, unknown>,
  _raw: Record<string, unknown>,
): void {
  const name = params.name as string | undefined;
  const amt = parseAmt(params.troops);
  if (!name || amt <= 0) return;

  const { playersById } = useStore.getState();
  const from = findPlayer(name, playersById);
  if (!from) return;

  const donorPlayer = playersById.get(from.id);
  const donorTroopSnapshot = donorPlayer ? Number(donorPlayer.troops || 0) : 0;

  // Update inbound donations
  useStore.getState().recordInbound(from.id, "troops", amt);

  log("[RECEIVED] Troops from", name, ":", amt);

  // Trigger reciprocation when enabled
  const s = useStore.getState();
  if (s.reciprocateEnabled && s.reciprocateOnTroops) {
    if (s.reciprocateMode === "auto") {
      // Lazy import to avoid circular dependency
      import("../automation/reciprocate-engine").then((m) => {
        m.handleAutoReciprocate(from.id, name, amt, "troops");
      });
    } else if (s.reciprocatePopupsEnabled) {
      s.addReciprocateNotification({
        id: Date.now(),
        donorId: from.id,
        donorName: name,
        troops: amt,
        gold: 0,
        timestamp: Date.now(),
        dismissed: false,
      });
    }
  }
}

function handleSentTroops(params: Record<string, unknown>): void {
  const name = params.name as string | undefined;
  const amt = parseAmt(params.troops);
  if (!name || amt <= 0) return;

  const { playersById } = useStore.getState();
  const to = findPlayer(name, playersById);
  if (!to) return;

  useStore.getState().recordOutbound(to.id, "troops", amt);
}

function handleReceivedGoldTrade(
  params: Record<string, unknown>,
  raw: Record<string, unknown>,
): void {
  const name = params.name as string | undefined;
  const amt = raw.goldAmount ? num(raw.goldAmount) : parseAmt(params.gold);
  if (!name || amt <= 0) return;

  const { playersById } = useStore.getState();
  const from = findPlayer(name, playersById);
  if (!from) return;

  // Port trade: record port, not inbound donation
  useStore.getState().recordPort(from.id, amt, Date.now());
}

function handleReceivedGold(
  params: Record<string, unknown>,
  raw: Record<string, unknown>,
): void {
  const name = params.name as string | undefined;
  const amt = raw.goldAmount ? num(raw.goldAmount) : parseAmt(params.gold);
  if (!name || amt <= 0) return;

  const { playersById } = useStore.getState();
  const from = findPlayer(name, playersById);
  if (!from) return;

  const donorPlayer = playersById.get(from.id);
  const donorTroopSnapshot = donorPlayer ? Number(donorPlayer.troops || 0) : 0;

  useStore.getState().recordInbound(from.id, "gold", amt);

  log("[RECEIVED] Gold from", name, ":", amt);

  // Trigger reciprocation on gold received
  const s = useStore.getState();
  if (s.reciprocateEnabled && s.reciprocateOnGold) {
    if (s.reciprocateMode === "auto") {
      import("../automation/reciprocate-engine").then((m) => {
        m.handleAutoReciprocate(from.id, name, amt, "gold");
      });
    } else if (s.reciprocatePopupsEnabled) {
      s.addReciprocateNotification({
        id: Date.now(),
        donorId: from.id,
        donorName: name,
        troops: 0,
        gold: amt,
        timestamp: Date.now(),
        dismissed: false,
      });
    }
  }
}

function handleSentGold(
  params: Record<string, unknown>,
  raw: Record<string, unknown>,
): void {
  const name = params.name as string | undefined;
  const amt = raw.goldAmount ? num(raw.goldAmount) : parseAmt(params.gold);
  if (!name || amt <= 0) return;

  const { playersById } = useStore.getState();
  const to = findPlayer(name, playersById);
  if (!to) return;

  useStore.getState().recordOutbound(to.id, "gold", amt);
}

// ---------- Drain buffered messages ----------

export function drainPendingMessages(): void {
  log("[DrainPending] Processing", pendingMessages.length, "buffered messages");
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift();
    if (msg) processDisplayMessage(msg);
  }
}

export function getPendingCount(): number {
  return pendingMessages.length;
}
