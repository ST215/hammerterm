/**
 * Tests for the Palantir range-based scoring system.
 */
import { describe, expect, test } from "vitest";
import {
  calcPalantirAmount,
  type PalantirInput,
} from "../src/shared/logic/palantir";

// Helper to build input with defaults
function input(overrides: Partial<PalantirInput> = {}): PalantirInput {
  return {
    amountSent: 10_000,
    donorTroops: 100_000,
    sendCount: 1,
    myGold: 100_000,
    myTroops: 100_000,
    isTeammate: false,
    minPct: 25,
    maxPct: 50,
    ...overrides,
  };
}

describe("exploit filters", () => {
  test("skips donations below minimum amount", () => {
    const r = calcPalantirAmount(input({ amountSent: 4_999 }));
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe("min-donation");
    expect(r.final).toBe(0);
  });

  test("allows donations at minimum amount", () => {
    const r = calcPalantirAmount(input({ amountSent: 5_000 }));
    expect(r.skipped).toBe(false);
  });

  test("skips trivial sacrifice from big player", () => {
    // Whale sends 5k from 500k army = 1% sacrifice (below 2% threshold)
    const r = calcPalantirAmount(
      input({ amountSent: 5_000, donorTroops: 500_000 }),
    );
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe("min-sacrifice");
    expect(r.sacrificeRatio).toBeCloseTo(0.01);
  });

  test("allows meaningful sacrifice from big player", () => {
    // Whale sends 15k from 500k army = 3% sacrifice (above 2%)
    const r = calcPalantirAmount(
      input({ amountSent: 15_000, donorTroops: 500_000 }),
    );
    expect(r.skipped).toBe(false);
  });

  test("does not filter by sacrifice when donor troops unknown", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 10_000, donorTroops: 0 }),
    );
    expect(r.skipped).toBe(false);
    expect(r.sacrificeRatio).toBe(0.1); // default
  });
});

describe("sacrifice score", () => {
  test("small sacrifice → low score", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 5_000, donorTroops: 100_000 }),
    );
    expect(r.sacrificeScore).toBeCloseTo(0.05);
  });

  test("50% sacrifice → 0.5 score", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 50_000, donorTroops: 100_000 }),
    );
    expect(r.sacrificeScore).toBeCloseTo(0.5);
  });

  test("all-in sacrifice → 1.0 score", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 100_000, donorTroops: 100_000 }),
    );
    expect(r.sacrificeScore).toBe(1.0);
  });

  test("sacrifice capped at 1.0", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 200_000, donorTroops: 100_000 }),
    );
    expect(r.sacrificeScore).toBe(1.0);
  });
});

describe("loyalty score", () => {
  test("first send = 0.0 loyalty", () => {
    const r = calcPalantirAmount(input({ sendCount: 1 }));
    expect(r.loyaltyScore).toBe(0);
  });

  test("3rd send = 0.4 loyalty", () => {
    const r = calcPalantirAmount(input({ sendCount: 3 }));
    expect(r.loyaltyScore).toBeCloseTo(0.4);
  });

  test("6th send = capped at 1.0 loyalty", () => {
    const r = calcPalantirAmount(input({ sendCount: 6 }));
    expect(r.loyaltyScore).toBe(1.0);
  });

  test("20th send still capped at 1.0", () => {
    const r = calcPalantirAmount(input({ sendCount: 20 }));
    expect(r.loyaltyScore).toBe(1.0);
  });
});

describe("teammate score", () => {
  test("non-teammate = 0.0", () => {
    const r = calcPalantirAmount(input({ isTeammate: false }));
    expect(r.teammateScore).toBe(0);
  });

  test("teammate = 1.0", () => {
    const r = calcPalantirAmount(input({ isTeammate: true }));
    expect(r.teammateScore).toBe(1.0);
  });
});

describe("size score", () => {
  test("same size = moderate score", () => {
    const r = calcPalantirAmount(
      input({ myTroops: 100_000, donorTroops: 100_000 }),
    );
    // ratio = 100k/100k = 1.0, / 5 = 0.2
    expect(r.sizeScore).toBeCloseTo(0.2);
  });

  test("small player helping big player = high score", () => {
    const r = calcPalantirAmount(
      input({ myTroops: 500_000, donorTroops: 50_000 }),
    );
    // ratio = 500k/50k = 10, capped at 5, / 5 = 1.0
    expect(r.sizeScore).toBe(1.0);
  });

  test("big player helping small player = low score", () => {
    const r = calcPalantirAmount(
      input({ myTroops: 50_000, donorTroops: 500_000 }),
    );
    // ratio = 50k/500k = 0.1, / 5 = 0.02
    expect(r.sizeScore).toBeCloseTo(0.02);
  });
});

