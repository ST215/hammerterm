/**
 * attack-governor.ts — pure decision logic for the MAIN-world governor.
 */
import { describe, expect, test } from "vitest";
import {
  PEAK_PCT,
  SETTLE_MAX_MS,
  SETTLE_TICKS,
  allowedSend,
  armLevel,
  decideClick,
  emptyLedger,
  governAttack,
  pendingTotal,
  recordSend,
  settleLedger,
  targetFraction,
  type ClickContext,
  type GovernorConfig,
  type Ledger,
} from "../src/shared/logic/attack-governor";

const M = 1_000_000; // max troops (internal units)

function cfg(over: Partial<GovernorConfig> = {}): GovernorConfig {
  return {
    running: true,
    mode: "peak",
    fixedPct: 20,
    holdPct: 50,
    floorPct: 42,
    capPct: 75,
    ...over,
  };
}

describe("regen peak", () => {
  test("42% is the argmax of the game's regen curve T^0.73·(1−T/M)", () => {
    let best = 0;
    let bestPct = 0;
    for (let pct = 1; pct < 100; pct++) {
      const T = (pct / 100) * M;
      const regen = Math.pow(T, 0.73) * (1 - T / M);
      if (regen > best) {
        best = regen;
        bestPct = pct;
      }
    }
    expect(bestPct / 100).toBeCloseTo(PEAK_PCT, 2);
  });
});

describe("targets and arming", () => {
  test("peak targets 42%, hold targets the chosen %, assist has none", () => {
    expect(targetFraction(cfg())).toBe(PEAK_PCT);
    expect(targetFraction(cfg({ mode: "breakeven", holdPct: 60 }))).toBe(0.6);
    expect(targetFraction(cfg({ mode: "assist" }))).toBe(0);
  });

  test("arms at the target (peak/hold) or the floor (assist)", () => {
    expect(armLevel(cfg(), M)).toBe(PEAK_PCT * M);
    expect(armLevel(cfg({ mode: "assist", floorPct: 25 }), M)).toBe(0.25 * M);
    expect(armLevel(cfg({ mode: "assist", floorPct: 0 }), M)).toBe(0);
  });
});

describe("allowedSend — peak/hold spend the surplus", () => {
  test("sends exactly the surplus above 42%", () => {
    expect(allowedSend(cfg(), 0.6 * M, M)).toBe(Math.floor(0.6 * M - PEAK_PCT * M));
  });

  test("at or below the target the click is held", () => {
    expect(allowedSend(cfg(), PEAK_PCT * M, M)).toBe(0);
    expect(allowedSend(cfg(), 0.3 * M, M)).toBe(0);
  });

  test("a surplus too small to matter is held so it can accumulate", () => {
    expect(allowedSend(cfg(), PEAK_PCT * M + 0.005 * M, M)).toBe(0);
  });

  test("send cap limits each attack to a % of current troops", () => {
    const troops = 0.9 * M;
    expect(allowedSend(cfg({ capPct: 25 }), troops, M)).toBe(Math.floor(0.25 * troops));
  });

  test("hold mode uses the chosen level", () => {
    expect(allowedSend(cfg({ mode: "breakeven", holdPct: 60 }), 0.7 * M, M)).toBe(
      Math.floor(0.1 * M),
    );
  });
});

describe("allowedSend — assist (fixed %) with floor", () => {
  test("sends the fixed % of troops", () => {
    expect(allowedSend(cfg({ mode: "assist", floorPct: 0 }), 500_000, M)).toBe(100_000);
  });

  test("floor limits the send to the headroom above it", () => {
    const c = cfg({ mode: "assist", fixedPct: 50, floorPct: 40 });
    expect(allowedSend(c, 0.5 * M, M)).toBe(Math.floor(0.1 * M));
    expect(allowedSend(c, 0.4 * M, M)).toBe(0);
  });
});

describe("manual mode never governs", () => {
  test("allowed is unlimited and clicks pass untouched", () => {
    expect(allowedSend(cfg({ mode: "manual" }), 1000, M)).toBe(Infinity);
    expect(decideClick(cfg({ mode: "manual" }), 999, 1000, M)).toEqual({
      troops: 999,
      held: false,
      trimmed: false,
    });
  });
});

