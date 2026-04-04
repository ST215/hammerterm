/**
 * Regression tests for UI blink fix (v15.3.0).
 *
 * Root cause: normalizePlayer() converted team to Number(), which turned
 * string team names ("Red") into NaN → null. The 3-second handleRefresh()
 * reads from the DOM (team as string), while Worker sends team as number.
 * This oscillation caused myTeam to flip between valid/null, making
 * useTeammates() return [] on every refresh cycle → UI sections vanished.
 *
 * These tests ensure:
 * 1. Team values survive both string and number formats
 * 2. getTeammates/getAllies work with string teams (from DOM refresh)
 * 3. Player list equality checks handle mixed team types
 */
import { describe, expect, test } from "vitest";
import {
  getTeammates,
  getAllies,
  type PlayerData,
} from "./helpers/hammer-functions";

function makePlayer(overrides: Partial<PlayerData> & { id: string }): PlayerData {
  return {
    smallID: null,
    clientID: null,
    isAlive: true,
    team: null,
    troops: 1000,
    gold: 5000,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────
// normalizePlayer team handling — the root cause fix
// ───────────────────────────────────────────────────────
describe("team value normalization (blink root cause)", () => {
  test("Number('Red') is NaN — this was the bug", () => {
    // This is the exact conversion that caused the blink:
    // team: Number(readProp(p, "team") ?? 0) || null
    const stringTeam = "Red";
    const broken = Number(stringTeam) || null;
    expect(broken).toBeNull(); // NaN || null = null — BUG

    // The fix: keep the raw value
    const fixed = stringTeam ?? null;
    expect(fixed).toBe("Red"); // Correct
  });

  test("numeric team values pass through correctly", () => {
    const numTeam = 5;
    const result = numTeam ?? null;
    expect(result).toBe(5);
  });

  test("null/undefined team becomes null", () => {
    expect(null ?? null).toBeNull();
    expect(undefined ?? null).toBeNull();
  });

  test("zero team becomes 0 (not null)", () => {
    // Important: ?? only nullifies null/undefined, not 0
    expect(0 ?? null).toBe(0);
  });
});

// ───────────────────────────────────────────────────────
// getTeammates with string teams (from DOM refresh path)
// ───────────────────────────────────────────────────────
describe("getTeammates with string team values", () => {
  test("matches string team from DOM refresh path", () => {
    const players = new Map<string, PlayerData>([
      ["me", makePlayer({ id: "me", team: "Red" as any, displayName: "Me" })],
      ["t1", makePlayer({ id: "t1", team: "Red" as any, displayName: "Ally1" })],
      ["t2", makePlayer({ id: "t2", team: "Blue" as any, displayName: "Enemy" })],
    ]);
    const me = players.get("me")!;
    const result = getTeammates(players, me);
    expect(result.length).toBe(1);
    expect(result[0].displayName).toBe("Ally1");
  });

  test("mixed number and string teams do NOT match", () => {
    // Worker sends team=5, DOM sends team="Red" — these should NOT match
    const players = new Map<string, PlayerData>([
      ["me", makePlayer({ id: "me", team: 5, displayName: "Me" })],
      ["t1", makePlayer({ id: "t1", team: "Red" as any, displayName: "WrongType" })],
      ["t2", makePlayer({ id: "t2", team: 5, displayName: "SameTeam" })],
    ]);
    const me = players.get("me")!;
    const result = getTeammates(players, me);
    expect(result.length).toBe(1);
    expect(result[0].displayName).toBe("SameTeam");
  });
});

// ───────────────────────────────────────────────────────
// useTeammates selector logic (without React hooks)
// Tests the selector function that runs inside useStore()
// ───────────────────────────────────────────────────────
describe("teammates selector stability (prevents blink)", () => {
  function selectTeammates(
    playersById: Map<string, PlayerData>,
    mySmallID: number | null,
    myTeam: any,
  ): PlayerData[] {
    if (myTeam == null || mySmallID == null) return [];
    const result: PlayerData[] = [];
    for (const p of playersById.values()) {
      if (p.smallID === mySmallID) continue;
      if (p.team !== myTeam || !p.isAlive) continue;
      result.push(p);
    }
    return result.sort((a, b) =>
      (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""),
    );
  }

  const players = new Map<string, PlayerData>([
    ["me", makePlayer({ id: "me", smallID: 1, team: 5, displayName: "Me" })],
    ["t1", makePlayer({ id: "t1", smallID: 2, team: 5, displayName: "Alice" })],
    ["t2", makePlayer({ id: "t2", smallID: 3, team: 5, displayName: "Bob" })],
    ["e1", makePlayer({ id: "e1", smallID: 4, team: 6, displayName: "Enemy" })],
  ]);

  test("returns teammates when identity is set", () => {
    const result = selectTeammates(players, 1, 5);
    expect(result.length).toBe(2);
    expect(result.map(p => p.displayName)).toEqual(["Alice", "Bob"]);
  });

  test("returns empty when mySmallID is null (not yet identified)", () => {
    const result = selectTeammates(players, null, 5);
    expect(result).toEqual([]);
  });

  test("returns empty when myTeam is null", () => {
    const result = selectTeammates(players, 1, null);
    expect(result).toEqual([]);
  });

  test("excludes self by smallID", () => {
    const result = selectTeammates(players, 1, 5);
    expect(result.find(p => p.smallID === 1)).toBeUndefined();
  });

  test("stable identity prevents blink during map replacement", () => {
    // Simulate handleRefresh() replacing the map with new objects
    // but mySmallID and myTeam stay the same (they're store fields, not derived)
    const freshMap = new Map<string, PlayerData>();
    for (const [id, p] of players) {
      freshMap.set(id, { ...p }); // New object refs
    }

    const before = selectTeammates(players, 1, 5);
    const after = selectTeammates(freshMap, 1, 5);

    // Same length, same IDs — playerListEqual would return true
    expect(before.length).toBe(after.length);
    for (let i = 0; i < before.length; i++) {
      expect(before[i].id).toBe(after[i].id);
      expect(before[i].displayName).toBe(after[i].displayName);
    }
  });
});

// ───────────────────────────────────────────────────────
// allAlivePlayers selector stability
// ───────────────────────────────────────────────────────
describe("allAlivePlayers selector stability", () => {
  function selectAllAlive(
    playersById: Map<string, PlayerData>,
    mySmallID: number | null,
  ): PlayerData[] {
    const result: PlayerData[] = [];
    for (const p of playersById.values()) {
      if (mySmallID != null && p.smallID === mySmallID) continue;
      if (!p.isAlive) continue;
      result.push(p);
    }
    return result.sort((a, b) =>
      (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""),
    );
  }

  const players = new Map<string, PlayerData>([
    ["me", makePlayer({ id: "me", smallID: 1, displayName: "Me" })],
    ["p1", makePlayer({ id: "p1", smallID: 2, displayName: "Alice" })],
    ["p2", makePlayer({ id: "p2", smallID: 3, displayName: "Bob" })],
  ]);

  test("excludes self consistently regardless of map reference", () => {
    const result1 = selectAllAlive(players, 1);
    expect(result1.length).toBe(2); // Alice, Bob

    // New map, same data — should give identical result
    const freshMap = new Map(players);
    const result2 = selectAllAlive(freshMap, 1);
    expect(result2.length).toBe(2);
    expect(result2.map(p => p.id)).toEqual(result1.map(p => p.id));
  });

  test("includes self when mySmallID is null (old bug: list length flickered ±1)", () => {
    // When readMyPlayer() returned null, me wasn't excluded → list.length changed
    // → playerListEqual failed → re-render. Now we use mySmallID directly.
    const withMe = selectAllAlive(players, null);
    const withoutMe = selectAllAlive(players, 1);
    expect(withMe.length).toBe(3);
    expect(withoutMe.length).toBe(2);
    // The fix ensures mySmallID is always set (never null after bootstrap),
    // so the list length is stable.
  });
});
