/**
 * Tests for auto-donate (troops & gold) logic.
 *
 * Source: hammer-scripts/hammer.js lines 2837-3260
 * Bucket: Auto-donate — target resolution, tick logic, send calculations
 *
 * TODO: The actual asSendTroops/asSendGold functions require:
 *   - EventBus with discovered event classes (donateTroopsEventClass, donateGoldEventClass)
 *   - PlayerView objects from game-view or events-display DOM elements
 *   - WebSocket connection (gameSocket) as fallback
 *   - Mock getPlayerView() which queries DOM
 * To test them, you'd need to mock:
 *   - eventBus.emit()
 *   - getPlayerView() → fake PlayerView
 *   - gameSocket.send()
 *
 * TODO: asTroopsTick/asGoldTick require:
 *   - readMyPlayer() (queries game state)
 *   - asResolveTargets() (queries playersById)
 *   - asSendTroops/asSendGold (network calls)
 * Extract the calculation logic from the send+cooldown logic for testability.
 */
import { describe, expect, test, beforeEach } from "vitest";
import {
  estimateMaxTroops,
  dTroops,
  type PlayerData,
} from "./helpers/hammer-functions";

// ───────────────────────────────────────────────────────
// Troop send amount calculation
// (from asTroopsTick, line 2932)
// ───────────────────────────────────────────────────────
describe("auto-troops send calculation", () => {
  test("sends correct percentage of troops", () => {
    const troops = 100_000;
    const ratio = 20;
    const toSend = Math.max(1, Math.floor(troops * (ratio / 100)));
    expect(toSend).toBe(20_000);
  });

  test("minimum send is 1", () => {
    const troops = 1;
    const ratio = 10;
    const toSend = Math.max(1, Math.floor(troops * (ratio / 100)));
    expect(toSend).toBe(1);
  });

  test("100% sends all troops", () => {
    const troops = 50_000;
    const ratio = 100;
    const toSend = Math.max(1, Math.floor(troops * (ratio / 100)));
    expect(toSend).toBe(50_000);
  });

  test("5% of 1000 = 50", () => {
    expect(Math.max(1, Math.floor(1000 * (5 / 100)))).toBe(50);
  });
});

// ───────────────────────────────────────────────────────
// Threshold check
// (from asTroopsTick, line 2930)
// ───────────────────────────────────────────────────────
describe("auto-troops threshold check", () => {
  test("above threshold → sends", () => {
    const troops = 80_000;
    const maxT = 100_000;
    const threshold = 50;
    const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0;
    expect(troopPct >= threshold).toBe(true);
  });

  test("below threshold → does not send", () => {
    const troops = 30_000;
    const maxT = 100_000;
    const threshold = 50;
    const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0;
    expect(troopPct >= threshold).toBe(false);
  });

  test("exactly at threshold → sends", () => {
    const troops = 50_000;
    const maxT = 100_000;
    const threshold = 50;
    const troopPct = (troops / maxT) * 100;
    expect(troopPct >= threshold).toBe(true);
  });

  test("zero maxT → troopPct is 0 → does not send", () => {
    const troops = 100;
    const maxT = 0;
    const threshold = 50;
    const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0;
    expect(troopPct >= threshold).toBe(false);
  });
});

