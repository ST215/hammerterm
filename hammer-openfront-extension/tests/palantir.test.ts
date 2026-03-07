/**
 * Tests for the Palantir smart reciprocation formula.
 */
import { describe, expect, test } from "vitest";
import {
  calcPalantirAmount,
  getPhase,
  getSelfMod,
  type PalantirInput,
} from "../src/shared/logic/palantir";

// Helper to build input with defaults
function input(overrides: Partial<PalantirInput> = {}): PalantirInput {
  return {
    amountSent: 10_000,
    donorTroops: 100_000,
    sendCount: 1,
    myGold: 100_000,
    myTroops: 100_000, // "growing" phase
    isTeammate: false,
    ...overrides,
  };
}

describe("getPhase", () => {
  test("conserving below 50K", () => {
    expect(getPhase(0)).toBe("conserving");
    expect(getPhase(49_999)).toBe("conserving");
  });

  test("growing between 50K and 200K", () => {
    expect(getPhase(50_000)).toBe("growing");
    expect(getPhase(199_999)).toBe("growing");
  });

  test("dominant at 200K+", () => {
    expect(getPhase(200_000)).toBe("dominant");
    expect(getPhase(1_000_000)).toBe("dominant");
  });
});

describe("getSelfMod", () => {
  test("returns correct multipliers", () => {
    expect(getSelfMod("conserving")).toBe(0.6);
    expect(getSelfMod("growing")).toBe(1.2);
    expect(getSelfMod("dominant")).toBe(1.5);
  });
});

describe("sacrifice ratio", () => {
  test("small sacrifice from big player", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 1_000, donorTroops: 500_000 }),
    );
    expect(r.sacrificeRatio).toBeCloseTo(0.002);
  });

  test("large sacrifice from small player", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 50_000, donorTroops: 50_000 }),
    );
    expect(r.sacrificeRatio).toBe(1.0);
  });

  test("sacrifice capped at 1.0", () => {
    const r = calcPalantirAmount(
      input({ amountSent: 100_000, donorTroops: 50_000 }),
    );
    expect(r.sacrificeRatio).toBe(1.0);
  });

  test("zero donor troops uses default sacrifice", () => {
    const r = calcPalantirAmount(input({ donorTroops: 0 }));
    expect(r.sacrificeRatio).toBe(0.1);
  });
});

describe("loyalty multiplier", () => {
  test("first send = 1.0x", () => {
    const r = calcPalantirAmount(input({ sendCount: 1 }));
    expect(r.loyaltyMultiplier).toBe(1.0);
  });

  test("5th send = 1.2x", () => {
    const r = calcPalantirAmount(input({ sendCount: 5 }));
    expect(r.loyaltyMultiplier).toBeCloseTo(1.2);
  });

  test("11th send = capped at 1.5x", () => {
    const r = calcPalantirAmount(input({ sendCount: 11 }));
    expect(r.loyaltyMultiplier).toBe(1.5);
  });

  test("20th send still capped at 1.5x", () => {
    const r = calcPalantirAmount(input({ sendCount: 20 }));
    expect(r.loyaltyMultiplier).toBe(1.5);
  });
});

describe("teammate multiplier", () => {
  test("non-teammate = 1.0x", () => {
    const r = calcPalantirAmount(input({ isTeammate: false }));
    expect(r.teammateMultiplier).toBe(1.0);
  });

  test("teammate = 1.25x", () => {
    const r = calcPalantirAmount(input({ isTeammate: true }));
    expect(r.teammateMultiplier).toBe(1.25);
  });
});

describe("self-preservation phases", () => {
  test("conserving phase reduces generosity", () => {
    const r = calcPalantirAmount(input({ myTroops: 30_000 }));
    expect(r.phase).toBe("conserving");
    expect(r.selfMod).toBe(0.6);
  });

  test("growing phase boosts generosity", () => {
    const r = calcPalantirAmount(input({ myTroops: 100_000 }));
    expect(r.phase).toBe("growing");
    expect(r.selfMod).toBe(1.2);
  });

  test("dominant phase is most generous", () => {
    const r = calcPalantirAmount(input({ myTroops: 300_000 }));
    expect(r.phase).toBe("dominant");
    expect(r.selfMod).toBe(1.5);
  });
});

