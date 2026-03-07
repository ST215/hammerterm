import { describe, expect, test } from "vitest";
import { create } from "zustand";
import {
  createAutoTroopsSlice,
  type AutoTroopsSlice,
} from "../../src/store/slices/auto-troops";

function createTestStore() {
  return create<AutoTroopsSlice>()(createAutoTroopsSlice);
}

describe("AutoTroopsSlice", () => {
  // ───────────────────────────────────────────────────────
  // Default state
  // ───────────────────────────────────────────────────────
  test("default asTroopsRunning is false", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsRunning).toBe(false);
  });

  test("default asTroopsRatio is 20", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsRatio).toBe(20);
  });

  test("default asTroopsThreshold is 50", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsThreshold).toBe(50);
  });

  test("default asTroopsCooldownSec is 10", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsCooldownSec).toBe(10);
  });

  test("default asTroopsAllTeamMode is false", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsAllTeamMode).toBe(false);
  });

  // ───────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────
  test("setAsTroopsRatio updates ratio", () => {
    const store = createTestStore();
    store.getState().setAsTroopsRatio(50);
    expect(store.getState().asTroopsRatio).toBe(50);
  });

  test("setAsTroopsThreshold updates threshold", () => {
    const store = createTestStore();
    store.getState().setAsTroopsThreshold(75);
    expect(store.getState().asTroopsThreshold).toBe(75);
  });

  test("addAsTroopsTarget adds a target", () => {
    const store = createTestStore();
    store.getState().addAsTroopsTarget("42", "Alice");
    expect(store.getState().asTroopsTargets).toContainEqual({ id: "42", name: "Alice" });
  });

  test("removeAsTroopsTarget removes by id", () => {
    const store = createTestStore();
    store.getState().addAsTroopsTarget("42", "Alice");
    store.getState().addAsTroopsTarget("99", "Bob");
    store.getState().removeAsTroopsTarget("42");
    expect(store.getState().asTroopsTargets.find((t) => t.id === "42")).toBeUndefined();
    expect(store.getState().asTroopsTargets.find((t) => t.id === "99")).toBeDefined();
  });

  test("toggleAsTroopsAllTeamMode flips", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsAllTeamMode).toBe(false);
    store.getState().toggleAsTroopsAllTeamMode();
    expect(store.getState().asTroopsAllTeamMode).toBe(true);
    store.getState().toggleAsTroopsAllTeamMode();
    expect(store.getState().asTroopsAllTeamMode).toBe(false);
  });

  test("addAsTroopsLog adds entry", () => {
    const store = createTestStore();
    store.getState().addAsTroopsLog({ ts: Date.now(), target: "Alice", amount: 1000 });
    expect(store.getState().asTroopsLog.length).toBe(1);
    expect(store.getState().asTroopsLog[0].target).toBe("Alice");
  });

  // ───────────────────────────────────────────────────────
  // Target selection mode transitions
  // ───────────────────────────────────────────────────────
  test("toggleAllTeamMode ON clears manual targets", () => {
    const store = createTestStore();
    store.getState().addAsTroopsTarget("p1", "Alice");
    store.getState().addAsTroopsTarget("p2", "Bob");
    expect(store.getState().asTroopsTargets.length).toBe(2);

    store.getState().toggleAsTroopsAllTeamMode();
    expect(store.getState().asTroopsAllTeamMode).toBe(true);
    expect(store.getState().asTroopsTargets.length).toBe(0);
  });

  test("toggleAllTeamMode OFF preserves empty targets", () => {
    const store = createTestStore();
    store.getState().toggleAsTroopsAllTeamMode(); // ON
    store.getState().toggleAsTroopsAllTeamMode(); // OFF
    expect(store.getState().asTroopsAllTeamMode).toBe(false);
    expect(store.getState().asTroopsTargets.length).toBe(0);
  });

  test("toggleAllAlliesMode ON clears manual targets", () => {
    const store = createTestStore();
    store.getState().addAsTroopsTarget("p1", "Alice");
    store.getState().toggleAsTroopsAllAlliesMode();
    expect(store.getState().asTroopsAllAlliesMode).toBe(true);
    expect(store.getState().asTroopsTargets.length).toBe(0);
  });

  test("addTarget clears group modes", () => {
    const store = createTestStore();
    store.getState().toggleAsTroopsAllTeamMode();
    store.getState().toggleAsTroopsAllAlliesMode();
    expect(store.getState().asTroopsAllTeamMode).toBe(true);
    expect(store.getState().asTroopsAllAlliesMode).toBe(true);

    store.getState().addAsTroopsTarget("p1", "Alice");
    expect(store.getState().asTroopsAllTeamMode).toBe(false);
    expect(store.getState().asTroopsAllAlliesMode).toBe(false);
    expect(store.getState().asTroopsTargets.length).toBe(1);
  });

  test("addTarget does not duplicate existing target", () => {
    const store = createTestStore();
    store.getState().addAsTroopsTarget("p1", "Alice");
    store.getState().addAsTroopsTarget("p1", "Alice");
    expect(store.getState().asTroopsTargets.length).toBe(1);
  });

  test("asTroopsLog capped at 50", () => {
    const store = createTestStore();
    for (let i = 0; i < 60; i++) {
      store.getState().addAsTroopsLog({ ts: Date.now(), target: `Player${i}`, amount: i * 100 });
    }
    expect(store.getState().asTroopsLog.length).toBeLessThanOrEqual(50);
  });

  test("setAsTroopsRunning changes running state", () => {
    const store = createTestStore();
    expect(store.getState().asTroopsRunning).toBe(false);
    store.getState().setAsTroopsRunning(true);
    expect(store.getState().asTroopsRunning).toBe(true);
    store.getState().setAsTroopsRunning(false);
    expect(store.getState().asTroopsRunning).toBe(false);
  });
});
