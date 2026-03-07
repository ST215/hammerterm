/**
 * Tests for dashboard state sync — verifies that LOCAL_KEYS are excluded
 * from snapshot application and that the serialize round-trip works for
 * store-like state.
 */
import { describe, expect, test } from "vitest";
import { serialize, deserialize } from "../src/shared/serialize";
import type { CIAState } from "../src/shared/types";
import { createCIAState } from "../src/shared/logic/cia";

// Mirror the LOCAL_KEYS set from dashboard/App.tsx
const LOCAL_KEYS = new Set([
  "view", "paused", "minimized", "sizeIdx", "displayMode", "uiVisible",
  "commsTargets", "commsGroupMode", "commsOthersExpanded",
  "commsPendingQC", "commsRecentSent", "allianceCommsExpanded",
  "reciprocateMode", "reciprocateRatio", "reciprocateType",
  "reciprocateEnabled", "reciprocateOnGold", "reciprocateOnTroops",
  "reciprocatePopupsEnabled",
]);

function filterSnapshot(data: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val !== "function" && !LOCAL_KEYS.has(key)) {
      patch[key] = val;
    }
  }
  return patch;
}

describe("dashboard snapshot filtering", () => {
  test("excludes UI navigation keys from snapshot", () => {
    const snapshot = {
      view: "cia",
      paused: true,
      minimized: false,
      displayMode: "window",
      uiVisible: true,
      playersById: new Map([["p1", { name: "Alice" }]]),
      mySmallID: 1,
    };

    const serialized = serialize(snapshot);
    const deserialized = deserialize(serialized);
    const filtered = filterSnapshot(deserialized);

    expect(filtered.view).toBeUndefined();
    expect(filtered.paused).toBeUndefined();
    expect(filtered.minimized).toBeUndefined();
    expect(filtered.displayMode).toBeUndefined();
    expect(filtered.playersById).toBeInstanceOf(Map);
    expect(filtered.mySmallID).toBe(1);
  });

  test("excludes comms selection keys from snapshot", () => {
    const snapshot = {
      commsTargets: new Set(["p1", "p2"]),
      commsGroupMode: "team",
      commsOthersExpanded: true,
      commsPendingQC: { key: "hello", targetId: "" },
      commsRecentSent: [{ type: "emoji", label: "👍", targetName: "Alice", ts: 1000 }],
      allianceCommsExpanded: new Map([["p1", true]]),
      currentClientID: "abc123",
    };

    const serialized = serialize(snapshot);
    const deserialized = deserialize(serialized);
    const filtered = filterSnapshot(deserialized);

    expect(filtered.commsTargets).toBeUndefined();
    expect(filtered.commsGroupMode).toBeUndefined();
    expect(filtered.commsOthersExpanded).toBeUndefined();
    expect(filtered.currentClientID).toBe("abc123");
  });

  test("preserves game data keys in snapshot", () => {
    const snapshot = {
      playersById: new Map([["p1", { id: "p1", name: "Alice", troops: 1000 }]]),
      playersBySmallId: new Map([[1, { id: "p1", name: "Alice", troops: 1000 }]]),
      mySmallID: 1,
      myTeam: 2,
      myAllies: new Set([3, 4]),
      inbound: new Map([["p2", { gold: 500, troops: 0, count: 1 }]]),
      asTroopsRunning: true,
      asGoldRunning: false,
      ciaState: createCIAState(),
    };

    const serialized = serialize(snapshot);
    const deserialized = deserialize(serialized);
    const filtered = filterSnapshot(deserialized);

    expect(filtered.playersById).toBeInstanceOf(Map);
    expect(filtered.mySmallID).toBe(1);
    expect(filtered.myTeam).toBe(2);
    expect(filtered.myAllies).toBeInstanceOf(Set);
    expect(filtered.myAllies.has(3)).toBe(true);
    expect(filtered.inbound).toBeInstanceOf(Map);
    expect(filtered.asTroopsRunning).toBe(true);
    expect(filtered.asGoldRunning).toBe(false);
  });

  test("excludes reciprocate config keys from snapshot", () => {
    const snapshot = {
      reciprocateMode: "auto",
      reciprocateRatio: 50,
      reciprocateType: "gold",
      reciprocateEnabled: true,
      reciprocateOnGold: true,
      reciprocateOnTroops: false,
      reciprocatePopupsEnabled: true,
      mySmallID: 1,
      currentClientID: "abc123",
    };

    const serialized = serialize(snapshot);
    const deserialized = deserialize(serialized);
    const filtered = filterSnapshot(deserialized);

    expect(filtered.reciprocateMode).toBeUndefined();
    expect(filtered.reciprocateRatio).toBeUndefined();
    expect(filtered.reciprocateType).toBeUndefined();
    expect(filtered.reciprocateEnabled).toBeUndefined();
    expect(filtered.mySmallID).toBe(1);
    expect(filtered.currentClientID).toBe("abc123");
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
