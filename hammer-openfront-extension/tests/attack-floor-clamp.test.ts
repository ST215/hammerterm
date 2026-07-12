/**
 * Unit tests for v15.22 governor hard-floor v2 (spec D2):
 *   - pure per-click clamp decision (clampAttackTroops / isAttackEvent):
 *     above floor / straddling floor / at-or-below floor (swallow) / floor off
 *     / land + boat attack signatures / non-attack exclusions
 *   - governor engine: pushes the absolute floor each tick + belowSetpoint
 *     telemetry when peak/break-even pins the ratio at minimum
 *   - match-reset hygiene: handleInit stops the engine (releases slider + floor)
 *   - session defaults (peak / floor 42 / cap 75)
 */
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import {
  isAttackEvent,
  clampAttackTroops,
} from "../src/shared/logic/attack-clamp";
import { useStore } from "../src/store/index";
import { setMyLiveTroops } from "../src/content/hooks/worker-hook";
import {
  asAttackRatioStart,
  asAttackRatioStop,
} from "../src/content/automation/attack-ratio";
import { handleInit } from "../src/content/bridge";
import { estimateMaxTroops } from "../src/shared/logic/city";
import type { PlayerData } from "../src/shared/types";

// ---------------------------------------------------------------------------
// Pure clamp decision — the heart of the per-click floor guard.
// ---------------------------------------------------------------------------

describe("clampAttackTroops", () => {
  test("above floor: request passes through untouched", () => {
    // live 10000, floor 4000 → allowed 6000; request 5000 fits.
    expect(clampAttackTroops(5000, 10000, 4000)).toEqual({
      troops: 5000,
      clamped: false,
      swallow: false,
    });
  });

  test("straddling floor: request trimmed to the headroom above the floor", () => {
    // live 10000, floor 4000 → allowed 6000; request 9000 clamped to 6000.
    expect(clampAttackTroops(9000, 10000, 4000)).toEqual({
      troops: 6000,
      clamped: true,
      swallow: false,
    });
  });

  test("at the floor: no headroom → swallow the attack", () => {
    expect(clampAttackTroops(9000, 4000, 4000)).toEqual({
      troops: 0,
      clamped: true,
      swallow: true,
    });
  });

  test("below the floor: swallow the attack", () => {
    expect(clampAttackTroops(9000, 3000, 4000)).toEqual({
      troops: 0,
      clamped: true,
      swallow: true,
    });
  });

  test("floor off (0): clamp inactive — request untouched even when huge", () => {
    expect(clampAttackTroops(999999, 10000, 0)).toEqual({
      troops: 999999,
      clamped: false,
      swallow: false,
    });
  });

  test("negative floor: treated as off", () => {
    expect(clampAttackTroops(5000, 10000, -1).clamped).toBe(false);
  });

  test("non-finite live troops: fails open (no clamp)", () => {
    expect(clampAttackTroops(5000, NaN, 4000)).toEqual({
      troops: 5000,
      clamped: false,
      swallow: false,
    });
  });
});

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

  test("excludes SendTargetPlayerIntentEvent (targetID, no troops)", () => {
    expect(isAttackEvent({ targetID: "p7" })).toBe(false);
  });

  test("excludes events with a non-numeric troops field", () => {
    expect(isAttackEvent({ targetID: "p7", troops: null })).toBe(false);
  });

  test("rejects non-objects", () => {
    expect(isAttackEvent(null)).toBe(false);
    expect(isAttackEvent(undefined)).toBe(false);
    expect(isAttackEvent(42)).toBe(false);
  });
});

