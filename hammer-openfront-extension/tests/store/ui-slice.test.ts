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
  test('default view is "hammer"', () => {
    const store = createTestStore();
    expect(store.getState().view).toBe("hammer");
  });

  test("default paused is false", () => {
    const store = createTestStore();
    expect(store.getState().paused).toBe(false);
  });

  test('default inGameView is "hidden" (silent boot)', () => {
    const store = createTestStore();
    expect(store.getState().inGameView).toBe("hidden");
  });

  test("default screenPopupsEnabled is false (notifications off)", () => {
    const store = createTestStore();
    expect(store.getState().screenPopupsEnabled).toBe(false);
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

  test("reveal/disguise/hide set inGameView", () => {
    const store = createTestStore();
    store.getState().revealInGame();
    expect(store.getState().inGameView).toBe("revealed");
    store.getState().hideInGame();
    expect(store.getState().inGameView).toBe("hidden");
    store.getState().disguiseInGame();
    expect(store.getState().inGameView).toBe("disguised");
  });

  test("setSizeIdx updates size index", () => {
    const store = createTestStore();
    store.getState().setSizeIdx(2);
    expect(store.getState().sizeIdx).toBe(2);
  });

  test("setExternalOpen(true) forces inGameView hidden", () => {
    const store = createTestStore();
    store.getState().revealInGame();
    store.getState().setExternalOpen(true);
    expect(store.getState().externalOpen).toBe(true);
    expect(store.getState().inGameView).toBe("hidden");
  });

  test("setExternalOpen(false) leaves inGameView hidden (silent by default)", () => {
    const store = createTestStore();
    store.getState().setExternalOpen(true);
    store.getState().setExternalOpen(false);
    expect(store.getState().externalOpen).toBe(false);
    expect(store.getState().inGameView).toBe("hidden");
  });

  test("setExternalOpen(false) does not clobber a revealed view", () => {
    const store = createTestStore();
    store.getState().revealInGame();
    store.getState().setExternalOpen(false);
    expect(store.getState().inGameView).toBe("revealed");
  });
});
