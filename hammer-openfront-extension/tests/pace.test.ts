/**
 * Pace-profile resolution + batch-duration estimates (src/shared/logic/pace.ts).
 */
import { describe, expect, test } from "vitest";
import {
  PACE_PROFILES,
  estimateBatchMs,
  paceRangeLabel,
  durationLabel,
  resolvePace,
} from "../src/shared/logic/pace";

describe("resolvePace", () => {
  test("profiles resolve to their defined ranges", () => {
    expect(resolvePace("instant")).toEqual(PACE_PROFILES.instant);
    expect(resolvePace("quick")).toEqual(PACE_PROFILES.quick);
    expect(resolvePace("brisk")).toEqual(PACE_PROFILES.brisk);
    expect(resolvePace("human")).toEqual(PACE_PROFILES.human);
  });

  test("brisk and human are the humanized profiles", () => {
    for (const p of [PACE_PROFILES.brisk, PACE_PROFILES.human]) {
      expect(p.delayFirst).toBe(true);
      expect(p.longPauses).toBe(true);
    }
    expect(PACE_PROFILES.instant.delayFirst).toBe(false);
    expect(PACE_PROFILES.quick.delayFirst).toBe(false);
  });

  test("brisk is faster than human", () => {
    expect(PACE_PROFILES.brisk.minMs).toBeLessThan(PACE_PROFILES.human.minMs);
    expect(PACE_PROFILES.brisk.maxMs).toBeLessThan(PACE_PROFILES.human.maxMs);
  });

  test("unknown stored profile falls back to quick", () => {
    expect(resolvePace("custom" as never)).toEqual(PACE_PROFILES.quick);
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
    const inflated = estimateBatchMs(11, { ...base, longPauses: true });
    expect(inflated).toBeGreaterThan(estimateBatchMs(11, base));
  });
});

describe("labels", () => {
  test("range label", () => {
    expect(paceRangeLabel(PACE_PROFILES.human)).toBe("6–14s");
    expect(paceRangeLabel(PACE_PROFILES.instant)).toBe("0.3–0.5s");
  });

  test("duration label switches to minutes", () => {
    expect(durationLabel(45_000)).toBe("45s");
    expect(durationLabel(8 * 60_000)).toBe("8 min");
  });
});
