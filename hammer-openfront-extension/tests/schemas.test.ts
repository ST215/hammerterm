import { describe, expect, test } from "vitest";
import { PersistedStateSchema, DisplayEventSchema } from "../src/shared/schemas";

// PersistedStateSchema
describe("PersistedStateSchema", () => {
  test("accepts empty object (all defaults)", () => {
    const result = PersistedStateSchema.parse({});
    expect(result.reciprocateEnabled).toBe(false);
    expect(result.reciprocateOnTroops).toBe(true);
    expect(result.reciprocateOnGold).toBe(true);
    expect(result.reciprocateMode).toBe("manual");
    expect(result.reciprocatePercent).toBe(50);
    expect(result.reciprocateNotifyDuration).toBe(10);
    expect(result.asTroopsEnabled).toBe(false);
    expect(result.asTroopsRatio).toBe(20);
    expect(result.asTroopsThreshold).toBe(50);
    expect(result.asTroopsCooldown).toBe(10);
    expect(result.asGoldEnabled).toBe(false);
    expect(result.asGoldRatio).toBe(25);
    expect(result.asGoldCooldown).toBe(10);
    expect(result.ciaEnabled).toBe(true);
    expect(result.logLevel).toBe(0);
    expect(result.panelSize).toBe(1);
    expect(result.panelVisible).toBe(true);
  });

  test("accepts valid partial state", () => {
    const result = PersistedStateSchema.parse({
      reciprocateEnabled: true,
      asTroopsRatio: 50,
      reciprocateMode: "auto",
    });
    expect(result.reciprocateEnabled).toBe(true);
    expect(result.asTroopsRatio).toBe(50);
    expect(result.reciprocateMode).toBe("auto");
    // defaults still applied for missing fields
    expect(result.asGoldEnabled).toBe(false);
  });

  test("rejects invalid asTroopsRatio (>100)", () => {
    expect(() => PersistedStateSchema.parse({ asTroopsRatio: 101 })).toThrow();
  });

  test("rejects invalid asTroopsRatio (<1)", () => {
    expect(() => PersistedStateSchema.parse({ asTroopsRatio: 0 })).toThrow();
  });

  test("validates reciprocateMode enum", () => {
    expect(() => PersistedStateSchema.parse({ reciprocateMode: "invalid" })).toThrow();
    const manual = PersistedStateSchema.parse({ reciprocateMode: "manual" });
    expect(manual.reciprocateMode).toBe("manual");
    const auto = PersistedStateSchema.parse({ reciprocateMode: "auto" });
    expect(auto.reciprocateMode).toBe("auto");
  });

  test("all defaults match expected values", () => {
    const defaults = PersistedStateSchema.parse({});
    expect(defaults).toEqual({
      reciprocateEnabled: false,
      reciprocateOnTroops: true,
      reciprocateOnGold: true,
      reciprocateMode: "manual",
      reciprocatePercent: 50,
      reciprocateNotifyDuration: 10,
      asTroopsEnabled: false,
      asTroopsRatio: 20,
      asTroopsThreshold: 50,
      asTroopsCooldown: 10,
      asGoldEnabled: false,
      asGoldRatio: 25,
      asGoldCooldown: 10,
      ciaEnabled: true,
      logLevel: 0,
      panelSize: 1,
      panelVisible: true,
    });
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
