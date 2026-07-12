/**
 * Unit tests for v15.22 data-layer plumbing (spec D1 + D5 data line):
 *   - packedPlayerUpdates quad unpack + merge + live-troops routing
 *     (bridge.handlePlayerStats)
 *   - DonateEvent routing inbound/outbound + other-players-ignored + CIA
 *     + BigInt-amount conversion safety (message-processor.processDonateEvent)
 *   - handleRefresh self-preservation of our own player (blink fix)
 *
 * These drive the REAL functions against the REAL Zustand singleton store.
 */
import { describe, expect, test, beforeEach, vi } from "vitest";
import { useStore } from "../src/store/index";
import {
  processDonateEvent,
  processDisplayMessage,
} from "../src/content/game/message-processor";
import { MessageType, CAPTURED_SHIP_GOLD_KEY } from "../src/shared/constants";
import { handlePlayerStats, handleRefresh } from "../src/content/bridge";
import { getMyLiveTroops, setMyLiveTroops } from "../src/content/hooks/worker-hook";
import type { PlayerData } from "../src/shared/types";

// Monotonic fake clock shared across throttle-sensitive describes: the bridge
// keeps a module-level `lastStatsUpdateMs` (1s stats throttle), so each merge
// call must land strictly >1s after any previous one to actually apply.
let CLOCK = 1_700_000_000_000;
function tick(): void {
  CLOCK += 100_000;
  vi.setSystemTime(CLOCK);
}

function mkPlayer(
  id: string,
  smallID: number,
  name: string,
  overrides: Partial<PlayerData> = {},
): PlayerData {
  return {
    id,
    smallID,
    clientID: `client-${id}`,
    name,
    displayName: name,
    isAlive: true,
    team: 1,
    troops: 10000,
    gold: 5000,
    tilesOwned: 100,
    allies: [],
    ...overrides,
  };
}

/** Seed the store with players and establish our identity as `meSmallID`. */
function seedStore(players: PlayerData[], meSmallID: number, meClientID: string) {
  const s = useStore.getState();
  s.resetPlayerState();
  s.resetDonations();
  s.resetCIA();
  s.resetDonationToasts();
  useStore.setState({
    paused: false,
    reciprocateEnabled: false,
    thankEnabled: false,
    toastInboundTroops: true,
    toastInboundGold: true,
  });
  const byId = new Map<string, PlayerData>();
  const bySmallId = new Map<number, PlayerData>();
  for (const p of players) {
    byId.set(p.id, p);
    if (p.smallID != null) bySmallId.set(p.smallID, p);
  }
  s.setCurrentClientID(meClientID);
  s.setMyIdentity(meSmallID, 1);
  s.setPlayers(byId, bySmallId, players);
  s.markPlayerDataReady();
}