describe("overall score → percentage mapping", () => {
  test("low-quality donor gets near minPct", () => {
    // Small sacrifice, first send, not teammate, big player helping small
    const r = calcPalantirAmount(
      input({
        amountSent: 5_000,
        donorTroops: 100_000,
        sendCount: 1,
        myTroops: 50_000,
        isTeammate: false,
        minPct: 25,
        maxPct: 50,
      }),
    );
    expect(r.score).toBeLessThan(0.2);
    expect(r.percentage).toBeLessThan(30);
  });

  test("high-quality donor gets near maxPct", () => {
    // High sacrifice, loyal, teammate, small player
    const r = calcPalantirAmount(
      input({
        amountSent: 80_000,
        donorTroops: 100_000,
        sendCount: 6,
        myTroops: 500_000,
        isTeammate: true,
        minPct: 25,
        maxPct: 50,
      }),
    );
    expect(r.score).toBeGreaterThan(0.8);
    expect(r.percentage).toBeGreaterThan(45);
  });

  test("custom range is respected", () => {
    const rLow = calcPalantirAmount(
      input({ amountSent: 50_000, donorTroops: 100_000, minPct: 10, maxPct: 20 }),
    );
    const rHigh = calcPalantirAmount(
      input({ amountSent: 50_000, donorTroops: 100_000, minPct: 40, maxPct: 80 }),
    );
    expect(rLow.percentage).toBeGreaterThanOrEqual(10);
    expect(rLow.percentage).toBeLessThanOrEqual(20);
    expect(rHigh.percentage).toBeGreaterThanOrEqual(40);
    expect(rHigh.percentage).toBeLessThanOrEqual(80);
  });
});

describe("final amount calculation", () => {
  test("zero gold when below minimum threshold", () => {
    const r = calcPalantirAmount(input({ myGold: 500 }));
    expect(r.final).toBe(0);
  });

  test("amount is floor of percentage × gold", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 50_000,
        donorTroops: 100_000,
        sendCount: 1,
        myGold: 100_000,
        isTeammate: false,
        minPct: 25,
        maxPct: 50,
      }),
    );
    const expectedAmount = Math.floor((100_000 * r.percentage) / 100);
    expect(r.final).toBe(expectedAmount);
  });
});

describe("real gameplay scenarios (25-50% range)", () => {
  test("exploiter: whale sends 1k from 500k army → filtered", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 1_000,
        donorTroops: 500_000,
        myGold: 100_000,
      }),
    );
    // Below min donation
    expect(r.skipped).toBe(true);
    expect(r.final).toBe(0);
  });

  test("normal donation: 10k from 100k army, first send, non-TM", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 10_000,
        donorTroops: 100_000,
        sendCount: 1,
        myGold: 100_000,
        isTeammate: false,
      }),
    );
    expect(r.skipped).toBe(false);
    // 10% sacrifice, no loyalty, no team, moderate size
    // Should be in the lower portion of 25-50% range
    expect(r.percentage).toBeGreaterThan(25);
    expect(r.percentage).toBeLessThan(35);
    expect(r.final).toBeGreaterThan(25_000);
    expect(r.final).toBeLessThan(35_000);
  });

  test("generous teammate: 50k from 100k, 3rd send, TM", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 50_000,
        donorTroops: 100_000,
        sendCount: 3,
        myGold: 100_000,
        isTeammate: true,
      }),
    );
    expect(r.skipped).toBe(false);
    // 50% sacrifice + some loyalty + teammate = high score
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.percentage).toBeGreaterThan(37);
  });

  test("all-in loyal teammate: 100k from 100k, 6th send, TM", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 100_000,
        donorTroops: 100_000,
        sendCount: 6,
        myGold: 100_000,
        myTroops: 500_000,
        isTeammate: true,
      }),
    );
    expect(r.skipped).toBe(false);
    // Max sacrifice, max loyalty, teammate, small donor → very high score
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.percentage).toBeGreaterThan(47);
    expect(r.final).toBeGreaterThan(47_000);
  });
});
