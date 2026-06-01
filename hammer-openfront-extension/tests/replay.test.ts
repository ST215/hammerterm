/**
 * Replay-mode behavior: the isReplay flag must block outbound intents (so we
 * never send into read-only playback) while still allowing data ingestion.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../src/store/index";
import { asSendTroops, asSendGold } from "../src/content/game/send";

describe("replay mode", () => {
  beforeEach(() => {
    useStore.getState().setReplay(false);
  });

  test("isReplay defaults to false and toggles", () => {
    expect(useStore.getState().isReplay).toBe(false);
    useStore.getState().setReplay(true);
    expect(useStore.getState().isReplay).toBe(true);
  });

  test("outbound troop intents are blocked during replay", () => {
    useStore.getState().setReplay(true);
    expect(asSendTroops("p1", 1000)).toBe(false);
  });

  test("outbound gold intents are blocked during replay", () => {
    useStore.getState().setReplay(true);
    expect(asSendGold("p1", 1000)).toBe(false);
  });

  test("resetPlayerState clears replay flag", () => {
    useStore.getState().setReplay(true);
    useStore.getState().resetPlayerState();
    expect(useStore.getState().isReplay).toBe(false);
  });
});
