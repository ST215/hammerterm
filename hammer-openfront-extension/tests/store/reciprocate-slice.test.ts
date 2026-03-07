import { describe, expect, test, beforeEach } from "vitest";
import { create, type StoreApi } from "zustand";
import {
  createReciprocateSlice,
  type ReciprocateSlice,
  type ReciprocateNotification,
} from "../../src/store/slices/reciprocate";

function createTestStore() {
  return create<ReciprocateSlice>()(createReciprocateSlice);
}

describe("ReciprocateSlice", () => {
  let store: StoreApi<ReciprocateSlice>;

  beforeEach(() => {
    store = createTestStore();
  });

  // ───────────────────────────────────────────────────────
  // Default state
  // ───────────────────────────────────────────────────────
  test("defaults: enabled, manual mode, 50%", () => {
    const s = store.getState();
    expect(s.reciprocateEnabled).toBe(true);
    expect(s.reciprocateMode).toBe("manual");
    expect(s.reciprocateAutoPct).toBe(50);
  });

  test("defaults: onTroops true, onGold false", () => {
    const s = store.getState();
    expect(s.reciprocateOnTroops).toBe(true);
    expect(s.reciprocateOnGold).toBe(false);
  });

  // ───────────────────────────────────────────────────────
  // Toggles
  // ───────────────────────────────────────────────────────
  test("toggleReciprocateEnabled flips", () => {
    store.getState().toggleReciprocateEnabled();
    expect(store.getState().reciprocateEnabled).toBe(false);
    store.getState().toggleReciprocateEnabled();
    expect(store.getState().reciprocateEnabled).toBe(true);
  });

  test("setReciprocateMode changes mode", () => {
    store.getState().setReciprocateMode("auto");
    expect(store.getState().reciprocateMode).toBe("auto");
  });

  test("toggleReciprocateOnGold flips", () => {
    store.getState().toggleReciprocateOnGold();
    expect(store.getState().reciprocateOnGold).toBe(true);
  });

  // ───────────────────────────────────────────────────────
  // Notification merging (Fix 1)
  // ───────────────────────────────────────────────────────
  test("addReciprocateNotification creates new for new donor", () => {
    store.getState().addReciprocateNotification({
      id: 1, donorId: "p1", donorName: "Alice",
      troops: 1000, gold: 0, timestamp: 1000, dismissed: false,
    });
    expect(store.getState().reciprocateNotifications.length).toBe(1);
    expect(store.getState().reciprocateNotifications[0].troops).toBe(1000);
  });

  test("addReciprocateNotification merges same donor (undismissed)", () => {
    store.getState().addReciprocateNotification({
      id: 1, donorId: "p1", donorName: "Alice",
      troops: 500, gold: 0, timestamp: 1000, dismissed: false,
    });
    store.getState().addReciprocateNotification({
      id: 2, donorId: "p1", donorName: "Alice",
      troops: 300, gold: 0, timestamp: 2000, dismissed: false,
    });
    const notifs = store.getState().reciprocateNotifications;
    expect(notifs.length).toBe(1);
    expect(notifs[0].troops).toBe(800); // 500 + 300
    expect(notifs[0].timestamp).toBe(2000); // updated
  });

  test("addReciprocateNotification merges gold separately", () => {
    store.getState().addReciprocateNotification({
      id: 1, donorId: "p1", donorName: "Alice",
      troops: 0, gold: 1000, timestamp: 1000, dismissed: false,
    });
    store.getState().addReciprocateNotification({
      id: 2, donorId: "p1", donorName: "Alice",
      troops: 500, gold: 200, timestamp: 2000, dismissed: false,
    });
    const notifs = store.getState().reciprocateNotifications;
    expect(notifs.length).toBe(1);
    expect(notifs[0].troops).toBe(500);
    expect(notifs[0].gold).toBe(1200);
  });

  test("addReciprocateNotification does NOT merge with dismissed", () => {
    store.getState().addReciprocateNotification({
      id: 1, donorId: "p1", donorName: "Alice",
      troops: 500, gold: 0, timestamp: 1000, dismissed: false,
    });
    store.getState().dismissReciprocateNotification(1);
    store.getState().addReciprocateNotification({
      id: 2, donorId: "p1", donorName: "Alice",
      troops: 300, gold: 0, timestamp: 2000, dismissed: false,
    });
    const notifs = store.getState().reciprocateNotifications;
    expect(notifs.length).toBe(2);
    expect(notifs[0].troops).toBe(500); // original unchanged
    expect(notifs[1].troops).toBe(300); // new entry
  });

  test("addReciprocateNotification different donors are separate", () => {
    store.getState().addReciprocateNotification({
      id: 1, donorId: "p1", donorName: "Alice",
      troops: 500, gold: 0, timestamp: 1000, dismissed: false,
    });
    store.getState().addReciprocateNotification({
      id: 2, donorId: "p2", donorName: "Bob",
      troops: 300, gold: 0, timestamp: 2000, dismissed: false,
    });
    expect(store.getState().reciprocateNotifications.length).toBe(2);
  });

  test("notification cap at 5 (shifts oldest)", () => {
    for (let i = 0; i < 6; i++) {
      store.getState().addReciprocateNotification({
        id: i, donorId: `p${i}`, donorName: `Player${i}`,
        troops: 100, gold: 0, timestamp: i * 1000, dismissed: false,
      });
    }
    const notifs = store.getState().reciprocateNotifications;
    expect(notifs.length).toBe(5);
    expect(notifs[0].donorId).toBe("p1"); // p0 shifted out
  });

  // ───────────────────────────────────────────────────────
  // Dismiss
  // ───────────────────────────────────────────────────────
  test("dismissReciprocateNotification marks as dismissed", () => {
    store.getState().addReciprocateNotification({
      id: 42, donorId: "p1", donorName: "Alice",
      troops: 1000, gold: 0, timestamp: 1000, dismissed: false,
    });
    store.getState().dismissReciprocateNotification(42);
    expect(store.getState().reciprocateNotifications[0].dismissed).toBe(true);
  });

  test("dismiss wrong ID does nothing", () => {
    store.getState().addReciprocateNotification({
      id: 42, donorId: "p1", donorName: "Alice",
      troops: 1000, gold: 0, timestamp: 1000, dismissed: false,
    });
    store.getState().dismissReciprocateNotification(999);
    expect(store.getState().reciprocateNotifications[0].dismissed).toBe(false);
  });

  // ───────────────────────────────────────────────────────
  // History
  // ───────────────────────────────────────────────────────
  test("addReciprocateHistory prepends and caps at 100", () => {
    for (let i = 0; i < 110; i++) {
      store.getState().addReciprocateHistory({
        donorId: `p${i}`, donorName: `Player${i}`,
        percentage: 50, timestamp: i, mode: "auto",
      });
    }
    const history = store.getState().reciprocateHistory;
    expect(history.length).toBe(100);
    expect(history[0].donorName).toBe("Player109"); // most recent first
  });

  // ───────────────────────────────────────────────────────
  // Clear
  // ───────────────────────────────────────────────────────
  test("clearReciprocateNotifications empties array", () => {
    store.getState().addReciprocateNotification({
      id: 1, donorId: "p1", donorName: "Alice",
      troops: 1000, gold: 0, timestamp: 1000, dismissed: false,
    });
    store.getState().clearReciprocateNotifications();
    expect(store.getState().reciprocateNotifications.length).toBe(0);
  });
});
