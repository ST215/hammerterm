/**
 * message-processor.ts — Processes DisplayEvent messages from the game.
 *
 * Ported from processDisplayMessage() in hammer.js.
 * Routes donation events (gold/troops sent/received) to the Zustand store
 * and triggers reciprocation when enabled.
 */

import { useStore } from "@store/index";
import { MessageType, CAPTURED_SHIP_GOLD_KEY } from "@shared/constants";
import { parseAmt, num, dTroops } from "@shared/utils";
import { trackCIAEvent } from "@shared/logic/cia";
import { findPlayer } from "@shared/logic/player-helpers";
import type { PlayerData } from "@shared/types";
import { record, trackMetric } from "../../recorder";

// ---------- Module-level state ----------

const pendingMessages: unknown[] = [];

/** DonateEvents buffered until player data is ready (mirrors pendingMessages). */
type DonateEvt = {
  donationType: "troops" | "gold";
  senderId: string;
  recipientId: string;
  amount: number;
};
const pendingDonations: DonateEvt[] = [];

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

  // Buffer messages until player data is ready. In a replay we may have no
  // "my player" (watching someone else's match), so playerDataReady never
  // flips the normal way — isReplay lifts the gate so analytics still ingest.
  if (!store.playerDataReady && !store.isReplay) {
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

  // Route by message type. Player-to-player donations (gold/troops sent &
  // received) no longer travel on the DisplayEvent channel — they arrive as
  // GameUpdateType.DonateEvent (see processDonateEvent). Port / captured-trade-
  // ship gold is the only display message still routed here: as of v0.32 it
  // arrives as the game's CAPTURED_ENEMY_UNIT (11) event. That numeric type is
  // broad (any enemy-unit capture), so gate on the message key — only trade/
  // port gold carries CAPTURED_SHIP_GOLD_KEY and a goldAmount payload.
  if (
    mt === MessageType.CAPTURED_ENEMY_UNIT &&
    raw.message === CAPTURED_SHIP_GOLD_KEY
  ) {
    handleReceivedGoldTrade(params, raw);
  }
}

// ---------- DonateEvent processor ----------

/**
 * Process a GameUpdateType.DonateEvent {donationType, senderId, recipientId,
 * amount}. `amount` is already a Number (converted from bigint in the MAIN
 * world before serialization). Troop amounts are INTERNAL ×10 units; gold is
 * gold units. A single event carries the full sender→recipient transfer.
 */
export function processDonateEvent(evt: DonateEvt): void {
  if (!evt || (evt.donationType !== "troops" && evt.donationType !== "gold")) {
    return;
  }

  trackMetric("displayEventsReceived");

  const store = useStore.getState();
  if (store.paused) return;

  // Buffer until player data is ready (isReplay lifts the gate, mirroring the
  // display path — a spectated replay never establishes "my player").
  if (!store.playerDataReady && !store.isReplay) {
    pendingDonations.push(evt);
    return;
  }

  const amountInternal = Number(evt.amount) || 0;
  if (amountInternal <= 0) return;

  const { donationType, senderId, recipientId } = evt;
  // Display-unit amount for records/toasts/reciprocate: troops are internal
  // ×10, gold is 1:1 (matches the units the old display-message path stored).
  const displayAmt =
    donationType === "troops" ? dTroops(amountInternal) : amountInternal;

  const { playersById, playersBySmallId, mySmallID, myTeam, myAllies, ciaState } =
    useStore.getState();
  const sender = playersById.get(senderId);
  const recipient = playersById.get(recipientId);

  // CIA: track server-wide from this same source. A DonateEvent is a SENT
  // transfer, so feed trackCIAEvent a synthetic SENT_* message keyed on the
  // sender as actor and the recipient as the "other" party.
  const mt =
    donationType === "gold"
      ? MessageType.SENT_GOLD_TO_PLAYER
      : MessageType.SENT_TROOPS_TO_PLAYER;
  const recipientName = recipient?.displayName || recipient?.name || "";
  const ciaParams =
    donationType === "gold"
      ? { name: recipientName, gold: displayAmt }
      : { name: recipientName, troops: displayAmt };
  const ciaMsg = donationType === "gold" ? { goldAmount: displayAmt } : {};
  const tracked = trackCIAEvent(
    ciaState,
    mt,
    sender?.smallID ?? -1,
    ciaParams,
    ciaMsg,
    playersBySmallId,
    mySmallID,
    myTeam,
    playersById,
    myAllies,
  );
  if (tracked) {
    useStore.setState({ ciaState: { ...ciaState } });
  }

  // Route inbound / outbound relative to our own PlayerID. Donations between
  // two OTHER players are tracked by CIA above but ignored here.
  const myId = mySmallID != null ? playersBySmallId.get(mySmallID)?.id : undefined;
  if (!myId) return;
  if (recipientId === myId) {
    handleInboundDonation(senderId, sender, donationType, displayAmt);
  } else if (senderId === myId) {
    handleOutboundDonation(recipientId, recipient, donationType, displayAmt);
  }
}

