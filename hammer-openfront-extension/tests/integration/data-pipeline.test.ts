/**
 * Integration test: verifies the full data pipeline from display event
 * through message-processor into the Zustand store.
 *
 * This catches regressions where UI changes accidentally break data tracking.
 */
import { describe, expect, test, beforeEach } from "vitest";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createUISlice, type UISlice } from "../../src/store/slices/ui";
import { createPlayerSlice, type PlayerSlice } from "../../src/store/slices/player";
import { createDonationsSlice, type DonationsSlice } from "../../src/store/slices/donations";
import { createAutoTroopsSlice, type AutoTroopsSlice } from "../../src/store/slices/auto-troops";
import { createAutoGoldSlice, type AutoGoldSlice } from "../../src/store/slices/auto-gold";
import { createReciprocateSlice, type ReciprocateSlice } from "../../src/store/slices/reciprocate";
import { createCommsSlice, type CommsSlice } from "../../src/store/slices/comms";
import { createCIASlice, type CIASlice } from "../../src/store/slices/cia";
import { createDonationToastsSlice, type DonationToastsSlice } from "../../src/store/slices/donation-toasts";
import { trackCIAEvent, createCIAState } from "../../src/shared/logic/cia";
import { MessageType } from "../../src/shared/constants";
import { parseAmt, num } from "../../src/shared/utils";
import { findPlayer } from "../../src/shared/logic/player-helpers";
import type { PlayerData } from "../../src/shared/types";

type TestStore = UISlice &
  PlayerSlice &
  DonationsSlice &
  AutoTroopsSlice &
  AutoGoldSlice &
  ReciprocateSlice &
  CommsSlice &
  CIASlice &
  DonationToastsSlice;

function createTestStore() {
  return create<TestStore>()(
    subscribeWithSelector((...a) => ({
      ...createUISlice(...a),
      ...createPlayerSlice(...a),
      ...createDonationsSlice(...a),
      ...createAutoTroopsSlice(...a),
      ...createAutoGoldSlice(...a),
      ...createReciprocateSlice(...a),
      ...createCommsSlice(...a),
      ...createCIASlice(...a),
      ...createDonationToastsSlice(...a),
    })),
  );
}

function makePlayer(id: string, smallID: number, name: string, team: number | null = 1): PlayerData {
  return {
    id,
    smallID,
    clientID: `client-${id}`,
    name,
    displayName: name,
    isAlive: true,
    team,
    troops: 10000,
    gold: 5000,
    tilesOwned: 100,
  };
}

