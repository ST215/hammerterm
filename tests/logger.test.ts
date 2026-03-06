/**
 * Tests for the Logger module.
 *
 * Source: hammer-scripts/hammer.js lines 168-272
 * Bucket: Logging & diagnostics
 */
import { describe, expect, test } from "bun:test";
import {
  extractCategory,
  serializeValue,
  createLogBuffer,
  LOG_LEVELS,
  CONSOLE_LEVEL_MAP,
} from "./helpers/hammer-functions";

// ───────────────────────────────────────────────────────
// extractCategory — pull [CATEGORY] from log args
// ───────────────────────────────────────────────────────
describe("extractCategory", () => {
  test("extracts bracketed category from first arg", () => {
    expect(extractCategory(["[RECIPROCATE] Auto sending"])).toBe("RECIPROCATE");
    expect(extractCategory(["[DEBUG] some info"])).toBe("DEBUG");
    expect(extractCategory(["[AUTO-TROOPS] Started"])).toBe("AUTO-TROOPS");
  });

  test("returns null for no brackets", () => {
    expect(extractCategory(["no brackets here"])).toBeNull();
    expect(extractCategory(["hello world"])).toBeNull();
  });

  test("returns null for empty args", () => {
    expect(extractCategory([])).toBeNull();
  });

  test("returns null for non-string first arg", () => {
    expect(extractCategory([42, "text"])).toBeNull();
    expect(extractCategory([null])).toBeNull();
    expect(extractCategory([{ key: "val" }])).toBeNull();
  });

  test("extracts first bracket match only", () => {
    expect(extractCategory(["[A] then [B]"])).toBe("A");
  });
});

// ───────────────────────────────────────────────────────
// serializeValue — safe value serialization for logs
// ───────────────────────────────────────────────────────
describe("serializeValue", () => {
  test("passes through primitives", () => {
    expect(serializeValue("hello")).toBe("hello");
    expect(serializeValue(42)).toBe(42);
    expect(serializeValue(true)).toBe(true);
    expect(serializeValue(null)).toBeNull();
  });

  test("serializes Error objects", () => {
    const err = new TypeError("test error");
    const result = serializeValue(err) as Record<string, unknown>;
    expect(result.type).toBe("Error");
    expect(result.message).toBe("test error");
    expect(result.name).toBe("TypeError");
    expect(typeof result.stack).toBe("string");
  });

  test("passes through serializable objects", () => {
    const obj = { a: 1, b: "two" };
    expect(serializeValue(obj)).toEqual(obj);
  });

  test("handles circular references", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(serializeValue(obj)).toBe("[Circular]");
  });
});

// ───────────────────────────────────────────────────────
// createLogBuffer — circular log buffer + filtering
// ───────────────────────────────────────────────────────
describe("createLogBuffer", () => {
  test("adds and retrieves logs", () => {
    const buf = createLogBuffer(100);
    buf.addLog({ level: "log", args: ["test"], timestamp: new Date().toISOString() });
    const { totalLogs, logs } = buf.exportLogs();
    expect(totalLogs).toBe(1);
    expect(logs.length).toBe(1);
    expect(logs[0].args).toEqual(["test"]);
  });

  test("adds category from args", () => {
    const buf = createLogBuffer(100);
    buf.addLog({ level: "log", args: ["[CIA] tracking"], timestamp: new Date().toISOString() });
    const { logs } = buf.exportLogs();
    expect(logs[0].category).toBe("CIA");
  });

  test("respects max entries (circular overwrite)", () => {
    const buf = createLogBuffer(3);
    for (let i = 0; i < 5; i++) {
      buf.addLog({ level: "log", args: [`msg${i}`], timestamp: new Date().toISOString() });
    }
    const buffer = buf.getBuffer();
    expect(buffer.length).toBe(3);
    // Oldest entries should be overwritten
  });

  test("filters by level", () => {
    const buf = createLogBuffer(100);
    buf.addLog({ level: "log", args: ["info msg"], timestamp: "t1" });
    buf.addLog({ level: "warn", args: ["warn msg"], timestamp: "t2" });
    buf.addLog({ level: "error", args: ["error msg"], timestamp: "t3" });

    const { logs } = buf.exportLogs({ level: "warn" });
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toBe("warn msg");
  });

  test("filters by minLevel", () => {
    const buf = createLogBuffer(100);
    buf.addLog({ level: "debug", args: ["debug"], timestamp: "t1" });
    buf.addLog({ level: "log", args: ["info"], timestamp: "t2" });
    buf.addLog({ level: "warn", args: ["warning"], timestamp: "t3" });
    buf.addLog({ level: "error", args: ["error"], timestamp: "t4" });

    const { logs } = buf.exportLogs({ minLevel: "warn" });
    expect(logs.length).toBe(2);
    expect(logs[0].level).toBe("warn");
    expect(logs[1].level).toBe("error");
  });

  test("respects limit option", () => {
    const buf = createLogBuffer(100);
    for (let i = 0; i < 20; i++) {
      buf.addLog({ level: "log", args: [`msg${i}`], timestamp: `t${i}` });
    }
    const { logs } = buf.exportLogs({ limit: 5 });
    expect(logs.length).toBe(5);
    // Should return LAST 5
    expect(logs[0].args[0]).toBe("msg15");
    expect(logs[4].args[0]).toBe("msg19");
  });

  test("respects minLogLevel setting", () => {
    const buf = createLogBuffer(100);
    buf.setMinLevel(LOG_LEVELS.WARN);
    buf.addLog({ level: "debug", args: ["debug"], timestamp: "t1" });
    buf.addLog({ level: "log", args: ["info"], timestamp: "t2" });
    buf.addLog({ level: "warn", args: ["warning"], timestamp: "t3" });
    // debug and log should be filtered at addLog time
    expect(buf.getBuffer().length).toBe(1);
    expect(buf.getBuffer()[0].level).toBe("warn");
  });
});

// ───────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────
describe("log level constants", () => {
  test("LOG_LEVELS ascending order", () => {
    expect(LOG_LEVELS.DEBUG).toBeLessThan(LOG_LEVELS.INFO);
    expect(LOG_LEVELS.INFO).toBeLessThan(LOG_LEVELS.WARN);
    expect(LOG_LEVELS.WARN).toBeLessThan(LOG_LEVELS.ERROR);
  });

  test("CONSOLE_LEVEL_MAP maps console methods", () => {
    expect(CONSOLE_LEVEL_MAP["debug"]).toBe(0);
    expect(CONSOLE_LEVEL_MAP["log"]).toBe(1);
    expect(CONSOLE_LEVEL_MAP["info"]).toBe(1);
    expect(CONSOLE_LEVEL_MAP["warn"]).toBe(2);
    expect(CONSOLE_LEVEL_MAP["error"]).toBe(3);
  });
});
