/**
 * Tests for serialize/deserialize cross-context state transfer.
 */
import { describe, expect, test } from "vitest";
import { serialize, deserialize } from "../src/shared/serialize";

describe("serialize / deserialize", () => {
  test("handles primitives", () => {
    expect(deserialize(serialize(42))).toBe(42);
    expect(deserialize(serialize("hello"))).toBe("hello");
    expect(deserialize(serialize(true))).toBe(true);
    expect(deserialize(serialize(null))).toBe(null);
    expect(deserialize(serialize(undefined))).toBe(undefined);
  });

  test("handles BigInt", () => {
    const val = 123456789012345678901234n;
    const result = deserialize(serialize(val));
    expect(result).toBe(val);
    expect(typeof result).toBe("bigint");
  });

  test("handles Date", () => {
    const date = new Date("2025-01-15T12:00:00Z");
    const result = deserialize(serialize(date));
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe(date.toISOString());
  });

  test("handles Map", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const result = deserialize(serialize(map));
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  test("handles Map with numeric keys", () => {
    const map = new Map<number, string>([
      [1, "one"],
      [2, "two"],
    ]);
    const result = deserialize(serialize(map));
    expect(result).toBeInstanceOf(Map);
    expect(result.get(1)).toBe("one");
    expect(result.get(2)).toBe("two");
  });

  test("handles Set", () => {
    const set = new Set([1, 2, 3]);
    const result = deserialize(serialize(set));
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has(1)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  test("handles nested Maps and Sets", () => {
    const data = {
      flowGraph: new Map([
        ["A→B", { gold: 100, troops: 200 }],
      ]),
      seen: new Set(["key1", "key2"]),
    };
    const result = deserialize(serialize(data));
    expect(result.flowGraph).toBeInstanceOf(Map);
    expect(result.flowGraph.get("A→B")).toEqual({ gold: 100, troops: 200 });
    expect(result.seen).toBeInstanceOf(Set);
    expect(result.seen.has("key1")).toBe(true);
  });

  test("handles arrays", () => {
    const arr = [1, "two", new Map([["k", "v"]])];
    const result = deserialize(serialize(arr));
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe("two");
    expect(result[2]).toBeInstanceOf(Map);
    expect(result[2].get("k")).toBe("v");
  });

  test("skips functions", () => {
    const obj = {
      value: 42,
      fn: () => {},
      nested: { action: () => {}, data: "ok" },
    };
    const result = serialize(obj);
    expect(result.value).toBe(42);
    expect(result.fn).toBeUndefined();
    expect(result.nested.action).toBeUndefined();
    expect(result.nested.data).toBe("ok");
  });

  test("handles complex store-like state", () => {
    const state = {
      playersById: new Map([
        ["p1", { id: "p1", name: "Alice", troops: 1000, gold: 500n }],
      ]),
      myAllies: new Set([2, 3, 5]),
      inbound: new Map([
        ["p2", { gold: 100, troops: 200, count: 3, last: new Date("2025-01-01") }],
      ]),
      view: "summary",
      paused: false,
    };
    const result = deserialize(serialize(state));
    expect(result.playersById).toBeInstanceOf(Map);
    expect(result.playersById.get("p1").gold).toBe(500n);
    expect(result.myAllies).toBeInstanceOf(Set);
    expect(result.myAllies.has(3)).toBe(true);
    expect(result.inbound.get("p2").last).toBeInstanceOf(Date);
    expect(result.view).toBe("summary");
    expect(result.paused).toBe(false);
  });

  test("handles empty Map and Set", () => {
    const data = { m: new Map(), s: new Set() };
    const result = deserialize(serialize(data));
    expect(result.m).toBeInstanceOf(Map);
    expect(result.m.size).toBe(0);
    expect(result.s).toBeInstanceOf(Set);
    expect(result.s.size).toBe(0);
  });
});
