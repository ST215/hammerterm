import { describe, expect, test } from "vitest";
import { PersistedStateSchema, PERSIST_KEYS, DisplayEventSchema } from "../src/shared/schemas";

// PersistedStateSchema — config-only persistence (v15.16.0+).
describe("PersistedStateSchema", () => {
  test("accepts empty object (all defaults)", () => {
    const result = PersistedStateSchema.parse({});
    expect(result.reciprocateAutoPct).toBe(50);
    expect(result.reciprocateOnTroops).toBe(true);
    expect(result.reciprocateOnGold).toBe(true);
    expect(result.asTroopsRatio).toBe(20);
    expect(result.asTroopsThreshold).toBe(50);
    expect(result.asTroopsCooldownSec).toBe(10);
    expect(result.asGoldRatio).toBe(25);
    expect(result.asGoldCooldownSec).toBe(10);
    expect(result.ciaWindowMs).toBe(60000);
    expect(result.ciaFeedFilter).toBe("all");
    expect(result.sizeIdx).toBe(1);
    // Thank-you config persists; default off, heart mode
    expect(result.thankEnabled).toBe(false);
    expect(result.thankMode).toBe("emoji");
  });

  test("accepts valid partial state, defaults fill the rest", () => {
    const result = PersistedStateSchema.parse({
      asTroopsRatio: 50,
      thankMode: "quickchat",
    });
    expect(result.asTroopsRatio).toBe(50);
    expect(result.thankMode).toBe("quickchat");
    expect(result.asGoldRatio).toBe(25); // default still applied
  });

  test("validates thankMode enum (emoji/quickchat)", () => {
    expect(() => PersistedStateSchema.parse({ thankMode: "nope" })).toThrow();
    expect(PersistedStateSchema.parse({ thankMode: "emoji" }).thankMode).toBe("emoji");
    expect(PersistedStateSchema.parse({ thankMode: "quickchat" }).thankMode).toBe("quickchat");
  });

  test("validates ciaFeedFilter enum", () => {
    expect(() => PersistedStateSchema.parse({ ciaFeedFilter: "nope" })).toThrow();
    expect(PersistedStateSchema.parse({ ciaFeedFilter: "gold" }).ciaFeedFilter).toBe("gold");
  });

  test("PERSIST_KEYS matches the schema shape", () => {
    const shapeKeys = Object.keys(PersistedStateSchema.shape).sort();
    expect([...PERSIST_KEYS].sort()).toEqual(shapeKeys);
  });

  test("PERSIST_KEYS excludes live automation toggles & presentation", () => {
    // These must never persist — automation must not silently resume and the
    // overlay must always reopen as the disguised card. reciprocateMode is now
    // here too: it's a live send toggle that must reset to manual each match.
    for (const forbidden of [
      "asTroopsRunning", "asGoldRunning", "reciprocateEnabled", "reciprocateMode",
      "broadcastEnabled", "recorderOn", "inGameView", "externalOpen", "paused",
      "isReplay",
    ]) {
      expect(PERSIST_KEYS).not.toContain(forbidden);
    }
  });

  test("popup/notification config keys persist", () => {
    for (const key of [
      "popupsEnabled", "growthHudEnabled",
      "reciprocatePosition", "donationPosition", "statusPosition", "growthPosition",
      "toastScale", "statusToastScale",
    ]) {
      expect(PERSIST_KEYS).toContain(key);
    }
  });
});

// DisplayEventSchema
describe("DisplayEventSchema", () => {
  test("accepts valid event", () => {
    const result = DisplayEventSchema.parse({
      messageType: 18,
      playerID: 1,
      params: { name: "Alice", gold: "1000" },
      goldAmount: 1000,
    });
    expect(result.messageType).toBe(18);
    expect(result.playerID).toBe(1);
    expect(result.goldAmount).toBe(1000);
  });

  test("rejects missing messageType", () => {
    expect(() => DisplayEventSchema.parse({})).toThrow();
    expect(() => DisplayEventSchema.parse({ playerID: 1 })).toThrow();
  });
});
