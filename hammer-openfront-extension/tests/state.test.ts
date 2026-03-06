/**
 * Tests for state management helpers.
 *
 * Source: hammer-scripts/hammer.js lines 1081-1110
 * Bucket: Donation tracking state — bump / bumpPorts
 */
import { describe, expect, test, beforeEach } from "vitest";
import {
  bump,
  bumpPorts,
  type DonationRecord,
  type PortRecord,
} from "./helpers/hammer-functions";

// ───────────────────────────────────────────────────────
// bump — initialize or get a donation record
// ───────────────────────────────────────────────────────
describe("bump", () => {
  let map: Map<string, DonationRecord>;

  beforeEach(() => {
    map = new Map();
  });

  test("creates a new record with zeroed fields", () => {
    const r = bump(map, "player1");
    expect(r.gold).toBe(0);
    expect(r.troops).toBe(0);
    expect(r.count).toBe(0);
    expect(r.goldSends).toBe(0);
    expect(r.troopsSends).toBe(0);
    expect(r.last).toBeNull();
    expect(r.lastDonorTroops).toBe(0);
  });

  test("returns existing record on second call", () => {
    const r1 = bump(map, "player1");
    r1.gold = 500;
    const r2 = bump(map, "player1");
    expect(r2.gold).toBe(500);
    expect(r2).toBe(r1); // same reference
  });

  test("different keys get independent records", () => {
    const r1 = bump(map, "player1");
    const r2 = bump(map, "player2");
    r1.gold = 100;
    expect(r2.gold).toBe(0);
  });

  test("record is stored in the map", () => {
    bump(map, "abc");
    expect(map.has("abc")).toBe(true);
    expect(map.size).toBe(1);
  });
});

// ───────────────────────────────────────────────────────
// bumpPorts — port trade statistics
// ───────────────────────────────────────────────────────
describe("bumpPorts", () => {
  let ports: Map<string, PortRecord>;

  beforeEach(() => {
    ports = new Map();
  });

  test("creates new port record", () => {
    bumpPorts(ports, "port1", 1000, 10000);
    const p = ports.get("port1")!;
    expect(p).toBeDefined();
    expect(p.totalGold).toBe(1000);
    expect(p.times.length).toBe(1);
  });

  test("accumulates gold over trades", () => {
    bumpPorts(ports, "port1", 1000, 10000);
    bumpPorts(ports, "port1", 2000, 20000);
    const p = ports.get("port1")!;
    expect(p.totalGold).toBe(3000);
    expect(p.times.length).toBe(2);
  });

  test("calculates average and last interval after 2+ trades", () => {
    bumpPorts(ports, "port1", 1000, 10000); // t=10s
    bumpPorts(ports, "port1", 1000, 20000); // t=20s, interval=10s
    const p = ports.get("port1")!;
    expect(p.avgIntSec).toBe(10);
    expect(p.lastIntSec).toBe(10);
  });

  test("calculates gpm (gold per minute)", () => {
    bumpPorts(ports, "port1", 1000, 0);
    bumpPorts(ports, "port1", 1000, 60000); // 60s later
    const p = ports.get("port1")!;
    // totalGold=2000, window=60s=1min, gpm = 2000/1 = 2000
    expect(p.gpm).toBe(2000);
  });

  test("trims times array to max 60 entries", () => {
    for (let i = 0; i < 65; i++) {
      bumpPorts(ports, "port1", 100, i * 10000);
    }
    const p = ports.get("port1")!;
    expect(p.times.length).toBe(60);
  });

  test("single trade produces no interval stats", () => {
    bumpPorts(ports, "port1", 5000, 0);
    const p = ports.get("port1")!;
    expect(p.avgIntSec).toBe(0);
    expect(p.lastIntSec).toBe(0);
    expect(p.gpm).toBe(0);
  });

  test("multiple different ports tracked independently", () => {
    bumpPorts(ports, "portA", 1000, 0);
    bumpPorts(ports, "portB", 2000, 0);
    expect(ports.get("portA")!.totalGold).toBe(1000);
    expect(ports.get("portB")!.totalGold).toBe(2000);
  });
});
