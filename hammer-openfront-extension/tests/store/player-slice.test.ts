import { describe, expect, test, beforeEach } from "vitest";
import { create, type StoreApi } from "zustand";
import {
  createPlayerSlice,
  type PlayerSlice,
} from "../../src/store/slices/player";
import type { PlayerData } from "../../src/shared/types";

function createTestStore() {
  return create<PlayerSlice>()(createPlayerSlice);
}

function makePlayer(
  overrides: Partial<PlayerData> & { id: string },
): PlayerData {
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

describe("PlayerSlice", () => {
  let store: StoreApi<PlayerSlice>;

  beforeEach(() => {
    store = createTestStore();
  });

  // ───────────────────────────────────────────────────────
  // Default state
  // ───────────────────────────────────────────────────────
  test("starts with empty player maps", () => {
    const s = store.getState();
    expect(s.playersById.size).toBe(0);
    expect(s.playersBySmallId.size).toBe(0);
    expect(s.lastPlayers).toEqual([]);
  });

  test("mySmallID starts null", () => {
    expect(store.getState().mySmallID).toBeNull();
  });

  test("playerDataReady starts false", () => {
    expect(store.getState().playerDataReady).toBe(false);
  });

  // ───────────────────────────────────────────────────────
  // setPlayers
  // ───────────────────────────────────────────────────────
  test("setPlayers populates both maps and lastPlayers", () => {
    const alice = makePlayer({
      id: "p1",
      smallID: 1,
      displayName: "Alice",
      team: 1,
    });
    const bob = makePlayer({
      id: "p2",
      smallID: 2,
      displayName: "Bob",
      team: 1,
    });

    const byId = new Map<string, PlayerData>([
      ["p1", alice],
      ["p2", bob],
    ]);
    const bySmallId = new Map<number, PlayerData>([
      [1, alice],
      [2, bob],
    ]);
    const list = [alice, bob];

    store.getState().setPlayers(byId, bySmallId, list);

    const s = store.getState();
    expect(s.playersById.size).toBe(2);
    expect(s.playersBySmallId.size).toBe(2);
    expect(s.lastPlayers.length).toBe(2);
    expect(s.playersById.get("p1")?.displayName).toBe("Alice");
    expect(s.playersBySmallId.get(2)?.displayName).toBe("Bob");
  });

  // ───────────────────────────────────────────────────────
  // setMyIdentity
  // ───────────────────────────────────────────────────────
  test("setMyIdentity updates mySmallID, myTeam, currentClientID", () => {
    store.getState().setMyIdentity(5, 2);
    store.getState().setCurrentClientID("client-abc");

    const s = store.getState();
    expect(s.mySmallID).toBe(5);
    expect(s.myTeam).toBe(2);
    expect(s.currentClientID).toBe("client-abc");
  });

  // ───────────────────────────────────────────────────────
  // updateAllies
  // ───────────────────────────────────────────────────────
  test("updateAllies sets myAllies", () => {
    const allies = new Set([3, 7, 12]);
    store.getState().updateAllies(allies);
    const s = store.getState();
    expect(s.myAllies.size).toBe(3);
    expect(s.myAllies.has(3)).toBe(true);
    expect(s.myAllies.has(7)).toBe(true);
    expect(s.myAllies.has(12)).toBe(true);
    expect(s.myAllies.has(99)).toBe(false);
  });

  // ───────────────────────────────────────────────────────
  // markPlayerDataReady
  // ───────────────────────────────────────────────────────
  test("markPlayerDataReady sets true", () => {
    expect(store.getState().playerDataReady).toBe(false);
    store.getState().markPlayerDataReady();
    expect(store.getState().playerDataReady).toBe(true);
  });

  // ───────────────────────────────────────────────────────
  // playerSummary
  // ───────────────────────────────────────────────────────
  test("playerSummary reflects player count and names", () => {
    const alice = makePlayer({
      id: "p1",
      smallID: 1,
      displayName: "Alice",
      team: 1,
    });
    const bob = makePlayer({
      id: "p2",
      smallID: 2,
      displayName: "Bob",
      team: 1,
    });
    const eve = makePlayer({
      id: "p3",
      smallID: 3,
      displayName: "Eve",
      team: 2,
    });

    // Set identity first so playerSummary can find myName
    store.getState().setMyIdentity(1, 1);

    const byId = new Map<string, PlayerData>([
      ["p1", alice],
      ["p2", bob],
      ["p3", eve],
    ]);
    const bySmallId = new Map<number, PlayerData>([
      [1, alice],
      [2, bob],
      [3, eve],
    ]);
    const list = [alice, bob, eve];

    store.getState().setPlayers(byId, bySmallId, list);

    const summary = store.getState().playerSummary;
    expect(summary.count).toBe(3);
    expect(summary.names).toContain("Alice");
    expect(summary.names).toContain("Bob");
    expect(summary.names).toContain("Eve");
    expect(summary.myName).toBe("Alice");
  });
});
