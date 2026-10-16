/**
 * Comms pacing (src/shared/logic/pace.ts): stepped gap + Humanize.
 */
import { describe, expect, test } from "vitest";
import {
  PACE_PRESETS,
  PACE_STOPS_MS,
  durationLabel,
  estimateBatchMs,
  gapLabel,
  nearestStopIndex,
  paceRangeLabel,
  resolvePace,
} from "../src/shared/logic/pace";

describe("stops", () => {
  test("ascending from 0.3s to 20s", () => {
    expect(PACE_STOPS_MS[0]).toBe(300);
    expect(PACE_STOPS_MS[PACE_STOPS_MS.length - 1]).toBe(20000);
    for (let i = 1; i < PACE_STOPS_MS.length; i++) {
      expect(PACE_STOPS_MS[i]).toBeGreaterThan(PACE_STOPS_MS[i - 1]);
    }
  });

  test("every preset sits exactly on a stop", () => {
    for (const p of PACE_PRESETS) expect(PACE_STOPS_MS).toContain(p.ms);
  });

  test("odd stored values snap to the nearest stop", () => {
    expect(PACE_STOPS_MS[nearestStopIndex(900)]).toBe(1000);
    expect(PACE_STOPS_MS[nearestStopIndex(99999)]).toBe(20000);
    expect(PACE_STOPS_MS[nearestStopIndex(0)]).toBe(300);
  });
});

describe("resolvePace", () => {
  test("plain: tight ±15% around the gap, first send immediate", () => {
    expect(resolvePace(2000, false)).toEqual({
      minMs: 1700,
      maxMs: 2300,
      delayFirst: false,
      longPauses: false,
    });
  });

  test("humanized: wide ±40%, first send delayed, occasional long pause", () => {
    expect(resolvePace(5000, true)).toEqual({
      minMs: 3000,
      maxMs: 7000,
      delayFirst: true,
      longPauses: true,
    });
  });

  test("Brisk preset is a faster Human", () => {
    const brisk = PACE_PRESETS.find((p) => p.label === "Brisk")!;
    const human = PACE_PRESETS.find((p) => p.label === "Human")!;
    expect(brisk.human && human.human).toBe(true);
    expect(brisk.ms).toBeLessThan(human.ms);
  });
});

describe("estimateBatchMs", () => {
  test("n−1 gaps without first delay, n gaps with it", () => {
    const flat = { minMs: 1000, maxMs: 1000, delayFirst: false, longPauses: false };
    expect(estimateBatchMs(5, flat)).toBe(4000);
    expect(estimateBatchMs(5, { ...flat, delayFirst: true })).toBe(5000);
    expect(estimateBatchMs(0, flat)).toBe(0);
  });

  test("long pauses inflate the average", () => {
    const base = { minMs: 1000, maxMs: 1000, delayFirst: false, longPauses: false };
    expect(estimateBatchMs(11, { ...base, longPauses: true })).toBeGreaterThan(
      estimateBatchMs(11, base),
    );
  });
});

describe("labels", () => {
  test("gap label", () => {
    expect(gapLabel(300)).toBe("0.3s");
    expect(gapLabel(1500)).toBe("1.5s");
    expect(gapLabel(14000)).toBe("14s");
  });

  test("range label", () => {
    expect(paceRangeLabel(resolvePace(5000, true))).toBe("3–7s");
  });

  test("duration label switches to minutes", () => {
    expect(durationLabel(45_000)).toBe("45s");
    expect(durationLabel(8 * 60_000)).toBe("8 min");
  });
});
