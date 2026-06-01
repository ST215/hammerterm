import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../src/store/index";

/**
 * In-game view state machine + the externalOpen invariant.
 * Replaces the old displayMode/uiVisible/minimized tests (those flags were
 * collapsed into the single `inGameView` enum in v15.16.0).
 */
describe("inGameView state machine", () => {
  beforeEach(() => {
    const s = useStore.getState();
    s.setView("hammer");
    s.disguiseInGame();
    s.setExternalOpen(false);
    if (s.paused) s.togglePaused();
    s.setSizeIdx(1);
  });

  test("default in-game view is disguised", () => {
    expect(useStore.getState().inGameView).toBe("disguised");
  });

  test("reveal / disguise / hide transitions", () => {
    useStore.getState().revealInGame();
    expect(useStore.getState().inGameView).toBe("revealed");
    useStore.getState().disguiseInGame();
    expect(useStore.getState().inGameView).toBe("disguised");
    useStore.getState().hideInGame();
    expect(useStore.getState().inGameView).toBe("hidden");
  });

  test("opening external hides the in-game overlay (invariant)", () => {
    useStore.getState().revealInGame();
    useStore.getState().setExternalOpen(true);
    expect(useStore.getState().externalOpen).toBe(true);
    expect(useStore.getState().inGameView).toBe("hidden");
  });

  test("closing external restores the disguised card (the way back)", () => {
    useStore.getState().setExternalOpen(true);
    expect(useStore.getState().inGameView).toBe("hidden");
    useStore.getState().setExternalOpen(false);
    expect(useStore.getState().externalOpen).toBe(false);
    expect(useStore.getState().inGameView).toBe("disguised");
  });

  test("closing external does not clobber a non-hidden in-game view", () => {
    // If external was never actually driving (in-game already revealed), a
    // close should leave the revealed state intact.
    useStore.getState().revealInGame();
    useStore.getState().setExternalOpen(false);
    expect(useStore.getState().inGameView).toBe("revealed");
  });

  test("paused is independent of view changes", () => {
    useStore.getState().togglePaused();
    expect(useStore.getState().paused).toBe(true);
    useStore.getState().revealInGame();
    useStore.getState().setExternalOpen(true);
    expect(useStore.getState().paused).toBe(true);
  });

  test("view (active tab) persists across presentation changes", () => {
    useStore.getState().setView("cia");
    useStore.getState().revealInGame();
    useStore.getState().setExternalOpen(true);
    useStore.getState().setExternalOpen(false);
    expect(useStore.getState().view).toBe("cia");
  });

  test("sizeIdx persists across presentation changes", () => {
    useStore.getState().setSizeIdx(2);
    useStore.getState().hideInGame();
    expect(useStore.getState().sizeIdx).toBe(2);
  });
});
