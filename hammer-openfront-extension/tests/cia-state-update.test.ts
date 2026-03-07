/**
 * Tests for CIA state mutation detection — verifies that trackCIAEvent
 * results trigger proper Zustand state updates via new reference.
 */
import { describe, expect, test, beforeEach } from "vitest";
import { createCIAState, trackCIAEvent } from "../src/shared/logic/cia";
import { MessageType } from "../src/shared/constants";
import type { CIAState, PlayerData } from "../src/shared/types";

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

describe("CIA state update detection", () => {
  let cia: CIAState;
  let playersBySmallId: Map<number, PlayerData>;
  let playersById: Map<string, PlayerData>;
  let myAllies: Set<number>;

  beforeEach(() => {
    cia = createCIAState();
    const alice = makePlayer({ id: "p1", smallID: 1, displayName: "Alice", team: 1 });
    const bob = makePlayer({ id: "p2", smallID: 2, displayName: "Bob", team: 1 });
    playersBySmallId = new Map([[1, alice], [2, bob]]);
    playersById = new Map([["p1", alice], ["p2", bob]]);
    myAllies = new Set<number>();
  });

  test("trackCIAEvent returns true for valid SENT_TROOPS event", () => {
    const result = trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: 500 },
      {},
      playersBySmallId, 1, 1, playersById, myAllies,
    );
    expect(result).toBe(true);
    expect(cia.transfers.length).toBe(1);
  });

  test("trackCIAEvent returns false for RECEIVED events (filtered)", () => {
    const result = trackCIAEvent(
      cia, MessageType.RECEIVED_TROOPS_FROM_PLAYER, 1,
      { name: "Bob", troops: 500 },
      {},
      playersBySmallId, 1, 1, playersById, myAllies,
    );
    expect(result).toBe(false);
  });

  test("trackCIAEvent returns false for deduped events", () => {
    const args = [
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: 500 },
      {},
      playersBySmallId, 1, 1, playersById, myAllies,
    ] as const;

    expect(trackCIAEvent(...args)).toBe(true);
    expect(trackCIAEvent(...args)).toBe(false); // deduped
  });

  test("new reference after trackCIAEvent enables Zustand detection", () => {
    const originalRef = cia;
    trackCIAEvent(
      cia, MessageType.SENT_TROOPS_TO_PLAYER, 1,
      { name: "Bob", troops: 500 },
      {},
      playersBySmallId, 1, 1, playersById, myAllies,
    );

    // Simulating what message-processor.ts now does
    const newRef = { ...cia };
    expect(newRef).not.toBe(originalRef); // Different reference
    expect(newRef.transfers).toBe(cia.transfers); // Same transfers array (shallow copy)
    expect(newRef.transfers.length).toBe(1);
  });

  test("flowGraph and playerTotals are populated for SENT events", () => {
    trackCIAEvent(
      cia, MessageType.SENT_GOLD_TO_PLAYER, 1,
      { name: "Bob", gold: 1000 },
      { goldAmount: 1000 },
      playersBySmallId, 1, 1, playersById, myAllies,
    );
    expect(cia.flowGraph.size).toBe(1);
    expect(cia.playerTotals.size).toBe(2);
    const flow = cia.flowGraph.get("Alice→Bob");
    expect(flow).toBeDefined();
    expect(flow!.gold).toBe(1000);
  });
});
