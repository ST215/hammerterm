/**
 * Tests for pure utility functions.
 *
 * Source: hammer-scripts/hammer.js lines 580-617
 * Bucket: Formatting & data conversion utilities
 */
import { describe, expect, test } from "vitest";
import {
  dTroops,
  num,
  esc,
  short,
  comma,
  fullNum,
  fmtSec,
  fmtDuration,
  parseAmt,
  TROOP_DISPLAY_DIV,
} from "./helpers/hammer-functions";

// ───────────────────────────────────────────────────────
// dTroops — game stores troops at 10x display value
// ───────────────────────────────────────────────────────
describe("dTroops", () => {
  test("divides by TROOP_DISPLAY_DIV (10)", () => {
    expect(dTroops(1000)).toBe(100);
    expect(dTroops(10)).toBe(1);
    expect(dTroops(0)).toBe(0);
  });

  test("handles falsy/undefined input", () => {
    expect(dTroops(null)).toBe(0);
    expect(dTroops(undefined)).toBe(0);
    expect(dTroops("")).toBe(0);
  });

  test("handles string numbers", () => {
    expect(dTroops("500")).toBe(50);
  });

  test("handles negative numbers", () => {
    expect(dTroops(-100)).toBe(-10);
  });
});

// ───────────────────────────────────────────────────────
// num — safe Number() coercion with 0 fallback
// ───────────────────────────────────────────────────────
describe("num", () => {
  test("converts number", () => {
    expect(num(42)).toBe(42);
    expect(num(0)).toBe(0);
    expect(num(-5)).toBe(-5);
  });

  test("converts string to number", () => {
    expect(num("123")).toBe(123);
    expect(num("3.14")).toBeCloseTo(3.14);
  });

  test("returns 0 for non-numeric", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num("")).toBe(0);
  });
});

