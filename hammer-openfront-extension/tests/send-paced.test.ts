/**
 * Tests for sendPaced() / cancelAllPaced() — the human-cadence multi-target
 * sender that sits above the global intent limiter (src/content/game/send.ts).
 *
 * Verifies: first target fires immediately, subsequent targets pace out at
 * spacingMs (+ jitter), progress callback, per-batch cancel, and the
 * module-level cancelAllPaced() used by the new-match reset.
 */
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";

// send.ts pulls in the bridge + recorder for its rate-limited sends; the pacer
// itself needs neither, so stub them to keep the import side-effect free.
vi.mock("../src/content/bridge", () => ({ sendToMainWorld: vi.fn() }));
vi.mock("../src/recorder", () => ({ record: vi.fn(), trackMetric: vi.fn() }));

import { sendPaced, cancelAllPaced } from "../src/content/game/send";

describe("sendPaced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic spacing: jitter → 0, so each gap is exactly spacingMs.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    cancelAllPaced();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("fires the first target synchronously, paces the rest", () => {
    const fn = vi.fn();
    sendPaced(["a", "b", "c"], fn, { spacingMs: 900, jitterMs: 400 });

    // First target immediately.
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["a"]);

    vi.advanceTimersByTime(900);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);

    vi.advanceTimersByTime(900);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);

    // No further sends once exhausted.
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("single target fires immediately with no pending timer", () => {
    const fn = vi.fn();
    sendPaced(["solo"], fn, { spacingMs: 900 });
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("empty id list never calls fn", () => {
    const fn = vi.fn();
    sendPaced([], fn, { spacingMs: 900 });
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  test("onProgress reports sent/total after each send, then a terminal done", () => {
    const progress: Array<{ sent: number; total: number; done?: boolean }> = [];
    sendPaced(["a", "b", "c"], vi.fn(), {
      spacingMs: 900,
      onProgress: (p) => progress.push({ ...p }),
    });
    vi.advanceTimersByTime(1800);
    expect(progress).toEqual([
      { sent: 1, total: 3 },
      { sent: 2, total: 3 },
      { sent: 3, total: 3 },
      { sent: 3, total: 3, done: true },
    ]);
  });

  test("cancel() fires a terminal done event through onProgress", () => {
    const progress: Array<{ sent: number; total: number; done?: boolean }> = [];
    const handle = sendPaced(["a", "b", "c", "d"], vi.fn(), {
      spacingMs: 900,
      onProgress: (p) => progress.push({ ...p }),
    });
    vi.advanceTimersByTime(900); // "a" (sync) + "b"
    handle.cancel();
    // The last event is a terminal done at wherever the batch was interrupted.
    expect(progress.at(-1)).toEqual({ sent: 2, total: 4, done: true });
  });

  test("cancelAllPaced() fires a terminal done for every in-flight batch", () => {
    const p1: Array<{ sent: number; total: number; done?: boolean }> = [];
    const p2: Array<{ sent: number; total: number; done?: boolean }> = [];
    sendPaced(["a", "b", "c"], vi.fn(), { spacingMs: 900, onProgress: (p) => p1.push({ ...p }) });
    sendPaced(["x", "y", "z"], vi.fn(), { spacingMs: 900, onProgress: (p) => p2.push({ ...p }) });
    cancelAllPaced();
    expect(p1.at(-1)).toEqual({ sent: 1, total: 3, done: true });
    expect(p2.at(-1)).toEqual({ sent: 1, total: 3, done: true });
  });

  test("cancel() stops remaining sends", () => {
    const fn = vi.fn();
    const handle = sendPaced(["a", "b", "c", "d"], fn, { spacingMs: 900 });
    expect(fn).toHaveBeenCalledTimes(1); // "a"
    vi.advanceTimersByTime(900);
    expect(fn).toHaveBeenCalledTimes(2); // "b"
    handle.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2); // "c"/"d" never sent
  });

  test("cancelAllPaced() aborts every in-flight batch", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    sendPaced(["a", "b", "c"], fn1, { spacingMs: 900 });
    sendPaced(["x", "y", "z"], fn2, { spacingMs: 900 });
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    cancelAllPaced();
    vi.advanceTimersByTime(5000);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  test("completed batch deregisters itself (cancelAllPaced is a no-op after)", () => {
    const fn = vi.fn();
    sendPaced(["a", "b"], fn, { spacingMs: 900 });
    vi.advanceTimersByTime(900); // completes both
    expect(fn).toHaveBeenCalledTimes(2);
    // Registry should be empty now — a late cancelAll must not throw or affect anything.
    expect(() => cancelAllPaced()).not.toThrow();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