function handleInboundDonation(
  fromId: string,
  from: PlayerData | undefined,
  type: "troops" | "gold",
  amt: number,
): void {
  const name = from?.displayName || from?.name;
  if (!name || amt <= 0) return;

  // Per-donor dedup: skip if same donor sent same type within 500ms
  const donorKey = `${fromId}:${type}`;
  const lastProcessed = recentDonors.get(donorKey) || 0;
  if (Date.now() - lastProcessed < DEDUP_WINDOW_MS) {
    trackMetric("displayEventsDeduped");
    record("msg", "deduped", { from: name, type, amt });
    return;
  }
  recentDonors.set(donorKey, Date.now());

  const donorTroopSnapshot = from ? Number(from.troops || 0) : 0;

  useStore.getState().recordInbound(fromId, name, type, amt, donorTroopSnapshot);

  // Donation toast
  const s0 = useStore.getState();
  const toastOn = type === "troops" ? s0.toastInboundTroops : s0.toastInboundGold;
  if (toastOn) {
    s0.addDonationToast({
      id: Date.now() + Math.random(),
      playerName: name,
      type,
      amount: amt,
      direction: "in",
      timestamp: Date.now(),
    });
  }

  trackMetric("displayEventsProcessed");
  record("msg", `received.${type}`, { from: name, amt });
  log(`[RECEIVED] ${type} from`, name, ":", amt);

  // Auto thank-you — independent of send-back, fires in every reciprocate mode.
  if (useStore.getState().thankEnabled) {
    import("../automation/reciprocate-engine").then((m) => m.sendThanks(fromId));
  }

  // Trigger reciprocation when enabled
  const s = useStore.getState();
  const onType = type === "troops" ? s.reciprocateOnTroops : s.reciprocateOnGold;
  if (s.reciprocateEnabled && onType) {
    if (s.reciprocateMode === "auto" || s.reciprocateMode === "palantir") {
      const donorRecord = s.inbound.get(fromId);
      const sendCount = donorRecord ? donorRecord.count : 1;
      import("../automation/reciprocate-engine").then((m) => {
        m.handleAutoReciprocate(fromId, name, amt, type, donorTroopSnapshot, sendCount);
      });
    } else if (s.reciprocatePopupsEnabled) {
      s.addReciprocateNotification({
        id: Date.now() + Math.random(),
        donorId: fromId,
        donorName: name,
        troops: type === "troops" ? amt : 0,
        gold: type === "gold" ? amt : 0,
        timestamp: Date.now(),
        dismissed: false,
      });
    }
  }
}

function handleOutboundDonation(
  toId: string,
  to: PlayerData | undefined,
  type: "troops" | "gold",
  amt: number,
): void {
  const name = to?.displayName || to?.name;
  if (!name || amt <= 0) return;

  trackMetric("displayEventsProcessed");
  record("msg", `sent.${type}`, { to: name, amt });
  useStore.getState().recordOutbound(toId, name, type, amt);
}

// ---------- Message-type handlers ----------

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

// ---------- Drain buffered messages ----------

export function drainPendingMessages(): void {
  log(
    "[DrainPending] Processing",
    pendingMessages.length + pendingDonations.length,
    "buffered messages",
  );
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift();
    if (msg) processDisplayMessage(msg);
  }
  while (pendingDonations.length > 0) {
    const evt = pendingDonations.shift();
    if (evt) processDonateEvent(evt);
  }
}

export function getPendingCount(): number {
  return pendingMessages.length + pendingDonations.length;
}
