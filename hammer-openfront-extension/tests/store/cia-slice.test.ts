import { describe, expect, test } from "vitest";
import { create } from "zustand";
import { createCIASlice, type CIASlice } from "../../src/store/slices/cia";

function createTestStore() {
  return create<CIASlice>()(createCIASlice);
}

describe("CIASlice", () => {
  // ───────────────────────────────────────────────────────
  // Default state
  // ───────────────────────────────────────────────────────
  test("starts with empty CIA state (transfers, flowGraph, alerts)", () => {
    const store = createTestStore();
    const cia = store.getState().getCIAState();
    expect(cia.transfers).toEqual([]);
    expect(cia.flowGraph.size).toBe(0);
    expect(cia.alerts).toEqual([]);
  });

  test("getCIAState returns the CIAState reference", () => {
    const store = createTestStore();
    const cia = store.getState().getCIAState();
    expect(cia).toBeDefined();
    expect(cia).toHaveProperty("transfers");
    expect(cia).toHaveProperty("flowGraph");
    expect(cia).toHaveProperty("playerTotals");
    expect(cia).toHaveProperty("alerts");
    expect(cia).toHaveProperty("seen");
  });

  test("default goldRateEnabled is true", () => {
    const store = createTestStore();
    expect(store.getState().goldRateEnabled).toBe(true);
  });

  test("default gps30/gpm60/gpm120 are 0", () => {
    const store = createTestStore();
    const s = store.getState();
    expect(s.gps30).toBe(0);
    expect(s.gpm60).toBe(0);
    expect(s.gpm120).toBe(0);
  });

  // ───────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────
  test("setGoldRates updates all three values", () => {
    const store = createTestStore();
    store.getState().setGoldRates(150, 3000, 5500);
    const s = store.getState();
    expect(s.gps30).toBe(150);
    expect(s.gpm60).toBe(3000);
    expect(s.gpm120).toBe(5500);
  });
});
