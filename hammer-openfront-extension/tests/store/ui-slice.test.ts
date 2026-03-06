import { describe, expect, test } from "vitest";
import { create } from "zustand";
import { createUISlice, type UISlice } from "../../src/store/slices/ui";

function createTestStore() {
  return create<UISlice>()(createUISlice);
}

describe("UISlice", () => {
  // ───────────────────────────────────────────────────────
  // Default state
  // ───────────────────────────────────────────────────────
  test('default view is "about"', () => {
    const store = createTestStore();
    expect(store.getState().view).toBe("about");
  });

  test("default paused is false", () => {
    const store = createTestStore();
    expect(store.getState().paused).toBe(false);
  });

  test('default displayMode is "overlay"', () => {
    const store = createTestStore();
    expect(store.getState().displayMode).toBe("overlay");
  });

  test("default sizeIdx is 1", () => {
    const store = createTestStore();
    expect(store.getState().sizeIdx).toBe(1);
  });

  // ───────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────
  test("setView changes active tab", () => {
    const store = createTestStore();
    store.getState().setView("donations");
    expect(store.getState().view).toBe("donations");
  });

  test("togglePaused flips paused state", () => {
    const store = createTestStore();
    expect(store.getState().paused).toBe(false);
    store.getState().togglePaused();
    expect(store.getState().paused).toBe(true);
  });

  test("togglePaused flips back", () => {
    const store = createTestStore();
    store.getState().togglePaused();
    store.getState().togglePaused();
    expect(store.getState().paused).toBe(false);
  });

  test("toggleMinimized flips minimized state", () => {
    const store = createTestStore();
    expect(store.getState().minimized).toBe(false);
    store.getState().toggleMinimized();
    expect(store.getState().minimized).toBe(true);
    store.getState().toggleMinimized();
    expect(store.getState().minimized).toBe(false);
  });

  test("setSizeIdx updates size index", () => {
    const store = createTestStore();
    store.getState().setSizeIdx(2);
    expect(store.getState().sizeIdx).toBe(2);
  });

  test('setDisplayMode switches to "window"', () => {
    const store = createTestStore();
    store.getState().setDisplayMode("window");
    expect(store.getState().displayMode).toBe("window");
  });

  test('setDisplayMode switches to "overlay"', () => {
    const store = createTestStore();
    store.getState().setDisplayMode("window");
    store.getState().setDisplayMode("overlay");
    expect(store.getState().displayMode).toBe("overlay");
  });

  test("setUIVisible hides UI", () => {
    const store = createTestStore();
    expect(store.getState().uiVisible).toBe(true);
    store.getState().setUIVisible(false);
    expect(store.getState().uiVisible).toBe(false);
  });
});
