/**
 * Attack governor — ISOLATED-world side:
 *   - attack-event signature gate (shared with the MAIN-world emit wrap)
 *   - Start/Stop/Toggle only flip the store flag (works from either window)
 *   - the game tab pushes config to the MAIN-world governor on every change
 *   - governor telemetry lands in the store (incl. the exact troop cap)
 *   - a new match keeps the governor on and clears last match's readouts
 * Decision math lives in attack-governor.test.ts.
 */
import { describe, expect, test, beforeEach, vi } from "vitest";
import { isAttackEvent } from "../src/shared/logic/attack-clamp";
import { useStore } from "../src/store/index";
import {
  asAttackRatioStart,
  asAttackRatioStop,
  asAttackRatioToggle,
  governorConfigFrom,
  installGovernorSync,
} from "../src/content/automation/attack-ratio";
import { handleGovernorTelemetry, handleInit } from "../src/content/bridge";

describe("isAttackEvent", () => {
  test("recognises SendAttackIntentEvent by {targetID, troops}", () => {
    expect(isAttackEvent({ targetID: "p7", troops: 1234 })).toBe(true);
  });

  test("recognises a null-target attack (targetID present but null)", () => {
    expect(isAttackEvent({ targetID: null, troops: 1234 })).toBe(true);
  });

  test("recognises SendBoatAttackIntentEvent by {dst, troops}", () => {
    expect(isAttackEvent({ dst: 55123, troops: 1234 })).toBe(true);
  });

  test("excludes SendDonateTroopsIntentEvent ({recipient, troops})", () => {
    expect(isAttackEvent({ recipient: {}, troops: 1234 })).toBe(false);
  });

  test("excludes events without a numeric troops field", () => {
    expect(isAttackEvent({ targetID: "p7" })).toBe(false);
    expect(isAttackEvent({ targetID: "p7", troops: null })).toBe(false);
  });

  test("rejects non-objects", () => {
    expect(isAttackEvent(null)).toBe(false);
    expect(isAttackEvent(42)).toBe(false);
  });
});

describe("defaults", () => {
  test("Stanley's known-good: peak mode, cap 75; governor off until started", () => {
    const initial = useStore.getInitialState();
    expect(initial.attackRatioMode).toBe("peak");
    expect(initial.attackRatioMaxCap).toBe(75);
    expect(initial.attackRatioRunning).toBe(false);
  });
});

describe("Start / Stop / Toggle only flip the flag", () => {
  beforeEach(() => useStore.setState({ attackRatioRunning: false }));

  test("start and stop", () => {
    asAttackRatioStart();
    expect(useStore.getState().attackRatioRunning).toBe(true);
    asAttackRatioStop();
    expect(useStore.getState().attackRatioRunning).toBe(false);
  });

  test("toggle (Alt+G)", () => {
    asAttackRatioToggle();
    expect(useStore.getState().attackRatioRunning).toBe(true);
    asAttackRatioToggle();
    expect(useStore.getState().attackRatioRunning).toBe(false);
  });
});

describe("config pushed to the MAIN-world governor", () => {
  test("store fields map onto the governor config", () => {
    useStore.setState({
      attackRatioRunning: true,
      attackRatioMode: "breakeven",
      attackRatioBasePct: 10,
      attackRatioBreakevenPct: 60,
      attackRatioFloorPct: 25,
      attackRatioMaxCap: 50,
      isReplay: false,
    });
    expect(governorConfigFrom(useStore.getState())).toEqual({
      running: true,
      mode: "breakeven",
      fixedPct: 10,
      holdPct: 60,
      floorPct: 25,
      capPct: 50,
    });
  });

  test("never runs during a replay", () => {
    useStore.setState({ attackRatioRunning: true, isReplay: true });
    expect(governorConfigFrom(useStore.getState()).running).toBe(false);
    useStore.setState({ isReplay: false });
  });

  test("a store change posts governor-config to the MAIN world", () => {
    const post = vi.spyOn(window, "postMessage");
    installGovernorSync();
    post.mockClear();
    useStore.setState({ attackRatioRunning: true, attackRatioMaxCap: 25 });
    const sent = post.mock.calls
      .map((c) => c[0] as any)
      .filter((m) => m?.__hammer && m.payload?.action === "governor-config");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[sent.length - 1].payload.config).toMatchObject({ running: true, capPct: 25 });
    post.mockRestore();
  });
});

describe("telemetry from the MAIN world", () => {
  test("lands in the store with the exact troop cap", () => {
    handleGovernorTelemetry({
      state: "governing",
      mode: "peak",
      ratio: 0.3,
      troops: 600_000,
      maxTroops: 1_000_000,
      troopPct: 60,
      regenPerSec: 4000,
      netSlope: 0,
      pending: 0,
      allowed: 180_000,
      armPct: 42,
      held: 2,
      trimmed: 1,
    });
    const s = useStore.getState();
    expect(s.myMaxTroops).toBe(1_000_000);
    expect(s.myRegenPerSec).toBe(4000);
    expect(s.attackRatioTelemetry).toMatchObject({ state: "governing", allowed: 180_000, held: 2 });
  });

  test("ignores payloads without a cap", () => {
    useStore.setState({ attackRatioTelemetry: null });
    handleGovernorTelemetry({ state: "off" });
    expect(useStore.getState().attackRatioTelemetry).toBeNull();
  });
});

describe("new match", () => {
  test("keeps the governor running and clears last match's readouts", () => {
    useStore.setState({ playerDataReady: true, attackRatioRunning: true, myMaxTroops: 123 });
    handleInit({ clientID: "next-match" });
    const s = useStore.getState();
    expect(s.attackRatioRunning).toBe(true);
    expect(s.attackRatioTelemetry).toBeNull();
    expect(s.myMaxTroops).toBe(0);
  });
});
