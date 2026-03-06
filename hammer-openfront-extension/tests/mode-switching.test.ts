import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../src/store/index";

describe("mode-switching", () => {
  beforeEach(() => {
    const s = useStore.getState();
    // Reset UI state
    s.setView("about");
    s.setDisplayMode("overlay");
    s.setUIVisible(true);
    if (s.paused) s.togglePaused();
    if (s.minimized) s.toggleMinimized();
    s.setSizeIdx(1);
  });

  test("default display mode is overlay", () => {
    expect(useStore.getState().displayMode).toBe("overlay");
  });

  test("can switch to window mode", () => {
    useStore.getState().setDisplayMode("window");
    expect(useStore.getState().displayMode).toBe("window");
  });

  test("can switch back to overlay mode", () => {
    useStore.getState().setDisplayMode("window");
    useStore.getState().setDisplayMode("overlay");
    expect(useStore.getState().displayMode).toBe("overlay");
  });

  test("uiVisible defaults to true", () => {
    expect(useStore.getState().uiVisible).toBe(true);
  });

  test("can hide UI", () => {
    useStore.getState().setUIVisible(false);
    expect(useStore.getState().uiVisible).toBe(false);
  });

  test("can show UI after hiding", () => {
    useStore.getState().setUIVisible(false);
    useStore.getState().setUIVisible(true);
    expect(useStore.getState().uiVisible).toBe(true);
  });

  test("paused state is independent of display mode", () => {
    useStore.getState().togglePaused();
    expect(useStore.getState().paused).toBe(true);
    useStore.getState().setDisplayMode("window");
    expect(useStore.getState().paused).toBe(true);
    useStore.getState().setDisplayMode("overlay");
    expect(useStore.getState().paused).toBe(true);
  });

  test("view persists across display mode changes", () => {
    useStore.getState().setView("cia");
    useStore.getState().setDisplayMode("window");
    expect(useStore.getState().view).toBe("cia");
    useStore.getState().setDisplayMode("overlay");
    expect(useStore.getState().view).toBe("cia");
  });

  test("minimized state persists across display mode changes", () => {
    useStore.getState().toggleMinimized();
    expect(useStore.getState().minimized).toBe(true);
    useStore.getState().setDisplayMode("window");
    expect(useStore.getState().minimized).toBe(true);
  });

  test("size index persists across display mode changes", () => {
    useStore.getState().setSizeIdx(2);
    useStore.getState().setDisplayMode("window");
    expect(useStore.getState().sizeIdx).toBe(2);
  });

  test("hiding UI does not affect paused state", () => {
    useStore.getState().togglePaused();
    useStore.getState().setUIVisible(false);
    expect(useStore.getState().paused).toBe(true);
    useStore.getState().setUIVisible(true);
    expect(useStore.getState().paused).toBe(true);
  });

  test("hiding UI does not affect display mode", () => {
    useStore.getState().setDisplayMode("window");
    useStore.getState().setUIVisible(false);
    expect(useStore.getState().displayMode).toBe("window");
  });
});