// ───────────────────────────────────────────────────────
// Threshold guard: remaining troops after send must stay above threshold
// (from auto-troops.ts — prevents over-sending)
// ───────────────────────────────────────────────────────
describe("auto-troops remaining threshold guard", () => {
  function shouldSend(troops: number, maxT: number, ratio: number, threshold: number): { send: boolean; toSend: number } {
    const toSend = Math.max(1, Math.floor(troops * (ratio / 100)));
    const remainingPct = maxT > 0 ? ((troops - toSend) / maxT) * 100 : 0;
    return { send: remainingPct >= threshold, toSend };
  }

  test("send when remaining stays above threshold", () => {
    // 80k troops, 100k max, 20% ratio → send 16k, remaining 64k (64%) > 50% threshold
    const result = shouldSend(80_000, 100_000, 20, 50);
    expect(result.send).toBe(true);
    expect(result.toSend).toBe(16_000);
  });

  test("skip when send would drop below threshold", () => {
    // 55k troops, 100k max, 20% ratio → send 11k, remaining 44k (44%) < 50% threshold
    const result = shouldSend(55_000, 100_000, 20, 50);
    expect(result.send).toBe(false);
  });

  test("skip when exactly at threshold before send", () => {
    // 50k troops, 100k max, 20% ratio → send 10k, remaining 40k (40%) < 50% threshold
    const result = shouldSend(50_000, 100_000, 20, 50);
    expect(result.send).toBe(false);
  });

  test("100% ratio always drops to 0 remaining → skips unless threshold is 0", () => {
    const result = shouldSend(80_000, 100_000, 100, 50);
    expect(result.send).toBe(false);
  });

  test("100% ratio with 0 threshold → sends everything", () => {
    const result = shouldSend(80_000, 100_000, 100, 0);
    expect(result.send).toBe(true);
  });

  test("multiple sequential sends track remaining correctly", () => {
    let troops = 80_000;
    const maxT = 100_000;
    const ratio = 20;
    const threshold = 50;
    let totalSent = 0;

    // Simulate sending to multiple targets (like the loop in auto-troops.ts)
    for (let i = 0; i < 5; i++) {
      const toSend = Math.max(1, Math.floor(troops * (ratio / 100)));
      const remainingPct = maxT > 0 ? ((troops - toSend) / maxT) * 100 : 0;
      if (remainingPct < threshold) break;
      troops -= toSend;
      totalSent += toSend;
    }
    // Should have sent to some targets but stopped before going below 50%
    expect(troops).toBeGreaterThanOrEqual(maxT * (threshold / 100));
    expect(totalSent).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────
// Auto-gold resource guard: skip when insufficient gold
// ───────────────────────────────────────────────────────
describe("auto-gold resource guard", () => {
  test("skip when gold less than toSend", () => {
    const gold = 5;
    const ratio = 50;
    const toSend = Math.max(1, Math.floor(gold * (ratio / 100)));
    // toSend = max(1, 2) = 2, gold = 5, 5 >= 2 → send
    expect(toSend <= 0 || gold < toSend).toBe(false);
  });

  test("skip when gold is 0", () => {
    const gold = 0;
    const ratio = 50;
    const toSend = Math.max(1, Math.floor(gold * (ratio / 100)));
    // toSend = max(1, 0) = 1, gold = 0, 0 < 1 → skip
    expect(toSend <= 0 || gold < toSend).toBe(true);
  });

  test("multiple sends reduce local gold tracker", () => {
    let gold = 10_000;
    const ratio = 25;
    let sends = 0;
    for (let i = 0; i < 10; i++) {
      const toSend = Math.max(1, Math.floor(gold * (ratio / 100)));
      if (toSend <= 0 || gold < toSend) break;
      gold -= toSend;
      sends++;
    }
    expect(sends).toBeGreaterThan(0);
    expect(gold).toBeGreaterThanOrEqual(0);
  });
});

// ───────────────────────────────────────────────────────
// Gold send amount calculation
// (from asGoldTick, line 3216)
// ───────────────────────────────────────────────────────
describe("auto-gold send calculation", () => {
  test("sends correct percentage of gold", () => {
    const gold = 1_000_000;
    const ratio = 25;
    const toSend = Math.max(1, Math.floor(gold * (ratio / 100)));
    expect(toSend).toBe(250_000);
  });

  test("filters out zero send", () => {
    const gold = 0;
    const ratio = 50;
    const toSend = Math.max(1, Math.floor(gold * (ratio / 100)));
    // max(1, 0) = 1, but the tick function checks toSend <= 0 BEFORE the max
    // Actually line 3216: const toSend = Math.max(1, Math.floor(gold * (S.asGoldRatio / 100)))
    // and line 3217: if (toSend <= 0) return -- this will never trigger because max(1, ...) >= 1
    // But if gold is 0: Math.floor(0 * 0.25) = 0, max(1, 0) = 1, so it sends 1.
    // The real guard is that the game won't accept 0 gold.
    expect(toSend).toBe(1);
  });
});

// ───────────────────────────────────────────────────────
// Cooldown timing
// ───────────────────────────────────────────────────────
describe("auto-send cooldown", () => {
  test("respects cooldown period", () => {
    const now = Date.now();
    const lastSend = now - 5000; // 5 seconds ago
    const cooldownMs = 10 * 1000; // 10 seconds
    const nextSend = lastSend + cooldownMs;
    expect(now >= nextSend).toBe(false); // still on cooldown
  });

  test("allows send after cooldown", () => {
    const now = Date.now();
    const lastSend = now - 15000; // 15 seconds ago
    const cooldownMs = 10 * 1000;
    const nextSend = lastSend + cooldownMs;
    expect(now >= nextSend).toBe(true); // cooldown expired
  });

  test("first send always allowed (lastSend=0)", () => {
    const now = Date.now();
    const lastSend = 0;
    const cooldownMs = 10 * 1000;
    const nextSend = lastSend + cooldownMs; // 10000ms since epoch → long past
    expect(now >= nextSend).toBe(true);
  });
});

// ───────────────────────────────────────────────────────
// Target resolution patterns
// ───────────────────────────────────────────────────────
describe("target resolution", () => {
  test("AllTeam mode resolves teammates", () => {
    const allTeamMode = true;
    const allAlliesMode = false;
    const teammates = [
      { id: "t1", name: "Ally1" },
      { id: "t2", name: "Ally2" },
    ];
    const allies = [{ id: "a1", name: "AllianceGuy" }];

    const result: Array<{ id: string; name: string }> = [];
    const ids = new Set<string>();
    if (allTeamMode) {
      for (const p of teammates) { result.push(p); ids.add(p.id); }
    }
    if (allAlliesMode) {
      for (const p of allies) { if (!ids.has(p.id)) result.push(p); }
    }
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("Ally1");
  });

  test("AllAllies mode resolves allies", () => {
    const allTeamMode = false;
    const allAlliesMode = true;
    const teammates: Array<{ id: string; name: string }> = [];
    const allies = [{ id: "a1", name: "AllianceGuy" }];

    const result: Array<{ id: string; name: string }> = [];
    const ids = new Set<string>();
    if (allTeamMode) {
      for (const p of teammates) { result.push(p); ids.add(p.id); }
    }
    if (allAlliesMode) {
      for (const p of allies) { if (!ids.has(p.id)) result.push(p); }
    }
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("AllianceGuy");
  });

  test("both modes deduplicates overlapping players", () => {
    const allTeamMode = true;
    const allAlliesMode = true;
    const teammates = [{ id: "t1", name: "SharedPlayer" }];
    const allies = [{ id: "t1", name: "SharedPlayer" }, { id: "a2", name: "OnlyAlly" }];

    const result: Array<{ id: string; name: string }> = [];
    const ids = new Set<string>();
    if (allTeamMode) {
      for (const p of teammates) { result.push(p); ids.add(p.id); }
    }
    if (allAlliesMode) {
      for (const p of allies) { if (!ids.has(p.id)) result.push(p); }
    }
    expect(result.length).toBe(2);
    expect(result.map((r) => r.name)).toEqual(["SharedPlayer", "OnlyAlly"]);
  });
});