describe("decideClick", () => {
  test("trims an over-sized request, never grows a small one", () => {
    const troops = 0.6 * M;
    const surplus = Math.floor(troops - PEAK_PCT * M);
    expect(decideClick(cfg(), troops * 0.75, troops, M)).toEqual({
      troops: surplus,
      held: false,
      trimmed: true,
    });
    expect(decideClick(cfg(), 1000, troops, M).troops).toBe(1000);
  });

  test("holds when nothing is spendable", () => {
    expect(decideClick(cfg(), 5000, 0.3 * M, M)).toEqual({
      troops: 0,
      held: true,
      trimmed: false,
    });
  });
});

function ctx(over: Partial<ClickContext> = {}): ClickContext {
  return {
    cfg: cfg(),
    active: true,
    engaged: true,
    troops: 0.8 * M,
    maxTroops: M,
    regenPerTick: 0,
    tick: 100,
    nowMs: 0,
    ...over,
  };
}

describe("clobbering: rapid clicks before the server deducts (real governAttack path)", () => {
  test("a burst against an unchanged observed count can't spend below the target", () => {
    // Five clicks land before the first deduction is visible: observed troops
    // stay at 80% for all of them. Each click goes through the same function
    // the MAIN-world emit wrap runs; the ledger it returns carries forward.
    let ledger = emptyLedger();
    let total = 0;
    for (let i = 0; i < 5; i++) {
      const out = governAttack(ctx({ nowMs: i * 30 }), ledger, 0.8 * M * 0.75);
      ledger = out.ledger;
      if (!out.held) total += out.troops;
    }
    expect(0.8 * M - total).toBeGreaterThanOrEqual(PEAK_PCT * M - 1);
    expect(pendingTotal(ledger)).toBe(total);
  });

  test("without the ledger the same burst would drain the army", () => {
    const observed = 0.8 * M;
    let left = observed;
    for (let i = 0; i < 5; i++) {
      // Every click computed against the stale observed count; the server
      // caps each at what remains (AttackExecution min(troops, requested)).
      const d = decideClick(cfg(), observed * 0.75, observed, M);
      left -= Math.min(left, d.troops);
    }
    expect(left).toBeLessThan(PEAK_PCT * M);
  });

  test("standby / inactive: clicks pass untouched but are still recorded", () => {
    const out = governAttack(ctx({ engaged: false }), emptyLedger(), 12345);
    expect(out).toMatchObject({ troops: 12345, held: false, trimmed: false });
    expect(pendingTotal(out.ledger)).toBe(12345);
  });

  test("a held click records nothing", () => {
    const out = governAttack(ctx({ troops: 0.3 * M }), emptyLedger(), 5000);
    expect(out.held).toBe(true);
    expect(out.ledger.sends).toHaveLength(0);
  });

  test("troop donations in flight count against the next attack", () => {
    // 0.8M home, a 300k donation just left (not yet deducted): only 500k is
    // really home → surplus above 420k is 80k, not 380k.
    const ledger = recordSend(emptyLedger(), 300_000, { troops: 0.8 * M, tick: 100, nowMs: 0 });
    const out = governAttack(ctx({ nowMs: 10 }), ledger, 0.8 * M * 0.75);
    expect(out.troops).toBe(Math.floor(0.5 * M - PEAK_PCT * M));
  });
});

/**
 * Game-faithful simulation: the engine's regen formula each tick, deductions
 * landing `latency` ticks after each click capped at what's left
 * (AttackExecution min), the governor settling every tick (MAIN-world 100ms
 * loop) and judging every click through governAttack. Returns the lowest troop
 * level reached as a fraction of max.
 */
