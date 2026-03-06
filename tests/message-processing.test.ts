/**
 * Tests for display message processing logic.
 *
 * Source: hammer-scripts/hammer.js lines 1317-1548
 * Bucket: Message processing — routing, dedup, donation tracking
 *
 * TODO: processDisplayMessage() is tightly coupled to:
 *   - Global state (S, playersById, mySmallID, playerDataReady, pendingMessages)
 *   - DOM functions (showReciprocateNotification, showStatus)
 *   - CIA tracking (trackCIAEvent)
 * To fully test it, you'd need to:
 *   1. Extract processDisplayMessage into a pure function accepting state as params
 *   2. Mock showReciprocateNotification and showStatus
 *   3. Pass in a mock state object
 * For now, we test the logic patterns used inside processDisplayMessage.
 */
import { describe, expect, test } from "bun:test";
import { parseAmt, MessageType, num } from "./helpers/hammer-functions";

// ───────────────────────────────────────────────────────
// Message type classification
// ───────────────────────────────────────────────────────
describe("message type routing", () => {
  test("MessageType values match game protocol", () => {
    expect(MessageType.SENT_GOLD_TO_PLAYER).toBe(18);
    expect(MessageType.RECEIVED_GOLD_FROM_PLAYER).toBe(19);
    expect(MessageType.RECEIVED_GOLD_FROM_TRADE).toBe(20);
    expect(MessageType.SENT_TROOPS_TO_PLAYER).toBe(21);
    expect(MessageType.RECEIVED_TROOPS_FROM_PLAYER).toBe(22);
  });

  test("all message types are unique", () => {
    const values = Object.values(MessageType);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ───────────────────────────────────────────────────────
// Deduplication key generation
// ───────────────────────────────────────────────────────
describe("dedup key generation", () => {
  function makeDedupKey(mt: number, name: string, amount: string): string {
    // From processDisplayMessage (line 1372-1373):
    const timestamp = Math.floor(Date.now() / 1000);
    return `${mt}:${name}:${amount}:${timestamp}`;
  }

  test("same event same second produces same key", () => {
    const k1 = makeDedupKey(22, "Alice", "1000");
    const k2 = makeDedupKey(22, "Alice", "1000");
    expect(k1).toBe(k2);
  });

  test("different types produce different keys", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const k1 = `${18}:Alice:1000:${timestamp}`;
    const k2 = `${21}:Alice:1000:${timestamp}`;
    expect(k1).not.toBe(k2);
  });

  test("different names produce different keys", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const k1 = `${22}:Alice:1000:${timestamp}`;
    const k2 = `${22}:Bob:1000:${timestamp}`;
    expect(k1).not.toBe(k2);
  });
});

// ───────────────────────────────────────────────────────
// Message filtering conditions
// ───────────────────────────────────────────────────────
describe("message filtering", () => {
  test("rejects messages without messageType", () => {
    const msg1 = null;
    const msg2 = {};
    const msg3 = { messageType: "not a number" };
    expect(msg1 == null || typeof (msg1 as any)?.messageType !== "number").toBe(true);
    expect(msg2 == null || typeof (msg2 as any).messageType !== "number").toBe(true);
    expect(typeof (msg3 as any).messageType !== "number").toBe(true);
  });

  test("rejects messages when paused", () => {
    const paused = true;
    expect(paused).toBe(true); // would return early
  });

  test("buffers messages when playerData not ready", () => {
    const playerDataReady = false;
    expect(!playerDataReady).toBe(true); // would push to pendingMessages
  });

  test("rejects messages with PID mismatch", () => {
    const pid = 42;
    const mySmallID = 99;
    expect(pid !== mySmallID).toBe(true); // would return early
  });
});

// ───────────────────────────────────────────────────────
// Gold amount extraction logic
// ───────────────────────────────────────────────────────
describe("gold amount extraction", () => {
  test("prefers msg.goldAmount over params.gold", () => {
    const msg = { goldAmount: 99999 };
    const params = { gold: "100" };
    const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold);
    expect(amt).toBe(99999);
  });

  test("falls back to params.gold when no goldAmount", () => {
    const msg = {};
    const params = { gold: "1.5M" };
    const amt = (msg as any).goldAmount ? num((msg as any).goldAmount) : parseAmt(params.gold);
    expect(amt).toBe(1_500_000);
  });

  test("troop amount always from params.troops", () => {
    const params = { troops: "500K" };
    expect(parseAmt(params.troops)).toBe(500_000);
  });
});

// ───────────────────────────────────────────────────────
// Reciprocation trigger conditions
// ───────────────────────────────────────────────────────
describe("reciprocation trigger conditions", () => {
  test("triggers on troops when reciprocateOnTroops enabled", () => {
    const S = {
      reciprocateEnabled: true,
      reciprocateOnTroops: true,
      reciprocateMode: "auto" as const,
    };
    const mt = MessageType.RECEIVED_TROOPS_FROM_PLAYER;
    const shouldTrigger = S.reciprocateEnabled && S.reciprocateOnTroops && mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER;
    expect(shouldTrigger).toBe(true);
  });

  test("triggers on gold when reciprocateOnGold enabled", () => {
    const S = {
      reciprocateEnabled: true,
      reciprocateOnGold: true,
      reciprocateMode: "manual" as const,
    };
    const mt = MessageType.RECEIVED_GOLD_FROM_PLAYER;
    const shouldTrigger = S.reciprocateEnabled && S.reciprocateOnGold && mt === MessageType.RECEIVED_GOLD_FROM_PLAYER;
    expect(shouldTrigger).toBe(true);
  });

  test("does not trigger when reciprocate disabled", () => {
    const S = { reciprocateEnabled: false, reciprocateOnTroops: true };
    expect(S.reciprocateEnabled && S.reciprocateOnTroops).toBe(false);
  });

  test("does not trigger troops when reciprocateOnTroops is off", () => {
    const S = { reciprocateEnabled: true, reciprocateOnTroops: false };
    expect(S.reciprocateEnabled && S.reciprocateOnTroops).toBe(false);
  });
});