// End-to-end emit-clamp path (what the MAIN-world wrapper does with the pure fns).
describe("emit-wrap clamp path (signature gate + decision)", () => {
  function applyClamp(evt: any, live: number, floorAbs: number) {
    if (floorAbs > 0 && isAttackEvent(evt)) {
      const res = clampAttackTroops(evt.troops, live, floorAbs);
      if (res.swallow) return { emitted: false, evt };
      if (res.clamped) evt.troops = res.troops;
    }
    return { emitted: true, evt };
  }

  test("land attack over floor is trimmed then emitted", () => {
    const evt = { targetID: "p3", troops: 9000 };
    const out = applyClamp(evt, 10000, 4000);
    expect(out.emitted).toBe(true);
    expect(evt.troops).toBe(6000);
  });

  test("boat attack with no headroom is swallowed (not emitted)", () => {
    const evt = { dst: 999, troops: 9000 };
    const out = applyClamp(evt, 4000, 4000);
    expect(out.emitted).toBe(false);
  });

  test("donate-troops event is never clamped", () => {
    const evt = { recipient: {}, troops: 9999 };
    const out = applyClamp(evt, 100, 50);
    expect(out.emitted).toBe(true);
    expect(evt.troops).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// Session defaults (spec D2: user's known-good).
// ---------------------------------------------------------------------------

describe("attack-ratio session defaults", () => {
  test("default mode is peak, floor 42, cap 75", () => {
    // Read the pristine slice defaults before any test mutates them.
    const initial = useStore.getInitialState();
    expect(initial.attackRatioMode).toBe("peak");
    expect(initial.attackRatioFloorPct).toBe(42);
    expect(initial.attackRatioMaxCap).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Governor engine: per-tick floor push + belowSetpoint telemetry + reset.
// ---------------------------------------------------------------------------

function seedMe(troops: number, tilesOwned = 100): PlayerData {
  const me: PlayerData = {
    id: "me",
    smallID: 1,
    clientID: "client-me",
    name: "Me",
    displayName: "Me",
    isAlive: true,
    team: 1,
    troops,
    gold: 5000,
    tilesOwned,
    allies: [],
  };
  const s = useStore.getState();
  s.resetPlayerState();
  s.setCurrentClientID("client-me");
  s.setMyIdentity(1, 1);
  useStore.setState({
    lastPlayers: [me],
    playersById: new Map([[me.id, me]]),
    isReplay: false,
    attackRatioMode: "peak",
    attackRatioFloorPct: 42,
    attackRatioMaxCap: 75,
  });
  setMyLiveTroops(troops);
  return me;
}

describe("governor engine floor push + telemetry", () => {
  let posts: any[];
  beforeEach(() => {
    vi.useFakeTimers();
    posts = [];
    vi.spyOn(window, "postMessage").mockImplementation((m: any) => {
      posts.push(m);
    });
  });
  afterEach(() => {
    asAttackRatioStop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function sentActions(): { action: string; amount?: number }[] {
    return posts
      .filter((m) => m?.__hammer && m.type === "send")
      .map((m) => m.payload);
  }

  test("pushes the absolute floor (floorPct×maxT) each tick", () => {
    const me = seedMe(100_000); // above the 42% setpoint → engaged
    const maxT = estimateMaxTroops(me.tilesOwned ?? 0, me.smallID!, new Map());
    const expectedFloor = 0.42 * maxT;

    asAttackRatioStart();
    vi.advanceTimersByTime(160); // one 150ms tick

    const floorMsg = sentActions().find((p) => p.action === "set-attack-floor");
    expect(floorMsg).toBeTruthy();
    expect(floorMsg!.amount ?? NaN).toBeCloseTo(expectedFloor, 0);
  });

  test("engaged (troops above setpoint): telemetry NOT belowSetpoint", () => {
    seedMe(100_000);
    asAttackRatioStart();
    vi.advanceTimersByTime(160);
    const tel = useStore.getState().attackRatioTelemetry;
    expect(tel).toBeTruthy();
    expect(tel!.belowSetpoint).toBe(false);
    expect(tel!.ratio).toBeGreaterThan(0.01);
  });

  test("below setpoint (troops far under target): telemetry belowSetpoint + ratio pinned to MIN", () => {
    seedMe(5_000); // well under the 42% peak setpoint
    asAttackRatioStart();
    vi.advanceTimersByTime(160);
    const tel = useStore.getState().attackRatioTelemetry;
    expect(tel).toBeTruthy();
    expect(tel!.belowSetpoint).toBe(true);
    expect(tel!.ratio).toBeCloseTo(0.01, 5);
  });
});

// ---------------------------------------------------------------------------
// Match-reset hygiene: handleInit stops the engine on a new match.
// ---------------------------------------------------------------------------

describe("match-reset stops the governor", () => {
  let posts: any[];
  beforeEach(() => {
    vi.useFakeTimers();
    posts = [];
    vi.spyOn(window, "postMessage").mockImplementation((m: any) => {
      posts.push(m);
    });
  });
  afterEach(() => {
    asAttackRatioStop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("asAttackRatioStop clears running + telemetry and releases the slider/floor", () => {
    seedMe(100_000);
    asAttackRatioStart();
    vi.advanceTimersByTime(160);
    expect(useStore.getState().attackRatioRunning).toBe(true);

    posts.length = 0;
    asAttackRatioStop();

    expect(useStore.getState().attackRatioRunning).toBe(false);
    expect(useStore.getState().attackRatioTelemetry).toBeNull();
    const actions = posts
      .filter((m) => m?.__hammer && m.type === "send")
      .map((m) => m.payload.action);
    expect(actions).toContain("release-attack-ratio");
  });

  test("handleInit on a new match stops a running governor", () => {
    seedMe(100_000);
    asAttackRatioStart();
    vi.advanceTimersByTime(160);
    expect(useStore.getState().attackRatioRunning).toBe(true);

    // playerDataReady=true marks this init as a NEW match (not first join).
    useStore.setState({ playerDataReady: true });
    posts.length = 0;
    handleInit({ clientID: "new-client" });

    expect(useStore.getState().attackRatioRunning).toBe(false);
    expect(useStore.getState().attackRatioTelemetry).toBeNull();
    const actions = posts
      .filter((m) => m?.__hammer && m.type === "send")
      .map((m) => m.payload.action);
    expect(actions).toContain("release-attack-ratio");
  });
});
