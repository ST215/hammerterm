/**
 * Tests for serialize/deserialize cross-context state transfer.
 */
import { describe, expect, test } from "vitest";
import { serialize, deserialize, deserializeWithSharing } from "../src/shared/serialize";

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

describe("deserializeWithSharing", () => {
  test("primitives pass through directly", () => {
    expect(deserializeWithSharing(42, 42)).toBe(42);
    expect(deserializeWithSharing("hi", "hi")).toBe("hi");
    expect(deserializeWithSharing(true, false)).toBe(true);
    expect(deserializeWithSharing(null, "old")).toBe(null);
    expect(deserializeWithSharing(undefined, "old")).toBe(undefined);
  });

  test("unchanged BigInt returns previous reference", () => {
    const prev = 123456789n;
    const wire = serialize(prev);
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(prev);
  });

  test("changed BigInt returns new value", () => {
    const prev = 100n;
    const wire = serialize(200n);
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(200n);
    expect(result).not.toBe(prev);
  });

  test("unchanged Date returns previous reference", () => {
    const prev = new Date("2025-01-15T12:00:00Z");
    const wire = serialize(prev);
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(prev);
  });

  test("changed Date returns new instance", () => {
    const prev = new Date("2025-01-15T12:00:00Z");
    const wire = serialize(new Date("2025-06-01T00:00:00Z"));
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result.toISOString()).toBe("2025-06-01T00:00:00.000Z");
  });

  test("unchanged Map returns previous reference", () => {
    const prev = new Map([["a", 1], ["b", 2]]);
    const wire = serialize(new Map([["a", 1], ["b", 2]]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(prev);
  });

  test("Map with one changed value returns new Map", () => {
    const prev = new Map([["a", 1], ["b", 2]]);
    const wire = serialize(new Map([["a", 1], ["b", 99]]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result).toBeInstanceOf(Map);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(99);
  });

  test("Map with different size returns new Map", () => {
    const prev = new Map([["a", 1]]);
    const wire = serialize(new Map([["a", 1], ["b", 2]]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result.size).toBe(2);
  });

  test("unchanged Set returns previous reference", () => {
    const prev = new Set([1, 2, 3]);
    const wire = serialize(new Set([1, 2, 3]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(prev);
  });

  test("changed Set returns new Set", () => {
    const prev = new Set([1, 2, 3]);
    const wire = serialize(new Set([1, 2, 4]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result.has(4)).toBe(true);
    expect(result.has(3)).toBe(false);
  });

  test("unchanged array returns previous reference", () => {
    const prev = [1, 2, 3];
    const wire = serialize([1, 2, 3]);
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(prev);
  });

  test("array with one changed element returns new array", () => {
    const prev = [1, 2, 3];
    const wire = serialize([1, 99, 3]);
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result).toEqual([1, 99, 3]);
  });

  test("unchanged nested object returns previous reference", () => {
    const prev = { x: 1, nested: { a: "hello", b: true } };
    const wire = serialize({ x: 1, nested: { a: "hello", b: true } });
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBe(prev);
    expect(result.nested).toBe(prev.nested);
  });

  test("object with one changed field returns new object, reuses nested", () => {
    const nested = { a: "hello", b: true };
    const prev = { x: 1, nested, other: 42 };
    const wire = serialize({ x: 1, nested: { a: "hello", b: true }, other: 99 });
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result.nested).toBe(nested); // nested unchanged, reuse ref
    expect(result.other).toBe(99);
  });

  test("previous is wrong type falls back to fresh deserialize", () => {
    const prev = "not a map";
    const wire = serialize(new Map([["k", "v"]]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).toBeInstanceOf(Map);
    expect(result.get("k")).toBe("v");
  });

  test("previous is null falls back to fresh deserialize", () => {
    const wire = serialize({ a: 1, b: new Set([1, 2]) });
    const result = deserializeWithSharing(wire, null);
    expect(result.a).toBe(1);
    expect(result.b).toBeInstanceOf(Set);
    expect(result.b.has(1)).toBe(true);
  });

  test("previous is undefined falls back to fresh deserialize", () => {
    const wire = serialize([1, 2, 3]);
    const result = deserializeWithSharing(wire, undefined);
    expect(result).toEqual([1, 2, 3]);
  });

  test("Map with nested object values shares unchanged entries", () => {
    const playerData = { id: "p1", name: "Alice", troops: 1000 };
    const prev = new Map([["p1", playerData], ["p2", { id: "p2", name: "Bob", troops: 500 }]]);
    const wire = serialize(new Map([
      ["p1", { id: "p1", name: "Alice", troops: 1000 }],
      ["p2", { id: "p2", name: "Bob", troops: 700 }],
    ]));
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev); // Map changed (p2 troops changed)
    expect(result.get("p1")).toBe(playerData); // p1 unchanged, reuse ref
    expect(result.get("p2")).not.toBe(prev.get("p2")); // p2 changed
    expect(result.get("p2").troops).toBe(700);
  });

  test("full round-trip: identical state returns all same references", () => {
    const state = {
      playersById: new Map([
        ["p1", { id: "p1", name: "Alice", troops: 1000, gold: 500n }],
      ]),
      myAllies: new Set([2, 3, 5]),
      inbound: new Map([
        ["p2", { gold: 100, troops: 200, count: 3 }],
      ]),
      feedIn: [
        { ts: 1000, from: "p1", amount: 50 },
        { ts: 2000, from: "p2", amount: 100 },
      ],
      view: "summary",
      paused: false,
      asTroopsNextSend: { p1: 1234567890, p2: 1234567900 },
    };
    const wire = serialize(state);
    const result = deserializeWithSharing(wire, state);

    expect(result).toBe(state);
    expect(result.playersById).toBe(state.playersById);
    expect(result.myAllies).toBe(state.myAllies);
    expect(result.inbound).toBe(state.inbound);
    expect(result.feedIn).toBe(state.feedIn);
    expect(result.asTroopsNextSend).toBe(state.asTroopsNextSend);
  });

  test("full round-trip: one changed field, rest preserved", () => {
    const state = {
      playersById: new Map([
        ["p1", { id: "p1", name: "Alice", troops: 1000 }],
      ]),
      myAllies: new Set([2, 3]),
      count: 42,
    };
    const updated = {
      playersById: new Map([
        ["p1", { id: "p1", name: "Alice", troops: 1000 }],
      ]),
      myAllies: new Set([2, 3]),
      count: 43, // only this changed
    };
    const wire = serialize(updated);
    const result = deserializeWithSharing(wire, state);

    expect(result).not.toBe(state); // top object changed
    expect(result.playersById).toBe(state.playersById); // unchanged, reuse
    expect(result.myAllies).toBe(state.myAllies); // unchanged, reuse
    expect(result.count).toBe(43);
  });

  test("object with different key count returns new object", () => {
    const prev = { a: 1, b: 2 };
    const wire = serialize({ a: 1, b: 2, c: 3 });
    const result = deserializeWithSharing(wire, prev);
    expect(result).not.toBe(prev);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});