function simulate(opts: { latency: number; clickEvery: number; capPct?: number; ticks?: number }): number {
  const { latency, clickEvery, capPct = 25, ticks = 400 } = opts;
  const max = M;
  const regen = (t: number) => (10 + Math.pow(t, 0.73) / 4) * (1 - t / max);
  const c = cfg({ capPct });
  let troops = 0.9 * max;
  let ledger: Ledger = emptyLedger();
  const landing: Array<{ at: number; amount: number }> = [];
  let low = troops;
  for (let tick = 0; tick < ticks; tick++) {
    // Server turn: deductions due now (capped), then regen.
    for (const d of landing.filter((x) => x.at === tick)) troops -= Math.min(troops, d.amount);
    troops = Math.min(max, troops + regen(troops));
    low = Math.min(low, troops);
    const base: Omit<ClickContext, "cfg"> = {
      active: true,
      engaged: true,
      troops,
      maxTroops: max,
      regenPerTick: regen(troops),
      tick,
      nowMs: tick * 100,
    };
    ledger = settleLedger(ledger, tick, tick * 100, troops, regen(troops));
    if (tick % clickEvery === 0) {
      // The game asks for ratio × troops; ask big and let the governor trim.
      const out = governAttack({ cfg: c, ...base }, ledger, troops * 0.75);
      ledger = out.ledger;
      if (!out.held && out.troops > 0) landing.push({ at: tick + latency, amount: out.troops });
    }
  }
  return low / max;
}

describe("simulation: spam-clicking holds the 42% target at real-world latencies", () => {
  for (const latency of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
    for (const clickEvery of [1, 2, 5]) {
      test(`round trip ${latency} ticks, click every ${clickEvery}`, () => {
        // The pre-fix ledger drained to ~26% at latency ≥ 5.
        expect(simulate({ latency, clickEvery })).toBeGreaterThan(PEAK_PCT - 0.01);
      });
    }
  }
});

describe("settleLedger", () => {
  const at = (amount: number, tick = 10, t = 0) => ({ amount, tick, t });
  const ledgerOf = (sends: Array<ReturnType<typeof at>>, anchor = 1000, anchorTick = 10): Ledger => ({
    sends,
    anchor,
    anchorTick,
  });

  test("confirms once ticks have passed AND troops actually dropped", () => {
    const l = ledgerOf([at(100)]);
    expect(settleLedger(l, 10 + SETTLE_TICKS - 1, 500, 900, 0).sends).toHaveLength(1); // too soon
    expect(settleLedger(l, 10 + SETTLE_TICKS, 500, 1001, 0).sends).toHaveLength(1); // no drop yet
    expect(settleLedger(l, 10 + SETTLE_TICKS, 500, 900, 0).sends).toHaveLength(0);
  });

  test("a slow round trip doesn't confirm early — ticks alone aren't enough", () => {
    expect(settleLedger(ledgerOf([at(100)]), 30, 2000, 1000, 0).sends).toHaveLength(1);
  });

  test("FIFO: a big first deduction doesn't confirm the second send too", () => {
    const l = ledgerOf([at(500), at(100)]);
    const after = settleLedger(l, 10 + SETTLE_TICKS, 500, 500, 0);
    expect(after.sends.map((p) => p.amount)).toEqual([100]);
    // The anchor carries forward (1000 − 500), it is NOT re-derived.
    expect(after.anchor).toBe(500);
    expect(settleLedger(l, 10 + SETTLE_TICKS, 500, 400, 0).sends).toHaveLength(0);
  });

  test("the anchor integrates regen tick by tick (regen would mask small sends)", () => {
    // 100 sent; +30/tick for 10 ticks → 1300 expected with no deduction.
    // Observed 1200 = deducted. Without regen it would look like +200, no drop.
    const l = ledgerOf([at(100)]);
    expect(settleLedger(l, 20, 900, 1200, 0).sends).toHaveLength(1);
    expect(settleLedger(l, 20, 900, 1200, 30).sends).toHaveLength(0);
  });

  test("negative regen (troops above max decay) isn't mistaken for a deduction", () => {
    // −50/tick for 10 ticks → expected 500 with no deduction; observed 520.
    const l = ledgerOf([at(400)]);
    expect(settleLedger(l, 20, 900, 520, -50).sends).toHaveLength(1);
  });

  test("hard-expires after SETTLE_MAX_MS (rejected attack never deducts)", () => {
    expect(settleLedger(ledgerOf([at(100)]), 11, SETTLE_MAX_MS, 5000, 0).sends).toHaveLength(0);
  });

  test("an empty ledger re-anchors on the observed count", () => {
    expect(settleLedger(emptyLedger(), 50, 0, 777, 5)).toEqual({ sends: [], anchor: 777, anchorTick: 50 });
  });
});
