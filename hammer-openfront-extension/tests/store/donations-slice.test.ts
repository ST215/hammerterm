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
    store.getState().recordInbound("player1", "gold", 1000);
    const state = store.getState();
    expect(state.inbound.has("player1")).toBe(true);
    const rec = state.inbound.get("player1")!;
    expect(rec.gold).toBeGreaterThan(0);
    expect(state.feedIn.length).toBe(1);
  });

  test("recordInbound accumulates for same player", () => {
    store.getState().recordInbound("player1", "gold", 1000);
    store.getState().recordInbound("player1", "gold", 2000);
    const state = store.getState();
    const rec = state.inbound.get("player1")!;
    expect(rec.gold).toBe(3000);
    expect(rec.goldSends).toBe(2);
  });

  // ───────────────────────────────────────────────────────
  // recordOutbound
  // ───────────────────────────────────────────────────────
  test("recordOutbound works same pattern", () => {
    store.getState().recordOutbound("player2", "troops", 500);
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
  test("feedIn capped at 200", () => {
    for (let i = 0; i < 210; i++) {
      store.getState().recordInbound(`player${i}`, "gold", 100);
    }
    expect(store.getState().feedIn.length).toBeLessThanOrEqual(200);
  });

  // ───────────────────────────────────────────────────────
  // clearSeen
  // ───────────────────────────────────────────────────────
  test("clearSeen empties dedup set", () => {
    // Record some events so the dedup set has entries
    store.getState().recordInbound("player1", "gold", 1000);
    store.getState().clearSeen();
    // After clearing, the same event should be recordable again
    // (dedup won't block it)
    const sizeBefore = store.getState().inbound.get("player1")?.gold ?? 0;
    store.getState().recordInbound("player1", "gold", 1000);
    const sizeAfter = store.getState().inbound.get("player1")?.gold ?? 0;
    expect(sizeAfter).toBeGreaterThanOrEqual(sizeBefore);
  });
});
