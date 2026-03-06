/**
 * Tests for city tracking and troop calculation functions.
 *
 * Source: hammer-scripts/hammer.js lines 1112-1149
 * Bucket: Game state — city tracking & max troops estimation
 */
import { describe, expect, test, beforeEach } from "bun:test";
import {
  addToOwnerSum,
  upsertCity,
  estimateMaxTroops,
  CITY_TROOP_INCREASE,
  type CityRecord,
} from "./helpers/hammer-functions";

// ───────────────────────────────────────────────────────
// addToOwnerSum
// ───────────────────────────────────────────────────────
describe("addToOwnerSum", () => {
  let map: Map<number, number>;

  beforeEach(() => {
    map = new Map();
  });

  test("initializes owner with delta", () => {
    addToOwnerSum(map, 1, 3);
    expect(map.get(1)).toBe(3);
  });

  test("accumulates deltas for same owner", () => {
    addToOwnerSum(map, 1, 3);
    addToOwnerSum(map, 1, 2);
    expect(map.get(1)).toBe(5);
  });

  test("supports negative deltas (city lost)", () => {
    addToOwnerSum(map, 1, 5);
    addToOwnerSum(map, 1, -3);
    expect(map.get(1)).toBe(2);
  });

  test("ignores non-number ownerID", () => {
    addToOwnerSum(map, "abc" as any, 5);
    expect(map.size).toBe(0);
  });

  test("tracks multiple owners independently", () => {
    addToOwnerSum(map, 1, 3);
    addToOwnerSum(map, 2, 7);
    expect(map.get(1)).toBe(3);
    expect(map.get(2)).toBe(7);
  });
});

// ───────────────────────────────────────────────────────
// upsertCity
// ───────────────────────────────────────────────────────
describe("upsertCity", () => {
  let cityById: Map<string, CityRecord>;
  let cityLevelSum: Map<number, number>;

  beforeEach(() => {
    cityById = new Map();
    cityLevelSum = new Map();
  });

  test("adds new city", () => {
    upsertCity(cityById, cityLevelSum, { id: 1, level: 3, ownerID: 10 });
    expect(cityById.get("1")).toEqual({ ownerID: 10, level: 3 });
    expect(cityLevelSum.get(10)).toBe(3);
  });

  test("updates city level (same owner)", () => {
    upsertCity(cityById, cityLevelSum, { id: 1, level: 2, ownerID: 10 });
    upsertCity(cityById, cityLevelSum, { id: 1, level: 5, ownerID: 10 });
    expect(cityById.get("1")).toEqual({ ownerID: 10, level: 5 });
    expect(cityLevelSum.get(10)).toBe(5); // 2 + (5-2) = 5
  });

  test("transfers city to new owner", () => {
    upsertCity(cityById, cityLevelSum, { id: 1, level: 3, ownerID: 10 });
    upsertCity(cityById, cityLevelSum, { id: 1, level: 3, ownerID: 20 });
    expect(cityLevelSum.get(10)).toBe(0); // lost the city
    expect(cityLevelSum.get(20)).toBe(3); // gained the city
  });

  test("removes city when isActive=false", () => {
    upsertCity(cityById, cityLevelSum, { id: 1, level: 4, ownerID: 10 });
    upsertCity(cityById, cityLevelSum, { id: 1, isActive: false });
    expect(cityById.has("1")).toBe(false);
    expect(cityLevelSum.get(10)).toBe(0);
  });

  test("isActive=false with no existing city is no-op", () => {
    upsertCity(cityById, cityLevelSum, { id: 99, isActive: false });
    expect(cityById.size).toBe(0);
    expect(cityLevelSum.size).toBe(0);
  });

  test("handles multiple cities for one owner", () => {
    upsertCity(cityById, cityLevelSum, { id: 1, level: 2, ownerID: 10 });
    upsertCity(cityById, cityLevelSum, { id: 2, level: 3, ownerID: 10 });
    expect(cityLevelSum.get(10)).toBe(5);
  });
});

// ───────────────────────────────────────────────────────
// estimateMaxTroops
// ───────────────────────────────────────────────────────
describe("estimateMaxTroops", () => {
  test("base formula with zero tiles", () => {
    const map = new Map<number, number>();
    const result = estimateMaxTroops(0, 1, map);
    // base = 2 * (0^0.6 * 1000 + 50000) = 2 * 50000 = 100000
    expect(result).toBe(100_000);
  });

  test("increases with tiles", () => {
    const map = new Map<number, number>();
    const t0 = estimateMaxTroops(0, 1, map);
    const t100 = estimateMaxTroops(100, 1, map);
    const t1000 = estimateMaxTroops(1000, 1, map);
    expect(t100).toBeGreaterThan(t0);
    expect(t1000).toBeGreaterThan(t100);
  });

  test("city levels add CITY_TROOP_INCREASE per level", () => {
    const map = new Map<number, number>([[5, 3]]); // player 5 has 3 city levels
    const withCities = estimateMaxTroops(100, 5, map);
    const withoutCities = estimateMaxTroops(100, 5, new Map());
    expect(withCities - withoutCities).toBe(3 * CITY_TROOP_INCREASE);
  });

  test("never returns negative", () => {
    const map = new Map<number, number>();
    expect(estimateMaxTroops(-100, 1, map)).toBeGreaterThanOrEqual(0);
  });

  test("returns integer", () => {
    const map = new Map<number, number>();
    const result = estimateMaxTroops(42, 1, map);
    expect(result).toBe(Math.floor(result));
  });

  test("specific calculation check (100 tiles, no cities)", () => {
    const map = new Map<number, number>();
    // tiles=100, base = 2 * (100^0.6 * 1000 + 50000)
    // 100^0.6 ≈ 15.848..., so base ≈ 2 * (15848.9 + 50000) = 2 * 65848.9 ≈ 131697
    const result = estimateMaxTroops(100, 1, map);
    expect(result).toBeGreaterThan(130_000);
    expect(result).toBeLessThan(135_000);
  });
});
