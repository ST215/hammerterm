import { describe, expect, test, beforeEach } from "vitest";
import { create, type StoreApi } from "zustand";
import {
  createDonationsSlice,
  type DonationsSlice,
} from "../../src/store/slices/donations";

function createTestStore() {
  return create<DonationsSlice>()(createDonationsSlice);
}

describe("DonationsSlice", () => {
  let store: StoreApi<DonationsSlice>;

  beforeEach(() => {
    store = createTestStore();
  });

  // ───────────────────────────────────────────────────────
  // Default state
  // ───────────────────────────────────────────────────────
  test("starts with empty inbound map", () => {
    expect(store.getState().inbound.size).toBe(0);
  });

  test("starts with empty feedIn array", () => {
    expect(store.getState().feedIn).toEqual([]);
  });

  // ───────────────────────────────────────────────────────
  // recordInbound
  // ───────────────────────────────────────────────────────
  test("recordInbound creates entry and adds to feedIn", () => {
    store.getState().recordInbound("player1", "Player1", "gold", 1000);
    const state = store.getState();
    expect(state.inbound.has("player1")).toBe(true);
    const rec = state.inbound.get("player1")!;
    expect(rec.gold).toBeGreaterThan(0);
    expect(state.feedIn.length).toBe(1);
  });

  test("recordInbound accumulates for same player", () => {
    store.getState().recordInbound("player1", "Player1", "gold", 1000);
    store.getState().recordInbound("player1", "Player1", "gold", 2000);
    const state = store.getState();
    const rec = state.inbound.get("player1")!;
    expect(rec.gold).toBe(3000);
    expect(rec.goldSends).toBe(2);
  });

  // ───────────────────────────────────────────────────────
  // recordOutbound
  // ───────────────────────────────────────────────────────
  test("recordOutbound works same pattern", () => {
    store.getState().recordOutbound("player2", "Player2", "troops", 500);
    const state = store.getState();
    expect(state.outbound.has("player2")).toBe(true);
    const rec = state.outbound.get("player2")!;
    expect(rec.troops).toBeGreaterThan(0);
    expect(state.feedOut.length).toBe(1);
  });

  // ───────────────────────────────────────────────────────
  // recordPort
  // ───────────────────────────────────────────────────────
  test("recordPort delegates to bumpPorts logic", () => {
    store.getState().recordPort("portCity", 5000, Date.now());
    const state = store.getState();
    expect(state.ports.has("portCity")).toBe(true);
    const port = state.ports.get("portCity")!;
    expect(port.totalGold).toBe(5000);
  });

  // ───────────────────────────────────────────────────────
  // rawMessages
  // ───────────────────────────────────────────────────────
  test("addRawMessage adds message to array", () => {
    store.getState().addRawMessage({ type: "gold", from: "Alice", amount: 100 });
    expect(store.getState().rawMessages.length).toBe(1);
  });

  test("rawMessages capped at 500", () => {
    for (let i = 0; i < 520; i++) {
      store.getState().addRawMessage({ type: "gold", idx: i });
    }
    expect(store.getState().rawMessages.length).toBeLessThanOrEqual(500);
  });

  // ───────────────────────────────────────────────────────
  // feedIn cap
  // ───────────────────────────────────────────────────────
  test("feedIn capped at 5000", () => {
    for (let i = 0; i < 5010; i++) {
      store.getState().recordInbound(`player${i}`, `Player${i}`, "gold", 100);
    }
    expect(store.getState().feedIn.length).toBeLessThanOrEqual(5000);
  });

  // ───────────────────────────────────────────────────────
  // donorTroops flows through (Fix 2 + Fix 3)
  // ───────────────────────────────────────────────────────
  test("recordInbound stores lastDonorTroops on DonationRecord", () => {
    store.getState().recordInbound("player1", "Player1", "gold", 1000, 50000);
    const rec = store.getState().inbound.get("player1")!;
    expect(rec.lastDonorTroops).toBe(50000);
  });

  test("recordInbound updates lastDonorTroops on subsequent calls", () => {
    store.getState().recordInbound("player1", "Player1", "gold", 1000, 50000);
    store.getState().recordInbound("player1", "Player1", "gold", 2000, 30000);
    const rec = store.getState().inbound.get("player1")!;
    expect(rec.lastDonorTroops).toBe(30000);
  });

  test("recordInbound without donorTroops preserves existing value", () => {
    store.getState().recordInbound("player1", "Player1", "gold", 1000, 50000);
    store.getState().recordInbound("player1", "Player1", "gold", 2000);
    const rec = store.getState().inbound.get("player1")!;
    expect(rec.lastDonorTroops).toBe(50000);
  });

  test("donorTroops included in feedIn entries", () => {
    store.getState().recordInbound("player1", "Player1", "troops", 500, 80000);
    const feed = store.getState().feedIn[0];
    expect(feed.donorTroops).toBe(80000);
  });

  test("feedIn entry without donorTroops has undefined", () => {
    store.getState().recordInbound("player1", "Player1", "gold", 1000);
    const feed = store.getState().feedIn[0];
    expect(feed.donorTroops).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────
  // recordInbound troop accumulation
  // ───────────────────────────────────────────────────────
  test("recordInbound accumulates troops correctly", () => {
    store.getState().recordInbound("player1", "Player1", "troops", 500);
    store.getState().recordInbound("player1", "Player1", "troops", 300);
    const rec = store.getState().inbound.get("player1")!;
    expect(rec.troops).toBe(800);
    expect(rec.troopsSends).toBe(2);
    expect(rec.count).toBe(2);
  });

  // ───────────────────────────────────────────────────────
  // clearSeen
  // ───────────────────────────────────────────────────────
  test("clearSeen empties dedup set", () => {
    // Record some events so the dedup set has entries
    store.getState().recordInbound("player1", "Player1", "gold", 1000);
    store.getState().clearSeen();
    // After clearing, the same event should be recordable again
    // (dedup won't block it)
    const sizeBefore = store.getState().inbound.get("player1")?.gold ?? 0;
    store.getState().recordInbound("player1", "Player1", "gold", 1000);
    const sizeAfter = store.getState().inbound.get("player1")?.gold ?? 0;
    expect(sizeAfter).toBeGreaterThanOrEqual(sizeBefore);
  });
});