describe("data pipeline integration", () => {
  let store: ReturnType<typeof createTestStore>;
  let me: PlayerData;
  let alice: PlayerData;

  beforeEach(() => {
    store = createTestStore();

    me = makePlayer("me-id", 1, "TestPlayer", 1);
    alice = makePlayer("alice-id", 2, "Alice", 1);

    // Set up players
    const byId = new Map<string, PlayerData>();
    byId.set(me.id, me);
    byId.set(alice.id, alice);

    const bySmallId = new Map<number, PlayerData>();
    bySmallId.set(me.smallID!, me);
    bySmallId.set(alice.smallID!, alice);

    store.getState().setPlayers(byId, bySmallId, [me, alice]);
    store.getState().setCurrentClientID("client-me-id");
    store.getState().setMyIdentity(1, 1);
    store.getState().markPlayerDataReady();
  });

  test("recordInbound tracks received troops", () => {
    const s = store.getState();
    s.recordInbound(alice.id, "Alice", "troops", 5000);
    const inbound = store.getState().inbound;
    expect(inbound.size).toBe(1);
    const rec = inbound.get(alice.id);
    expect(rec).toBeDefined();
    expect(rec!.troops).toBe(5000);
    expect(rec!.displayName).toBe("Alice");
  });

  test("recordInbound tracks received gold", () => {
    const s = store.getState();
    s.recordInbound(alice.id, "Alice", "gold", 10000);
    const rec = store.getState().inbound.get(alice.id);
    expect(rec).toBeDefined();
    expect(rec!.gold).toBe(10000);
  });

  test("recordOutbound tracks sent troops", () => {
    store.getState().recordOutbound(alice.id, "Alice", "troops", 3000);
    const rec = store.getState().outbound.get(alice.id);
    expect(rec).toBeDefined();
    expect(rec!.troops).toBe(3000);
  });

  test("recordOutbound tracks sent gold", () => {
    store.getState().recordOutbound(alice.id, "Alice", "gold", 7000);
    const rec = store.getState().outbound.get(alice.id);
    expect(rec).toBeDefined();
    expect(rec!.gold).toBe(7000);
  });

  test("feedIn populated on inbound", () => {
    store.getState().recordInbound(alice.id, "Alice", "troops", 5000);
    const feedIn = store.getState().feedIn;
    expect(feedIn.length).toBe(1);
    expect(feedIn[0].name).toBe("Alice");
    expect(feedIn[0].type).toBe("troops");
    expect(feedIn[0].amount).toBe(5000);
  });

  test("donation toast tracks correctly", () => {
    store.getState().addDonationToast({
      id: 1,
      playerName: "Alice",
      type: "troops",
      amount: 5000,
      direction: "in",
      timestamp: Date.now(),
    });
    const toasts = store.getState().donationToasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].playerName).toBe("Alice");
  });

  test("CIA trackCIAEvent records sent troops transfer", () => {
    const cia = createCIAState();
    const { playersBySmallId, mySmallID, myTeam, playersById, myAllies } = store.getState();

    const tracked = trackCIAEvent(
      cia,
      MessageType.SENT_TROOPS_TO_PLAYER,
      alice.smallID!,
      { name: me.displayName, troops: "5000" },
      {},
      playersBySmallId,
      mySmallID,
      myTeam,
      playersById,
      myAllies,
    );

    expect(tracked).toBe(true);
    expect(cia.transfers.length).toBe(1);
    expect(cia.transfers[0].senderName).toBe("Alice");
    expect(cia.transfers[0].receiverName).toBe(me.displayName);
    expect(cia.transfers[0].amount).toBe(5000);
    expect(cia.transfers[0].type).toBe("troops");
  });

  test("CIA trackCIAEvent records sent gold transfer", () => {
    const cia = createCIAState();
    const { playersBySmallId, mySmallID, myTeam, playersById, myAllies } = store.getState();

    const tracked = trackCIAEvent(
      cia,
      MessageType.SENT_GOLD_TO_PLAYER,
      me.smallID!,
      { name: "Alice", gold: "10000" },
      { goldAmount: 10000 },
      playersBySmallId,
      mySmallID,
      myTeam,
      playersById,
      myAllies,
    );

    expect(tracked).toBe(true);
    expect(cia.transfers.length).toBe(1);
    expect(cia.transfers[0].senderName).toBe(me.displayName);
    expect(cia.transfers[0].receiverName).toBe("Alice");
    expect(cia.transfers[0].type).toBe("gold");
  });

  test("CIA RECEIVED events are filtered out (only SENT tracked to avoid double-counting)", () => {
    const cia = createCIAState();
    const { playersBySmallId, mySmallID, myTeam, playersById, myAllies } = store.getState();

    const tracked = trackCIAEvent(
      cia,
      MessageType.RECEIVED_TROOPS_FROM_PLAYER,
      me.smallID!,
      { name: "Alice", troops: "5000" },
      {},
      playersBySmallId,
      mySmallID,
      myTeam,
      playersById,
      myAllies,
    );

    expect(tracked).toBe(false);
    expect(cia.transfers.length).toBe(0);
  });

  test("findPlayer resolves by display name", () => {
    const { playersById } = store.getState();
    const found = findPlayer("Alice", playersById);
    expect(found).not.toBeNull();
    expect(found!.id).toBe("alice-id");
    expect(found!.name).toBe("Alice");
  });

  test("findPlayer returns null for unknown name", () => {
    const { playersById } = store.getState();
    const found = findPlayer("Nobody", playersById);
    expect(found).toBeNull();
  });

  test("CIA store window and filter defaults", () => {
    const s = store.getState();
    expect(s.ciaWindowMs).toBe(300_000);
    expect(s.ciaFeedFilter).toBe("all");
  });

  test("CIA store setCIAWindow updates", () => {
    store.getState().setCIAWindow(60_000);
    expect(store.getState().ciaWindowMs).toBe(60_000);
  });

  test("CIA store setCIAFeedFilter updates", () => {
    store.getState().setCIAFeedFilter("gold");
    expect(store.getState().ciaFeedFilter).toBe("gold");
  });

  test("multiple inbound donations accumulate", () => {
    const s = store.getState();
    s.recordInbound(alice.id, "Alice", "troops", 1000);
    s.recordInbound(alice.id, "Alice", "troops", 2000);
    s.recordInbound(alice.id, "Alice", "gold", 500);
    const rec = store.getState().inbound.get(alice.id)!;
    expect(rec.troops).toBe(3000);
    expect(rec.gold).toBe(500);
    expect(rec.count).toBe(3);
  });

  test("full pipeline: findPlayer + recordInbound + feedIn + toast", () => {
    // Simulate what message-processor does for RECEIVED_TROOPS_FROM_PLAYER
    const { playersById } = store.getState();
    const from = findPlayer("Alice", playersById);
    expect(from).not.toBeNull();

    store.getState().recordInbound(from!.id, "Alice", "troops", 8000);
    store.getState().addDonationToast({
      id: Date.now(),
      playerName: "Alice",
      type: "troops",
      amount: 8000,
      direction: "in",
      timestamp: Date.now(),
    });

    const state = store.getState();
    expect(state.inbound.get(from!.id)!.troops).toBe(8000);
    expect(state.feedIn.length).toBe(1);
    expect(state.donationToasts.length).toBe(1);
    expect(state.donationToasts[0].playerName).toBe("Alice");
  });
});