// ═══════════════════════════════════════════════════════
// packedPlayerUpdates → handlePlayerStats
// ═══════════════════════════════════════════════════════
describe("handlePlayerStats — packed quad unpack + merge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tick();
    setMyLiveTroops(0);
  });

  test("merges [smallID, tilesOwned, gold, troops] quads by smallID", () => {
    seedStore(
      [mkPlayer("p1", 1, "Me"), mkPlayer("p2", 2, "Bob")],
      1,
      "client-p1",
    );
    // Two quads: p1 -> tiles 111, gold 222, troops 333 ; p2 -> 444, 555, 666
    handlePlayerStats({ stats: [1, 111, 222, 333, 2, 444, 555, 666] });

    const st = useStore.getState();
    const p1 = st.playersBySmallId.get(1)!;
    const p2 = st.playersBySmallId.get(2)!;
    expect(p1.tilesOwned).toBe(111);
    expect(p1.gold).toBe(222);
    expect(p1.troops).toBe(333);
    expect(p2.tilesOwned).toBe(444);
    expect(p2.gold).toBe(555);
    expect(p2.troops).toBe(666);
    // byId view stays consistent
    expect(st.playersById.get("p2")!.troops).toBe(666);
  });

  test("routes my quad to the live-troops scalar immediately (unthrottled)", () => {
    seedStore([mkPlayer("p1", 1, "Me")], 1, "client-p1");
    handlePlayerStats({ stats: [1, 10, 20, 98765] });
    expect(getMyLiveTroops()).toBe(98765);
  });

  test("live-troops updates even before a structural record exists for me", () => {
    // mySmallID known, but no player record yet (structural update pending).
    const s = useStore.getState();
    s.resetPlayerState();
    s.setMyIdentity(7, 1);
    setMyLiveTroops(0);
    handlePlayerStats({ stats: [7, 1, 2, 4242] });
    expect(getMyLiveTroops()).toBe(4242);
  });

  test("ignores quads for players with no structural record yet", () => {
    seedStore([mkPlayer("p1", 1, "Me")], 1, "client-p1");
    handlePlayerStats({ stats: [1, 5, 6, 7, 99, 8, 9, 10] });
    const st = useStore.getState();
    expect(st.playersBySmallId.has(99)).toBe(false);
    expect(st.playersBySmallId.get(1)!.troops).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════
// DonateEvent → processDonateEvent
// ═══════════════════════════════════════════════════════
describe("processDonateEvent — inbound / outbound / CIA routing", () => {
  beforeEach(() => {
    vi.useRealTimers();
    // Distinct player ids per describe reset avoids the 500ms per-donor dedup.
    seedStore(
      [
        mkPlayer("me", 1, "Me", { troops: 100000 }),
        mkPlayer("bob", 2, "Bob", { troops: 88000, team: 1 }),
        mkPlayer("eve", 3, "Eve", { troops: 77000, team: 2 }),
      ],
      1,
      "client-me",
    );
  });

  test("inbound troops: recipient=me records display troops + donor snapshot + CIA", () => {
    // amount internal ×10 = 50000 -> display 5000
    processDonateEvent({
      donationType: "troops",
      senderId: "bob",
      recipientId: "me",
      amount: 50000,
    });
    const st = useStore.getState();
    const rec = st.inbound.get("bob")!;
    expect(rec).toBeTruthy();
    expect(rec.troops).toBe(5000); // display units
    expect(rec.lastDonorTroops).toBe(88000); // internal snapshot
    // toast emitted
    expect(st.donationToasts.some((t) => t.playerName === "Bob" && t.type === "troops")).toBe(true);
    // CIA tracked the sender->me transfer (display units)
    expect(st.ciaState.transfers.length).toBe(1);
    expect(st.ciaState.transfers[0].senderName).toBe("Bob");
    expect(st.ciaState.transfers[0].receiverName).toBe("Me");
    expect(st.ciaState.transfers[0].amount).toBe(5000);
  });

  test("inbound gold: recipient=me records gold units 1:1", () => {
    processDonateEvent({
      donationType: "gold",
      senderId: "bob",
      recipientId: "me",
      amount: 12345,
    });
    const rec = useStore.getState().inbound.get("bob")!;
    expect(rec.gold).toBe(12345);
  });

  test("outbound: sender=me records to recipient (no inbound)", () => {
    processDonateEvent({
      donationType: "gold",
      senderId: "me",
      recipientId: "eve",
      amount: 9000,
    });
    const st = useStore.getState();
    expect(st.outbound.get("eve")!.gold).toBe(9000);
    expect(st.inbound.size).toBe(0);
  });

  test("donation between two OTHER players is ignored for inbound/outbound but tracked by CIA", () => {
    processDonateEvent({
      donationType: "troops",
      senderId: "bob",
      recipientId: "eve",
      amount: 30000,
    });
    const st = useStore.getState();
    expect(st.inbound.size).toBe(0);
    expect(st.outbound.size).toBe(0);
    // CIA still sees the server-wide transfer
    expect(st.ciaState.transfers.length).toBe(1);
    expect(st.ciaState.transfers[0].senderName).toBe("Bob");
    expect(st.ciaState.transfers[0].receiverName).toBe("Eve");
  });

  test("zero / non-positive amount is dropped", () => {
    processDonateEvent({ donationType: "gold", senderId: "bob", recipientId: "me", amount: 0 });
    expect(useStore.getState().inbound.size).toBe(0);
  });

  test("reciprocate popup fires for inbound when manual mode + popups enabled", () => {
    useStore.setState({
      reciprocateEnabled: true,
      reciprocateMode: "manual",
      reciprocateOnTroops: true,
      reciprocatePopupsEnabled: true,
    });
    processDonateEvent({
      donationType: "troops",
      senderId: "eve",
      recipientId: "me",
      amount: 20000,
    });
    const notifs = useStore.getState().reciprocateNotifications;
    expect(notifs.some((n) => n.donorId === "eve" && n.troops === 2000)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// BigInt-amount conversion safety
// ═══════════════════════════════════════════════════════
describe("BigInt amount conversion safety", () => {
  beforeEach(() => {
    vi.useRealTimers();
    seedStore(
      [mkPlayer("me", 1, "Me"), mkPlayer("zed", 9, "Zed")],
      1,
      "client-me",
    );
  });

  test("JSON.stringify throws on a raw bigint (why MAIN world converts first)", () => {
    expect(() => JSON.stringify({ amount: 5n })).toThrow();
  });

  test("Number(bigint) is exact for game-range gold (< 2^53)", () => {
    const big = 9_007_199_254_740_000n; // just under 2^53
    expect(Number(big)).toBe(9_007_199_254_740_000);
  });

  test("processDonateEvent accepts a Number-converted-from-bigint amount", () => {
    const amount = Number(1_500_000n); // MAIN world does Number(d.amount)
    processDonateEvent({
      donationType: "gold",
      senderId: "zed",
      recipientId: "me",
      amount,
    });
    expect(useStore.getState().inbound.get("zed")!.gold).toBe(1_500_000);
  });
});

// ═══════════════════════════════════════════════════════
// Port income routing (v0.32: CAPTURED_ENEMY_UNIT display event)
// ═══════════════════════════════════════════════════════
describe("processDisplayMessage — port / captured-ship gold routing", () => {
  beforeEach(() => {
    vi.useRealTimers();
    seedStore(
      [mkPlayer("me", 1, "Me"), mkPlayer("eve", 3, "Eve")],
      1,
      "client-me",
    );
  });

  test("captured-trade-ship gold (mt=11 + key) records port income for the counterparty", () => {
    processDisplayMessage({
      messageType: MessageType.CAPTURED_ENEMY_UNIT,
      playerID: 1, // directed at us (the capturer)
      message: CAPTURED_SHIP_GOLD_KEY,
      params: { name: "Eve", gold: "1,234" },
      goldAmount: 1234,
    });
    const port = useStore.getState().ports.get("eve");
    expect(port).toBeTruthy();
    expect(port!.totalGold).toBe(1234);
  });

  test("CAPTURED_ENEMY_UNIT without the trade-gold key does NOT record port income", () => {
    processDisplayMessage({
      messageType: MessageType.CAPTURED_ENEMY_UNIT,
      playerID: 1,
      message: "events_display.captured_enemy_unit", // some other capture, no gold
      params: { name: "Eve" },
    });
    expect(useStore.getState().ports.size).toBe(0);
  });

  test("stale mt=20 (now CHAT in v0.32) no longer routes to port income", () => {
    processDisplayMessage({
      messageType: MessageType.RECEIVED_GOLD_FROM_TRADE, // 20 — dead path
      playerID: 1,
      message: CAPTURED_SHIP_GOLD_KEY,
      params: { name: "Eve", gold: "1,234" },
      goldAmount: 1234,
    });
    expect(useStore.getState().ports.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// handleRefresh self-preservation (blink fix, spec D5)
// ═══════════════════════════════════════════════════════
describe("handleRefresh — self-preservation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tick();
    setMyLiveTroops(0);
  });

  test("keeps our own player when a poll payload omits it (no me→null blink)", () => {
    seedStore(
      [mkPlayer("me", 1, "Me"), mkPlayer("bob", 2, "Bob"), mkPlayer("eve", 3, "Eve")],
      1,
      "client-me",
    );
    // Refresh payload DROPS "me" and renames Bob to force a structural update
    // (so setPlayers actually runs and would drop us without preservation).
    handleRefresh({
      players: [
        mkPlayer("bob", 2, "Bobby"),
        mkPlayer("eve", 3, "Eve"),
      ],
    });
    const st = useStore.getState();
    expect(st.playersBySmallId.has(1)).toBe(true); // me preserved
    expect(st.playersById.get("me")).toBeTruthy();
    expect(st.playersById.get("bob")!.displayName).toBe("Bobby"); // update applied
  });

  test("updates the live-troops scalar as a slow-path backup", () => {
    seedStore([mkPlayer("me", 1, "Me", { troops: 42000 })], 1, "client-me");
    handleRefresh({ players: [mkPlayer("me", 1, "Me", { troops: 42000 })] });
    expect(getMyLiveTroops()).toBe(42000);
  });
});
