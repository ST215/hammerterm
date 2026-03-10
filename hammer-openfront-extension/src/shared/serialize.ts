/**
 * serialize.ts — Recursive serialization/deserialization for cross-context
 * state transfer. Handles Map, Set, BigInt, Date, and skips functions.
 */

export function serialize(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "function") return undefined;
  if (typeof obj === "bigint")
    return { __t: "B", v: obj.toString() };
  if (obj instanceof Date)
    return { __t: "D", v: obj.toISOString() };
  if (obj instanceof Map)
    return {
      __t: "M",
      e: [...obj.entries()].map(([k, v]) => [serialize(k), serialize(v)]),
    };
  if (obj instanceof Set)
    return { __t: "S", v: [...obj].map((v) => serialize(v)) };
  if (Array.isArray(obj)) return obj.map((v) => serialize(v));
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] !== "function") {
        result[key] = serialize(obj[key]);
      }
    }
    return result;
  }
  return obj;
}

/** Shallow equality check for two Maps (same keys → same values by ===) */
export function mapsEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (!b.has(k) || b.get(k) !== v) return false;
  }
  return true;
}

/** Shallow equality check for two Sets (same elements by ===) */
export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

export function deserialize(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (obj.__t === "B") return BigInt(obj.v);
  if (obj.__t === "D") return new Date(obj.v);
  if (obj.__t === "M")
    return new Map(
      obj.e.map(([k, v]: [any, any]) => [deserialize(k), deserialize(v)]),
    );
  if (obj.__t === "S")
    return new Set(obj.v.map((v: any) => deserialize(v)));
  if (Array.isArray(obj)) return obj.map((v) => deserialize(v));
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[key] = deserialize(obj[key]);
  }
  return result;
}
