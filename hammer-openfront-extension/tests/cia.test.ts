/**
 * Tests for CIA (server-wide economy intelligence) tracking.
 *
 * Source: hammer-scripts/hammer.js lines 380-538
 * Bucket: CIA intelligence — transfer tracking, dedup, flow graph, alerts, betrayal
 */
import { describe, expect, test, beforeEach } from "vitest";
import {
  createCIAState,
  trackCIAEvent,
  MessageType,
  CIA_BIG_GOLD_THRESHOLD,
  CIA_BIG_TROOPS_THRESHOLD,
  type CIAState,
  type PlayerData,
} from "./helpers/hammer-functions";

function makePlayer(overrides: Partial<PlayerData> & { id: string }): PlayerData {
  return {
    smallID: null,
    clientID: null,
    isAlive: true,
    team: null,
    troops: 1000,
    gold: 5000,
    ...overrides,
  };
}

describe("CIA tracking", () => {
  let cia: CIAState;
  let playersBySmallId: Map<number, PlayerData>;
  let playersById: Map<string, PlayerData>;
  let myAllies: Set<number>;

  beforeEach(() => {
    cia = createCIAState();
    playersBySmallId = new Map([
      [1, makePlayer({ id: "p1", smallID: 1, displayName: "Alice", team: 1 })],
      [2, makePlayer({ id: "p2", smallID: 2, displayName: "Bob", team: 1 })],
      [3, makePlayer({ id: "p3", smallID: 3, displayName: "Eve", team: 2 })],
    ]);
    playersById = new Map([
      ["p1", playersBySmallId.get(1)!],
      ["p2", playersBySmallId.get(2)!],
      ["p3", playersBySmallId.get(3)!],
    ]);
    myAllies = new Set();
  });

  // ───────────────────────────────────────────────────────
  // Basic tracking
  // ───────────────────────────────────────────────────────
  test("tracks SENT_TROOPS_TO_PLAYER", () => {
    const tracked = trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(tracked).toBe(true);
    expect(cia.transfers.length).toBe(1);
    expect(cia.transfers[0].type).toBe("troops");
    expect(cia.transfers[0].senderName).toBe("Alice");
    expect(cia.transfers[0].receiverName).toBe("Bob");
    expect(cia.transfers[0].amount).toBe(1000);
  });

  test("tracks SENT_GOLD_TO_PLAYER", () => {
    const tracked = trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "500K" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(tracked).toBe(true);
    expect(cia.transfers[0].type).toBe("gold");
    expect(cia.transfers[0].amount).toBe(500_000);
  });

  test("uses goldAmount from msg when available", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "100" }, { goldAmount: 99999 },
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(cia.transfers[0].amount).toBe(99999);
  });

  // ───────────────────────────────────────────────────────
  // Filters
  // ───────────────────────────────────────────────────────
  test("filters out RECEIVED events (only counts SENT to avoid double-counting)", () => {
    const tracked1 = trackCIAEvent(
      cia, MessageType.RECEIVED_GOLD_FROM_PLAYER, 1,
      { name: "Bob", gold: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    const tracked2 = trackCIAEvent(
      cia, MessageType.RECEIVED_TROOPS_FROM_PLAYER, 1,
      { name: "Bob", troops: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(tracked1).toBe(false);
    expect(tracked2).toBe(false);
    expect(cia.transfers.length).toBe(0);
  });

  test("rejects zero-amount events", () => {
    const tracked = trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "0" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(tracked).toBe(false);
  });

  // ───────────────────────────────────────────────────────
  // Deduplication
  // ───────────────────────────────────────────────────────
  test("deduplicates same event within 10s window", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    const second = trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(second).toBe(false);
    expect(cia.transfers.length).toBe(1);
  });

  // ───────────────────────────────────────────────────────
  // Flow graph
  // ───────────────────────────────────────────────────────
  test("builds flow graph for player-to-player transfers", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "5000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    const flowKey = "Alice\u2192Bob";
    expect(cia.flowGraph.has(flowKey)).toBe(true);
    const flow = cia.flowGraph.get(flowKey)!;
    expect(flow.gold).toBe(5000);
    expect(flow.goldCount).toBe(1);
    expect(flow.sender).toBe("Alice");
    expect(flow.receiver).toBe("Bob");
  });

  test("accumulates flow graph entries", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    // Clear dedup to allow second event
    cia.seen.clear();
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: "2000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    const flow = cia.flowGraph.get("Alice\u2192Bob")!;
    expect(flow.gold).toBe(1000);
    expect(flow.troops).toBe(2000);
    expect(flow.goldCount).toBe(1);
    expect(flow.troopsCount).toBe(1);
  });

  test("does NOT build flow graph for port trades", () => {
    trackCIAEvent(
      cia, MessageType.RECEIVED_GOLD_FROM_TRADE, 1,
      { name: "PortCity", gold: "5000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    // Port trade is tracked in transfers but filtered from RECEIVED events
    // Actually RECEIVED_GOLD_FROM_TRADE is type "port" - it records but the RECEIVED filter
    // happens before port check. Let's verify:
    // Actually looking at the code: port events ARE recorded in transfers, but
    // they skip the flow graph "if (type !== 'port')" check.
    // But wait - RECEIVED_GOLD_FROM_TRADE is not in the RECEIVED filter (only RECEIVED_GOLD_FROM_PLAYER
    // and RECEIVED_TROOPS_FROM_PLAYER are filtered). So port trades DO get tracked.
    expect(cia.transfers.length).toBe(1);
    expect(cia.transfers[0].type).toBe("port");
    expect(cia.flowGraph.size).toBe(0); // No flow graph entry for ports
  });

  // ───────────────────────────────────────────────────────
  // Player totals
  // ───────────────────────────────────────────────────────
  test("updates player totals for sender and receiver", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "5000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    const aliceTotals = cia.playerTotals.get("Alice")!;
    const bobTotals = cia.playerTotals.get("Bob")!;
    expect(aliceTotals.sentGold).toBe(5000);
    expect(aliceTotals.sentCount).toBe(1);
    expect(bobTotals.recvGold).toBe(5000);
    expect(bobTotals.recvCount).toBe(1);
  });

  // ───────────────────────────────────────────────────────
  // Alerts — big transfers
  // ───────────────────────────────────────────────────────
  test("generates alert for large gold transfer", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob" }, { goldAmount: CIA_BIG_GOLD_THRESHOLD },
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(cia.alerts.length).toBe(1);
    expect(cia.alerts[0].level).toBe("big");
    expect(cia.alerts[0].message).toContain("gold");
  });

  test("generates alert for large troop transfer", () => {
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: String(CIA_BIG_TROOPS_THRESHOLD) }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(cia.alerts.length).toBe(1);
    expect(cia.alerts[0].level).toBe("big");
    expect(cia.alerts[0].message).toContain("troops");
  });

  test("no alert for small transfers", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: "100" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(cia.alerts.length).toBe(0);
  });

  // ───────────────────────────────────────────────────────
  // Betrayal detection
  // ───────────────────────────────────────────────────────
  test("detects teammate feeding enemy", () => {
    // Bob (team 1) sends to Eve (team 2) — betrayal!
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 2,
      { name: "Eve", troops: "5000" }, {},
      playersBySmallId, 1, 1, playersById, myAllies,
    );
    const betrayalAlerts = cia.alerts.filter((a) => a.level === "betrayal");
    expect(betrayalAlerts.length).toBe(1);
    expect(betrayalAlerts[0].message).toContain("Bob");
    expect(betrayalAlerts[0].message).toContain("Eve");
    expect(betrayalAlerts[0].message).toContain("feeding enemy");
  });

  test("no betrayal alert for teammate feeding ally", () => {
    myAllies.add(3); // Eve is now ally
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 2,
      { name: "Eve", troops: "5000" }, {},
      playersBySmallId, 1, 1, playersById, myAllies,
    );
    const betrayalAlerts = cia.alerts.filter((a) => a.level === "betrayal");
    expect(betrayalAlerts.length).toBe(0);
  });

  test("no betrayal alert for teammate feeding teammate", () => {
    // Alice (team 1) sends to Bob (team 1) — not betrayal
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: "5000" }, {},
      playersBySmallId, 1, 1, playersById, myAllies,
    );
    const betrayalAlerts = cia.alerts.filter((a) => a.level === "betrayal");
    expect(betrayalAlerts.length).toBe(0);
  });

  test("no betrayal when mySmallID is null", () => {
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 2,
      { name: "Eve", troops: "5000" }, {},
      playersBySmallId, null, 1, playersById, myAllies,
    );
    const betrayalAlerts = cia.alerts.filter((a) => a.level === "betrayal");
    expect(betrayalAlerts.length).toBe(0);
  });

  // ───────────────────────────────────────────────────────
  // Unknown actor
  // ───────────────────────────────────────────────────────
  test("handles unknown actor PID gracefully", () => {
    const tracked = trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 999,
      { name: "Bob", gold: "1000" }, {},
      playersBySmallId, null, null, playersById, myAllies,
    );
    expect(tracked).toBe(true);
    expect(cia.transfers[0].actorName).toBe("PID:999");
    expect(cia.transfers[0].senderName).toBe("PID:999");
  });
});
