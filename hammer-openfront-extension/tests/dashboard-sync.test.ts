/**
 * Dashboard (external window) ↔ game tab sync rules — exercised through the
 * real shared module the window uses (src/shared/dashboard-sync.ts).
 */
import { describe, expect, test } from "vitest";
import { serialize, deserialize } from "../src/shared/serialize";
import type { CIAState } from "../src/shared/types";
import { createCIAState } from "../src/shared/logic/cia";
import {
  LOCAL_KEYS,
  MATCH_SCOPED_KEYS,
  TOUCH_GUARD_MS,
  WINDOW_ONLY_KEYS,
  filterSnapshotPatch,
} from "../src/shared/dashboard-sync";

const NOW = 1_000_000;

describe("snapshot adoption", () => {
  test("window-only presentation & in-progress selections are never adopted", () => {
    const patch = filterSnapshotPatch(
      {
        view: "cia",
        paused: true,
        sizeIdx: 2,
        inGameView: "revealed",
        externalOpen: true,
        commsTargets: new Set(["p1"]),
        commsActiveBatch: { label: "x", sent: 1, total: 2 },
      },
      new Map(),
      NOW,
    );
    expect(patch).toEqual({});
  });

  test("game data is adopted", () => {
    const patch = filterSnapshotPatch(
      { mySmallID: 1, currentClientID: "abc", attackRatioTelemetry: null },
      new Map(),
      NOW,
    );
    expect(patch).toEqual({ mySmallID: 1, currentClientID: "abc", attackRatioTelemetry: null });
  });

  test("settings the game tab owns ARE adopted, so the window opens on your real config", () => {
    const patch = filterSnapshotPatch(
      { attackRatioRunning: true, attackRatioMaxCap: 25, commsPaceMs: 10000, reciprocateMode: "manual" },
      new Map(),
      NOW,
    );
    expect(patch).toEqual({
      attackRatioRunning: true,
      attackRatioMaxCap: 25,
      commsPaceMs: 10000,
      reciprocateMode: "manual",
    });
  });

  test("a setting edited here within the guard window isn't reverted by a stale snapshot", () => {
    const touched = new Map([["attackRatioRunning", NOW - 100]]);
    const patch = filterSnapshotPatch({ attackRatioRunning: false, attackRatioMaxCap: 25 }, touched, NOW);
    expect(patch).toEqual({ attackRatioMaxCap: 25 });
  });

  test("once the guard expires the game tab's value wins again", () => {
    const touched = new Map([["attackRatioRunning", NOW - TOUCH_GUARD_MS - 1]]);
    const patch = filterSnapshotPatch({ attackRatioRunning: false }, touched, NOW);
    expect(patch).toEqual({ attackRatioRunning: false });
  });

  test("functions are dropped", () => {
    expect(filterSnapshotPatch({ setX: () => {} }, new Map(), NOW)).toEqual({});
  });

  test("every window-only key is also a LOCAL_KEY (edits still push to the game tab)", () => {
    for (const key of WINDOW_ONLY_KEYS) expect(LOCAL_KEYS.has(key), key).toBe(true);
  });

  test("match-scoped sending toggles are never replayed into the next match", () => {
    for (const key of ["asTroopsRunning", "asGoldRunning", "broadcastEnabled", "reciprocateMode"]) {
      expect(MATCH_SCOPED_KEYS.has(key), key).toBe(true);
    }
    // ...but the governor (sends nothing, persisted) and settings are.
    expect(MATCH_SCOPED_KEYS.has("attackRatioRunning")).toBe(false);
    expect(MATCH_SCOPED_KEYS.has("commsPaceMs")).toBe(false);
  });

  test("new governor, pace and alert settings are synced keys", () => {
    for (const key of [
      "attackRatioRunning", "attackRatioMode", "attackRatioMaxCap",
      "commsPaceMs", "commsPaceHuman", "donationAlertsEnabled",
    ]) {
      expect(LOCAL_KEYS.has(key), key).toBe(true);
      expect(WINDOW_ONLY_KEYS.has(key), key).toBe(false);
    }
  });
});

describe("serialize round-trip (snapshots and sync-local)", () => {
  test("Sets/Maps survive — sync-local edits used to arrive as {}", () => {
    const edits = {
      commsTargets: new Set(["p1", "p2"]),
      allianceCommsExpanded: new Map([["p1", true]]),
    };
    // Chrome port messages are JSON; mirror that.
    const wire = JSON.parse(JSON.stringify(serialize(edits)));
    const back = deserialize(wire);
    expect(back.commsTargets).toBeInstanceOf(Set);
    expect([...back.commsTargets]).toEqual(["p1", "p2"]);
    expect(back.allianceCommsExpanded).toBeInstanceOf(Map);
    expect(back.allianceCommsExpanded.get("p1")).toBe(true);
  });

  test("CIA state with Maps/Sets round-trips correctly", () => {
    const cia: CIAState = createCIAState();
    cia.transfers.push({
      ts: 1000, type: "gold", dir: "sent", actorPID: 1,
      actorName: "Alice", otherName: "Bob",
      senderName: "Alice", receiverName: "Bob", amount: 500,
    });
    cia.flowGraph.set("Alice→Bob", {
      gold: 500, troops: 0, goldCount: 1, troopsCount: 0,
      lastTs: 1000, sender: "Alice", receiver: "Bob",
    });
    cia.playerTotals.set("Alice", {
      sentGold: 500, sentTroops: 0, recvGold: 0, recvTroops: 0,
      sentCount: 1, recvCount: 0,
    });
    cia.seen.add("gold:Alice:Bob:500:0");

    const result = deserialize(serialize({ ciaState: cia }));
    const restored = result.ciaState;

    expect(restored.transfers).toHaveLength(1);
    expect(restored.transfers[0].senderName).toBe("Alice");
    expect(restored.flowGraph).toBeInstanceOf(Map);
    expect(restored.flowGraph.get("Alice→Bob").gold).toBe(500);
    expect(restored.playerTotals).toBeInstanceOf(Map);
    expect(restored.playerTotals.get("Alice").sentGold).toBe(500);
    expect(restored.seen).toBeInstanceOf(Set);
    expect(restored.seen.has("gold:Alice:Bob:500:0")).toBe(true);
  });
});
