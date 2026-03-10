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

/**
 * Deserialize with structural sharing: reuse `previous` references when the
 * incoming wire data is equivalent. This prevents React from re-rendering
 * when dashboard snapshots arrive with identical data but new object refs.
 */
export function deserializeWithSharing(incoming: any, previous: any): any {
  // Primitives: compared by value, no sharing needed
  if (incoming === null || incoming === undefined) return incoming;
  if (typeof incoming !== "object") return incoming;

  // BigInt
  if (incoming.__t === "B") {
    if (typeof previous === "bigint" && previous.toString() === incoming.v)
      return previous;
    return BigInt(incoming.v);
  }

  // Date
  if (incoming.__t === "D") {
    if (previous instanceof Date && previous.toISOString() === incoming.v)
      return previous;
    return new Date(incoming.v);
  }

  // Map
  if (incoming.__t === "M") {
    const entries: [any, any][] = incoming.e;
    if (previous instanceof Map && previous.size === entries.length) {
      let allSame = true;
      const newEntries: [any, any][] = [];
      for (const [wk, wv] of entries) {
        const dk = deserializeWithSharing(wk, wk); // keys are primitives after serialize
        const prevVal = previous.get(dk);
        const dv = deserializeWithSharing(wv, prevVal);
        newEntries.push([dk, dv]);
        if (dv !== prevVal) allSame = false;
      }
      if (allSame) return previous;
      return new Map(newEntries);
    }
    return new Map(
      entries.map(([k, v]: [any, any]) => [deserialize(k), deserialize(v)]),
    );
  }

  // Set
  if (incoming.__t === "S") {
    const vals: any[] = incoming.v;
    if (previous instanceof Set && previous.size === vals.length) {
      const deserialized = vals.map((v) => deserialize(v));
      const allPresent = deserialized.every((v) => previous.has(v));
      if (allPresent) return previous;
      return new Set(deserialized);
    }
    return new Set(vals.map((v: any) => deserialize(v)));
  }

  // Array
  if (Array.isArray(incoming)) {
    if (Array.isArray(previous) && previous.length === incoming.length) {
      let allSame = true;
      const result = incoming.map((item, i) => {
        const dv = deserializeWithSharing(item, previous[i]);
        if (dv !== previous[i]) allSame = false;
        return dv;
      });
      if (allSame) return previous;
      return result;
    }
    return incoming.map((v) => deserialize(v));
  }

  // Object
  if (typeof incoming === "object") {
    const inKeys = Object.keys(incoming);
    if (
      previous != null &&
      typeof previous === "object" &&
      !Array.isArray(previous) &&
      !(previous instanceof Map) &&
      !(previous instanceof Set) &&
      !(previous instanceof Date)
    ) {
      const prevKeys = Object.keys(previous);
      if (prevKeys.length === inKeys.length) {
        let allSame = true;
        const result: Record<string, any> = {};
        for (const key of inKeys) {
          if (!(key in previous)) {
            allSame = false;
            result[key] = deserialize(incoming[key]);
          } else {
            const dv = deserializeWithSharing(incoming[key], previous[key]);
            result[key] = dv;
            if (dv !== previous[key]) allSame = false;
          }
        }
        if (allSame) return previous;
        return result;
      }
    }
    const result: Record<string, any> = {};
    for (const key of inKeys) {
      result[key] = deserialize(incoming[key]);
    }
    return result;
  }

  return incoming;
}