// ───────────────────────────────────────────────────────
// esc — HTML entity escaping
// ───────────────────────────────────────────────────────
describe("esc", () => {
  test("escapes ampersand", () => {
    expect(esc("a&b")).toBe("a&amp;b");
  });

  test("escapes angle brackets", () => {
    expect(esc("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("escapes quotes", () => {
    expect(esc('"hello"')).toBe("&quot;hello&quot;");
    expect(esc("it's")).toBe("it&#39;s");
  });

  test("handles null/undefined gracefully", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  test("passes through safe strings unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
    expect(esc("abc123")).toBe("abc123");
  });

  test("escapes all 5 entities in one string", () => {
    expect(esc(`<a href="x" title='y'>&`)).toBe(
      `&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;`,
    );
  });
});

// ───────────────────────────────────────────────────────
// short — compact number formatting (1.5M, 100k, etc.)
// ───────────────────────────────────────────────────────
describe("short", () => {
  test("millions", () => {
    expect(short(1_500_000)).toBe("1.5M");
    expect(short(10_000_000)).toBe("10M");
    expect(short(1_000_000)).toBe("1M");
    expect(short(1_250_000)).toBe("1.3M"); // rounds to nearest 100k
  });

  test("thousands", () => {
    expect(short(1000)).toBe("1k");
    expect(short(5500)).toBe("6k"); // rounds to nearest thousand
    expect(short(999_999)).toBe("1000k");
  });

  test("small numbers", () => {
    expect(short(0)).toBe("0");
    expect(short(1)).toBe("1");
    expect(short(999)).toBe("999");
    expect(short(42)).toBe("42");
  });

  test("uses absolute value (negative → positive)", () => {
    expect(short(-1_500_000)).toBe("1.5M");
    expect(short(-500)).toBe("500");
  });

  test("handles non-numeric", () => {
    expect(short(null)).toBe("0");
    expect(short("abc")).toBe("0");
  });

  test("handles string numbers", () => {
    expect(short("2000000")).toBe("2M");
  });
});

// ───────────────────────────────────────────────────────
// comma — locale-formatted number with commas
// ───────────────────────────────────────────────────────
describe("comma", () => {
  test("adds commas to thousands", () => {
    // locale-dependent, but check the number itself is correct
    const result = comma(1234567);
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("567");
  });

  test("uses absolute value", () => {
    const result = comma(-1000);
    expect(result).not.toContain("-");
  });

  test("rounds to integer", () => {
    const result = comma(1234.7);
    expect(result).toBe("1,235"); // rounds up, formatted with comma
  });

  test("handles zero", () => {
    expect(comma(0)).toBe("0");
  });
});

// ───────────────────────────────────────────────────────
// fullNum — comma + (short) for large numbers
// ───────────────────────────────────────────────────────
describe("fullNum", () => {
  test("small numbers are just comma-formatted", () => {
    expect(fullNum(500)).toBe("500");
    expect(fullNum(0)).toBe("0");
    expect(fullNum(999)).toBe("999");
  });

  test("large numbers get short suffix in parens", () => {
    const result = fullNum(1_500_000);
    expect(result).toContain("(1.5M)");
  });

  test("1000+ gets short suffix", () => {
    const result = fullNum(1000);
    expect(result).toContain("(1k)");
  });
});

// ───────────────────────────────────────────────────────
// fmtSec — format seconds as M:SS
// ───────────────────────────────────────────────────────
describe("fmtSec", () => {
  test("zero", () => {
    expect(fmtSec(0)).toBe("0:00");
  });

  test("seconds only", () => {
    expect(fmtSec(5)).toBe("0:05");
    expect(fmtSec(59)).toBe("0:59");
  });

  test("minutes and seconds", () => {
    expect(fmtSec(60)).toBe("1:00");
    expect(fmtSec(90)).toBe("1:30");
    expect(fmtSec(125)).toBe("2:05");
  });

  test("negative clamped to 0", () => {
    expect(fmtSec(-10)).toBe("0:00");
  });

  test("fractional seconds floored", () => {
    expect(fmtSec(5.9)).toBe("0:05");
  });
});

// ───────────────────────────────────────────────────────
// fmtDuration — human-readable duration
// ───────────────────────────────────────────────────────
describe("fmtDuration", () => {
  test("seconds only", () => {
    expect(fmtDuration(5000)).toBe("5s");
    expect(fmtDuration(59000)).toBe("59s");
  });

  test("minutes and seconds", () => {
    expect(fmtDuration(60000)).toBe("1m 0s");
    expect(fmtDuration(90000)).toBe("1m 30s");
    expect(fmtDuration(3599000)).toBe("59m 59s");
  });

  test("hours and minutes", () => {
    expect(fmtDuration(3600000)).toBe("1h 0m");
    expect(fmtDuration(5400000)).toBe("1h 30m");
    expect(fmtDuration(7200000)).toBe("2h 0m");
  });

  test("zero", () => {
    expect(fmtDuration(0)).toBe("0s");
  });

  test("sub-second", () => {
    expect(fmtDuration(500)).toBe("0s");
  });
});

// ───────────────────────────────────────────────────────
// parseAmt — parse human-written amounts (1.5M, 100k, etc.)
// ───────────────────────────────────────────────────────
describe("parseAmt", () => {
  test("plain integers", () => {
    expect(parseAmt("1000")).toBe(1000);
    expect(parseAmt("42")).toBe(42);
    expect(parseAmt("0")).toBe(0);
  });

  test("comma-separated numbers", () => {
    expect(parseAmt("1,000")).toBe(1000);
    expect(parseAmt("1,234,567")).toBe(1234567);
  });

  test("K suffix (case insensitive)", () => {
    expect(parseAmt("100K")).toBe(100_000);
    expect(parseAmt("100k")).toBe(100_000);
    expect(parseAmt("5.5K")).toBe(5500);
  });

  test("M suffix (case insensitive)", () => {
    expect(parseAmt("1M")).toBe(1_000_000);
    expect(parseAmt("1m")).toBe(1_000_000);
    expect(parseAmt("1.5M")).toBe(1_500_000);
    expect(parseAmt("2.75M")).toBe(2_750_000);
  });

  test("returns 0 for null/undefined/empty", () => {
    expect(parseAmt(null)).toBe(0);
    expect(parseAmt(undefined)).toBe(0);
    expect(parseAmt("")).toBe(0);
  });

  test("returns 0 for garbage input", () => {
    expect(parseAmt("abc")).toBe(0);
    expect(parseAmt("---")).toBe(0);
  });

  test("handles number input (coerced to string)", () => {
    expect(parseAmt(5000)).toBe(5000);
  });
});
