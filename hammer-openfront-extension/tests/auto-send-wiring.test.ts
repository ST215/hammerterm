/**
 * Tests for auto-send start/stop wiring — verifies that the automation
 * engines properly start intervals and update store state.
 */
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { useStore } from "../src/store/index";

// Mock the send functions so they don't try to postMessage
vi.mock("../src/content/game/send", () => ({
  asSendTroops: vi.fn(() => true),
  asSendGold: vi.fn(() => true),
}));

// Mock registerInterval to avoid cleanup module side effects
vi.mock("../src/content/cleanup", () => ({
  registerInterval: vi.fn(),
}));

describe("auto-troops start/stop", () => {
  beforeEach(() => {
    // Reset store
    useStore.setState({
      asTroopsRunning: false,
      asTroopsTargets: [],
      asTroopsRatio: 20,
      asTroopsThreshold: 50,
      asTroopsCooldownSec: 10,
      asTroopsLog: [],
      asTroopsLastSend: {},
      asTroopsNextSend: {},
      asTroopsAllTeamMode: false,
      asTroopsAllAlliesMode: false,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("asTroopsStart sets running to true", async () => {
    const { asTroopsStart } = await import("../src/content/automation/auto-troops");
    expect(useStore.getState().asTroopsRunning).toBe(false);
    asTroopsStart();
    expect(useStore.getState().asTroopsRunning).toBe(true);
  });

  test("asTroopsStop sets running to false", async () => {
    const { asTroopsStart, asTroopsStop } = await import("../src/content/automation/auto-troops");
    asTroopsStart();
    expect(useStore.getState().asTroopsRunning).toBe(true);
    asTroopsStop();
    expect(useStore.getState().asTroopsRunning).toBe(false);
  });

  test("asTroopsStart is idempotent", async () => {
    const { asTroopsStart } = await import("../src/content/automation/auto-troops");
    asTroopsStart();
    asTroopsStart(); // Should not throw or create duplicate timers
    expect(useStore.getState().asTroopsRunning).toBe(true);
  });
});

describe("auto-gold start/stop", () => {
  beforeEach(() => {
    useStore.setState({
      asGoldRunning: false,
      asGoldTargets: [],
      asGoldRatio: 20,
      asGoldThreshold: 0,
      asGoldCooldownSec: 10,
      asGoldLog: [],
      asGoldLastSend: {},
      asGoldNextSend: {},
      asGoldAllTeamMode: false,
      asGoldAllAlliesMode: false,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("asGoldStart sets running to true", async () => {
    const { asGoldStart } = await import("../src/content/automation/auto-gold");
    expect(useStore.getState().asGoldRunning).toBe(false);
    asGoldStart();
    expect(useStore.getState().asGoldRunning).toBe(true);
  });

  test("asGoldStop sets running to false", async () => {
    const { asGoldStart, asGoldStop } = await import("../src/content/automation/auto-gold");
    asGoldStart();
    expect(useStore.getState().asGoldRunning).toBe(true);
    asGoldStop();
    expect(useStore.getState().asGoldRunning).toBe(false);
  });
});
