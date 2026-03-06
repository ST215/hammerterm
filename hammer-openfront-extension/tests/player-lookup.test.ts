/**
 * Tests for player lookup and relationship functions.
 *
 * Source: hammer-scripts/hammer.js lines 1151-1200, 541-549, 1561-1569
 * Bucket: Player data — lookup, teammates, allies
 */
import { describe, expect, test, beforeEach } from "vitest";
import {
  readMyPlayer,
  findPlayer,
  findPlayerByName,
  getTeammates,
  getAllies,
  asIsAlly,
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
// findPlayer — case-insensitive name lookup
// ───────────────────────────────────────────────────────
describe("findPlayer", () => {
  let players: Map<string, PlayerData>;

  beforeEach(() => {
    players = new Map([
      ["p1", makePlayer({ id: "p1", displayName: "Alice" })],
      ["p2", makePlayer({ id: "p2", displayName: "Bob" })],
      ["p3", makePlayer({ id: "p3", name: "Charlie" })],
    ]);
  });

  test("finds by exact name", () => {
    const result = findPlayer("Alice", players);
    expect(result).toEqual({ id: "p1", name: "Alice" });
  });

  test("case-insensitive match", () => {
    expect(findPlayer("alice", players)).toEqual({ id: "p1", name: "Alice" });
    expect(findPlayer("ALICE", players)).toEqual({ id: "p1", name: "Alice" });
    expect(findPlayer("BOB", players)).toEqual({ id: "p2", name: "Bob" });
  });

  test("falls back to name field if no displayName", () => {
    const result = findPlayer("Charlie", players);
    expect(result).toEqual({ id: "p3", name: "Charlie" });
  });

  test("returns null for unknown player", () => {
    expect(findPlayer("Nobody", players)).toBeNull();
  });

  test("returns null for null/empty name", () => {
    expect(findPlayer(null, players)).toBeNull();
    expect(findPlayer("", players)).toBeNull();
  });

  test("returns null for empty map", () => {
    expect(findPlayer("Alice", new Map())).toBeNull();
  });
});

// ───────────────────────────────────────────────────────
// findPlayerByName — returns full PlayerData
// ───────────────────────────────────────────────────────
describe("findPlayerByName", () => {
  let players: Map<string, PlayerData>;

  beforeEach(() => {
    players = new Map([
      ["p1", makePlayer({ id: "p1", displayName: "Alice", troops: 5000 })],
    ]);
  });

  test("returns full player data", () => {
    const result = findPlayerByName("Alice", players);
    expect(result?.id).toBe("p1");
    expect(result?.troops).toBe(5000);
  });

  test("case-insensitive", () => {
    expect(findPlayerByName("alice", players)).not.toBeNull();
  });

  test("returns null for missing player", () => {
    expect(findPlayerByName("Nobody", players)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────
// readMyPlayer — find current player from data
// ───────────────────────────────────────────────────────
describe("readMyPlayer", () => {
  const me = makePlayer({ id: "p1", clientID: "client-abc", smallID: 42 });
  const other = makePlayer({ id: "p2", clientID: "client-xyz", smallID: 99 });

  test("finds by clientID in lastPlayers", () => {
    const result = readMyPlayer([me, other], new Map(), "client-abc", null);
    expect(result?.id).toBe("p1");
  });

  test("finds by smallID in lastPlayers", () => {
    const result = readMyPlayer([me, other], new Map(), null, 42);
    expect(result?.id).toBe("p1");
  });

  test("falls back to playersById when lastPlayers empty", () => {
    const byId = new Map([["p1", me], ["p2", other]]);
    const result = readMyPlayer([], byId, "client-abc", null);
    expect(result?.id).toBe("p1");
  });

  test("falls back to playersById with smallID", () => {
    const byId = new Map([["p1", me], ["p2", other]]);
    const result = readMyPlayer([], byId, null, 42);
    expect(result?.id).toBe("p1");
  });

  test("returns null when not found", () => {
    expect(readMyPlayer([], new Map(), "unknown", null)).toBeNull();
  });

  test("clientID takes priority over smallID in lastPlayers", () => {
    const ambiguous = makePlayer({ id: "p3", clientID: "client-abc", smallID: 99 });
    const result = readMyPlayer([me, ambiguous], new Map(), "client-abc", 99);
    // Should find the first match by clientID
    expect(result?.id).toBe("p1");
  });
});

// ───────────────────────────────────────────────────────
// asIsAlly — check teammate OR alliance partner
// ───────────────────────────────────────────────────────
describe("asIsAlly", () => {
  let players: Map<string, PlayerData>;

  beforeEach(() => {
    players = new Map([
      ["p1", makePlayer({ id: "p1", team: 1, smallID: 10 })],
      ["p2", makePlayer({ id: "p2", team: 2, smallID: 20 })],
      ["p3", makePlayer({ id: "p3", team: 2, smallID: 30 })],
    ]);
  });

  test("returns true for same team", () => {
    expect(asIsAlly("p1", players, 1, new Set())).toBe(true);
  });

  test("returns true for alliance partner", () => {
    expect(asIsAlly("p2", players, 1, new Set([20]))).toBe(true);
  });

  test("returns false for enemy (different team, not ally)", () => {
    expect(asIsAlly("p2", players, 1, new Set())).toBe(false);
  });

  test("returns false for unknown player ID", () => {
    expect(asIsAlly("unknown", players, 1, new Set())).toBe(false);
  });

  test("returns true when both teammate AND ally", () => {
    expect(asIsAlly("p1", players, 1, new Set([10]))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────
// getTeammates — same-team, alive, excluding self
// ───────────────────────────────────────────────────────
describe("getTeammates", () => {
  let players: Map<string, PlayerData>;

  beforeEach(() => {
    players = new Map([
      ["me", makePlayer({ id: "me", team: 1, displayName: "Me", isAlive: true })],
      ["t1", makePlayer({ id: "t1", team: 1, displayName: "Ally1", isAlive: true })],
      ["t2", makePlayer({ id: "t2", team: 1, displayName: "Ally2", isAlive: true })],
      ["dead", makePlayer({ id: "dead", team: 1, displayName: "DeadGuy", isAlive: false })],
      ["enemy", makePlayer({ id: "enemy", team: 2, displayName: "Enemy", isAlive: true })],
    ]);
  });

  test("returns alive same-team players excluding self", () => {
    const me = players.get("me")!;
    const result = getTeammates(players, me);
    expect(result.length).toBe(2);
    expect(result.map((p) => p.displayName)).toEqual(["Ally1", "Ally2"]);
  });

  test("excludes dead teammates", () => {
    const me = players.get("me")!;
    const result = getTeammates(players, me);
    expect(result.find((p) => p.displayName === "DeadGuy")).toBeUndefined();
  });

  test("excludes enemies", () => {
    const me = players.get("me")!;
    const result = getTeammates(players, me);
    expect(result.find((p) => p.displayName === "Enemy")).toBeUndefined();
  });

  test("returns empty for null me", () => {
    expect(getTeammates(players, null)).toEqual([]);
  });

  test("returns empty for me with null team", () => {
    const solo = makePlayer({ id: "solo", team: null });
    expect(getTeammates(players, solo)).toEqual([]);
  });

  test("results are sorted alphabetically", () => {
    const me = players.get("me")!;
    players.set("z1", makePlayer({ id: "z1", team: 1, displayName: "Zebra", isAlive: true }));
    players.set("a1", makePlayer({ id: "a1", team: 1, displayName: "Alpha", isAlive: true }));
    const result = getTeammates(players, me);
    const names = result.map((p) => p.displayName);
    expect(names).toEqual([...names].sort());
  });
});

// ───────────────────────────────────────────────────────
// getAllies — alliance partners (not teammates)
// ───────────────────────────────────────────────────────
describe("getAllies", () => {
  let players: Map<string, PlayerData>;

  beforeEach(() => {
    players = new Map([
      ["me", makePlayer({ id: "me", smallID: 1, team: 1, displayName: "Me" })],
      ["ally1", makePlayer({ id: "ally1", smallID: 10, team: 2, displayName: "Ally1", isAlive: true })],
      ["ally2", makePlayer({ id: "ally2", smallID: 20, team: 3, displayName: "Ally2", isAlive: true })],
      ["notally", makePlayer({ id: "notally", smallID: 30, team: 2, displayName: "NotAlly", isAlive: true })],
      ["deadally", makePlayer({ id: "deadally", smallID: 40, team: 2, displayName: "DeadAlly", isAlive: false })],
    ]);
  });

  test("returns alive alliance partners", () => {
    const me = players.get("me")!;
    const myAllies = new Set([10, 20]);
    const result = getAllies(players, me, myAllies);
    expect(result.length).toBe(2);
    expect(result.map((p) => p.displayName).sort()).toEqual(["Ally1", "Ally2"]);
  });

  test("excludes self", () => {
    const me = players.get("me")!;
    const myAllies = new Set([1, 10]); // includes own smallID
    const result = getAllies(players, me, myAllies);
    expect(result.find((p) => p.displayName === "Me")).toBeUndefined();
  });

  test("excludes dead allies", () => {
    const me = players.get("me")!;
    const myAllies = new Set([10, 40]);
    const result = getAllies(players, me, myAllies);
    expect(result.find((p) => p.displayName === "DeadAlly")).toBeUndefined();
  });

  test("excludes non-ally players", () => {
    const me = players.get("me")!;
    const myAllies = new Set([10]);
    const result = getAllies(players, me, myAllies);
    expect(result.find((p) => p.displayName === "NotAlly")).toBeUndefined();
  });

  test("returns empty for null me", () => {
    expect(getAllies(players, null, new Set([10]))).toEqual([]);
  });
});
