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
