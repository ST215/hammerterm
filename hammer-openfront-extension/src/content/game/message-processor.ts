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
import { record, trackMetric } from "../../recorder";

// ---------- Module-level state ----------

const pendingMessages: unknown[] = [];

/** Per-donor dedup: "donorName:messageType" -> last processed timestamp */
const recentDonors = new Map<string, number>();
const DEDUP_WINDOW_MS = 500;

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

  trackMetric("displayEventsReceived");

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
  const tracked = trackCIAEvent(ciaState, mt, pid, params as { name?: string; troops?: unknown; gold?: unknown }, raw as { goldAmount?: unknown }, playersBySmallId, mySmallID, myTeam, playersById, myAllies);
  // trackCIAEvent mutates ciaState in place — create a new reference so Zustand detects the change
  if (tracked) {
    useStore.setState({ ciaState: { ...ciaState } });
  }

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

  // Per-donor dedup: skip if same donor sent same type within 500ms
  const donorKey = `${name}:troops`;
  const lastProcessed = recentDonors.get(donorKey) || 0;
  if (Date.now() - lastProcessed < DEDUP_WINDOW_MS) {
    trackMetric("displayEventsDeduped");
    record("msg", "deduped", { from: name, type: "troops", amt });
    return;
  }
  recentDonors.set(donorKey, Date.now());

  const { playersById } = useStore.getState();
  const from = findPlayer(name, playersById);
  if (!from) return;

  const donorPlayer = playersById.get(from.id);
  const donorTroopSnapshot = donorPlayer ? Number(donorPlayer.troops || 0) : 0;

  // Update inbound donations
  useStore.getState().recordInbound(from.id, name, "troops", amt, donorTroopSnapshot);

  // Donation toast
  if (useStore.getState().toastInboundTroops) {
    useStore.getState().addDonationToast({
      id: Date.now() + Math.random(),
      playerName: name,
      type: "troops",
      amount: amt,
      direction: "in",
      timestamp: Date.now(),
    });
  }

  trackMetric("displayEventsProcessed");
  record("msg", "received.troops", { from: name, amt });
  log("[RECEIVED] Troops from", name, ":", amt);

  // Trigger reciprocation when enabled
  const s = useStore.getState();
  if (s.reciprocateEnabled && s.reciprocateOnTroops) {
    if (s.reciprocateMode === "auto" || s.reciprocateMode === "palantir") {
      // Get send count from inbound donation record for Palantir loyalty calc
      const donorRecord = s.inbound.get(from.id);
      const sendCount = donorRecord ? donorRecord.count : 1;
      // Lazy import to avoid circular dependency
      import("../automation/reciprocate-engine").then((m) => {
        m.handleAutoReciprocate(from.id, name, amt, "troops", donorTroopSnapshot, sendCount);
      });
    } else if (s.reciprocatePopupsEnabled) {
      s.addReciprocateNotification({
        id: Date.now() + Math.random(),
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

  trackMetric("displayEventsProcessed");
  record("msg", "sent.troops", { to: name, amt });
  useStore.getState().recordOutbound(to.id, name!, "troops", amt);
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

  // Per-donor dedup: skip if same donor sent same type within 500ms
  const donorKey = `${name}:gold`;
  const lastProcessed = recentDonors.get(donorKey) || 0;
  if (Date.now() - lastProcessed < DEDUP_WINDOW_MS) {
    trackMetric("displayEventsDeduped");
    record("msg", "deduped", { from: name, type: "gold", amt });
    return;
  }
  recentDonors.set(donorKey, Date.now());

  const { playersById } = useStore.getState();
  const from = findPlayer(name, playersById);
  if (!from) return;

  const donorPlayer = playersById.get(from.id);
  const donorTroopSnapshot = donorPlayer ? Number(donorPlayer.troops || 0) : 0;

  useStore.getState().recordInbound(from.id, name!, "gold", amt, donorTroopSnapshot);

  // Donation toast
  if (useStore.getState().toastInboundGold) {
    useStore.getState().addDonationToast({
      id: Date.now() + Math.random(),
      playerName: name!,
      type: "gold",
      amount: amt,
      direction: "in",
      timestamp: Date.now(),
    });
  }

  trackMetric("displayEventsProcessed");
  record("msg", "received.gold", { from: name, amt });
  log("[RECEIVED] Gold from", name, ":", amt);

  // Trigger reciprocation on gold received
  const s = useStore.getState();
  if (s.reciprocateEnabled && s.reciprocateOnGold) {
    if (s.reciprocateMode === "auto" || s.reciprocateMode === "palantir") {
      const donorRecord = s.inbound.get(from.id);
      const sendCount = donorRecord ? donorRecord.count : 1;
      import("../automation/reciprocate-engine").then((m) => {
        m.handleAutoReciprocate(from.id, name, amt, "gold", donorTroopSnapshot, sendCount);
      });
    } else if (s.reciprocatePopupsEnabled) {
      s.addReciprocateNotification({
        id: Date.now() + Math.random(),
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

  trackMetric("displayEventsProcessed");
  record("msg", "sent.gold", { to: name, amt });
  useStore.getState().recordOutbound(to.id, name!, "gold", amt);
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