describe("floor and cap", () => {
  test("small amounts get floored to 10K", () => {
    // Big player sends tiny amount → low sacrifice → raw amount is tiny
    const r = calcPalantirAmount(
      input({ amountSent: 1_000, donorTroops: 500_000, myGold: 100_000 }),
    );
    // sacrifice = 0.002, raw = 100K * 0.002 * 1.0 * 1.0 * 1.2 = 240
    expect(r.rawAmount).toBeCloseTo(240);
    expect(r.flooredAmount).toBe(10_000);
    // cap = 100K * 0.4 = 40K, floor 10K < cap 40K → 10K
    expect(r.final).toBe(10_000);
  });

  test("large amounts get capped at 40%", () => {
    // All-in player: sacrifice = 1.0
    const r = calcPalantirAmount(
      input({
        amountSent: 50_000,
        donorTroops: 50_000,
        myGold: 100_000,
        myTroops: 100_000,
      }),
    );
    // raw = 100K * 1.0 * 1.0 * 1.0 * 1.2 = 120K
    expect(r.rawAmount).toBeCloseTo(120_000);
    // cap = 40K
    expect(r.final).toBe(40_000);
  });

  test("cap wins over floor when gold is low", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 1_000,
        donorTroops: 500_000,
        myGold: 20_000,
        myTroops: 100_000,
      }),
    );
    // cap = 20K * 0.4 = 8K, floor = 10K, cap < floor → cap wins
    expect(r.final).toBe(8_000);
  });

  test("zero gold when below minimum threshold", () => {
    const r = calcPalantirAmount(input({ myGold: 500 }));
    expect(r.final).toBe(0);
  });
});

describe("combined scenarios from plan", () => {
  test("small loyal ally sending 30% sacrifice", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 15_000,
        donorTroops: 50_000,
        sendCount: 5,
        myGold: 100_000,
        myTroops: 100_000,
        isTeammate: false,
      }),
    );
    expect(r.sacrificeRatio).toBeCloseTo(0.3);
    expect(r.loyaltyMultiplier).toBeCloseTo(1.2);
    expect(r.selfMod).toBe(1.2);
    // raw = 100K * 0.3 * 1.2 * 1.0 * 1.2 = 43,200
    expect(r.rawAmount).toBeCloseTo(43_200);
    // capped at 40K
    expect(r.final).toBe(40_000);
  });

  test("big exploiter sending 0.2% sacrifice", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 1_000,
        donorTroops: 500_000,
        sendCount: 1,
        myGold: 100_000,
        myTroops: 100_000,
        isTeammate: false,
      }),
    );
    expect(r.sacrificeRatio).toBeCloseTo(0.002);
    // raw = 100K * 0.002 * 1.0 * 1.0 * 1.2 = 240
    expect(r.rawAmount).toBeCloseTo(240);
    // floored to 10K, cap = 40K → 10K
    expect(r.final).toBe(10_000);
  });

  test("medium regular teammate 3rd send", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 10_000,
        donorTroops: 100_000,
        sendCount: 3,
        myGold: 100_000,
        myTroops: 100_000,
        isTeammate: true,
      }),
    );
    expect(r.sacrificeRatio).toBeCloseTo(0.1);
    expect(r.loyaltyMultiplier).toBeCloseTo(1.1);
    expect(r.teammateMultiplier).toBe(1.25);
    // raw = 100K * 0.1 * 1.1 * 1.25 * 1.2 = 16,500
    expect(r.rawAmount).toBeCloseTo(16_500);
    expect(r.final).toBe(16_500);
  });

  test("dominant player is extra generous", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 10_000,
        donorTroops: 100_000,
        sendCount: 1,
        myGold: 100_000,
        myTroops: 300_000,
        isTeammate: false,
      }),
    );
    expect(r.phase).toBe("dominant");
    expect(r.selfMod).toBe(1.5);
    // raw = 100K * 0.1 * 1.0 * 1.0 * 1.5 = 15,000
    expect(r.rawAmount).toBeCloseTo(15_000);
    expect(r.final).toBe(15_000);
  });

  test("conserving player is careful", () => {
    const r = calcPalantirAmount(
      input({
        amountSent: 10_000,
        donorTroops: 100_000,
        sendCount: 1,
        myGold: 100_000,
        myTroops: 20_000,
        isTeammate: false,
      }),
    );
    expect(r.phase).toBe("conserving");
    expect(r.selfMod).toBe(0.6);
    // raw = 100K * 0.1 * 1.0 * 1.0 * 0.6 = 6,000
    // floored to 10K, cap = 40K → 10K
    expect(r.final).toBe(10_000);
  });
});
