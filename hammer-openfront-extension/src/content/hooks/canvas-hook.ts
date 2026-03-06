/**
 * Canvas interception hook — captures the game's rendering transform matrix,
 * world dimensions, and mouse position for tile-coordinate resolution.
 *
 * Ported from hammer.js lines ~2433-2500.
 */

import { num } from "@shared/utils";
import { registerTimeout, registerCleanup } from "../cleanup";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Current canvas transform captured from setTransform calls. */
let currentTransform = { a: 1, d: 1, e: 0, f: 0 };

/** World tile dimensions (updated from drawImage of the terrain canvas). */
let worldTilesWidth = 0;
let worldTilesHeight = 0;

/** Screen canvas pixel dimensions. */
let screenCanvasWidth = 0;
let screenCanvasHeight = 0;

/** Reference to the game's rendering canvas element. */
let targetCanvas: HTMLCanvasElement | null = null;

/** Last known mouse position in client coordinates. */
let lastMouseClient = { x: 0, y: 0 };

/** Original prototype methods (saved for restore). */
let origSetTransform: typeof CanvasRenderingContext2D.prototype.setTransform | null =
  null;
let origDrawImage: typeof CanvasRenderingContext2D.prototype.drawImage | null =
  null;

/** Whether the mouse listener is installed. */
let mouseListenerInstalled = false;

/** Reference to the mousemove handler for cleanup. */
let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;

// ---------------------------------------------------------------------------
// installCanvasHook — patch Canvas2D prototypes and add mouse tracking
// ---------------------------------------------------------------------------

export function installCanvasHook(): void {
  // Idempotent — skip if already installed
  if (origSetTransform) return;

  try {
    const proto = CanvasRenderingContext2D.prototype;

    // --- setTransform hook ---
    origSetTransform = proto.setTransform;
    proto.setTransform = function (
      this: CanvasRenderingContext2D,
      a?: any,
      b?: any,
      c?: any,
      d?: any,
      e?: any,
      f?: any,
    ) {
      try {
        const canvas = this.canvas;
        if (canvas?.width && canvas.height) {
          targetCanvas = canvas;
          // Handle DOMMatrix object form: ctx.setTransform(matrix)
          if (typeof a === "object" && a !== null) {
            currentTransform = {
              a: a.a || 1,
              d: a.d || 1,
              e: a.e || 0,
              f: a.f || 0,
            };
          } else {
            currentTransform = {
              a: num(a) || 1,
              d: num(d) || 1,
              e: num(e) || 0,
              f: num(f) || 0,
            };
          }
          screenCanvasWidth = canvas.width | 0;
          screenCanvasHeight = canvas.height | 0;
        }
      } catch {}
      return origSetTransform!.apply(this, arguments as any);
    } as typeof proto.setTransform;

    // --- drawImage hook ---
    origDrawImage = proto.drawImage;
    proto.drawImage = function (this: CanvasRenderingContext2D, img: any) {
      try {
        if (img instanceof HTMLCanvasElement && arguments.length === 5) {
          const w = Math.round(num(arguments[3]));
          const h = Math.round(num(arguments[4]));
          if (w * h > worldTilesWidth * worldTilesHeight) {
            worldTilesWidth = w;
            worldTilesHeight = h;
          }
        }
      } catch {}
      return origDrawImage!.apply(this, arguments as any);
    } as typeof proto.drawImage;

    // Immediate canvas detection for mid-game reruns
    const detectTimeout = setTimeout(() => {
      if (!targetCanvas) {
        const canvases = document.querySelectorAll("canvas");
        for (const canvas of canvases) {
          if (canvas.width > 800 && canvas.height > 600) {
            targetCanvas = canvas;
            screenCanvasWidth = canvas.width;
            screenCanvasHeight = canvas.height;
            console.log(
              "[Hammer] Found existing game canvas:",
              canvas.width,
              "x",
              canvas.height,
            );
            break;
          }
        }
      }
    }, 100);
    registerTimeout(detectTimeout);
  } catch (e) {
    console.warn("[Hammer] Canvas interception error:", e);
  }

  // --- Mouse tracking ---
  if (!mouseListenerInstalled) {
    mouseMoveHandler = (e: MouseEvent) => {
      lastMouseClient.x = e.clientX;
      lastMouseClient.y = e.clientY;
    };
    window.addEventListener("mousemove", mouseMoveHandler, true);
    mouseListenerInstalled = true;
  }

  registerCleanup(restoreCanvasPrototypes);
}

// ---------------------------------------------------------------------------
// restoreCanvasPrototypes — restore original Canvas2D methods and listeners
// ---------------------------------------------------------------------------

export function restoreCanvasPrototypes(): void {
  const proto = CanvasRenderingContext2D.prototype;

  if (origSetTransform) {
    proto.setTransform = origSetTransform;
    origSetTransform = null;
  }
  if (origDrawImage) {
    proto.drawImage = origDrawImage;
    origDrawImage = null;
  }

  if (mouseListenerInstalled && mouseMoveHandler) {
    window.removeEventListener("mousemove", mouseMoveHandler, true);
    mouseListenerInstalled = false;
    mouseMoveHandler = null;
  }
}

// ---------------------------------------------------------------------------
// getCanvasState — expose internal state for coordinate resolution, etc.
// ---------------------------------------------------------------------------

export function getCanvasState() {
  return {
    installed: origSetTransform !== null,
    currentTransform,
    worldTilesWidth,
    worldTilesHeight,
    screenCanvasWidth,
    screenCanvasHeight,
    targetCanvas,
    lastMouseClient,
  };
}
