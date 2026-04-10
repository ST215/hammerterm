import ReactDOM from "react-dom/client";
import { installBridge } from "@content/bridge";
import { installKeyboardHandler, removeKeyboardHandler } from "@content/game/keyboard";
import { startReciprocateProcessor } from "@content/automation/reciprocate-engine";
import { cleanupAll } from "@content/cleanup";
import { useStore } from "@store/index";
import App from "@ui/components/App";
import "./style.css";

export default defineContentScript({
  matches: ["*://openfront.io/*", "*://*.openfront.io/*"],
  runAt: "document_start",
  cssInjectionMode: "ui",

  async main(ctx) {
    console.log("[Hammer] Content script loaded on", window.location.href);

    // Phase 1: Install bridge to receive data from MAIN world hooks
    // (The MAIN world hooks.content.ts handles Worker/WebSocket/Canvas/GameView
    //  interception and forwards data via window.postMessage)
    installBridge();

    // Phase 2: After DOM is ready, start keyboard handler and automation
    const onReady = () => {
      installKeyboardHandler();

      // Start reciprocate processor
      startReciprocateProcessor();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady, { once: true });
    } else {
      onReady();
    }

    // Phase 3: Mount React UI in shadow DOM
    const ui = await createShadowRootUi(ctx, {
      name: "hammer-terminal",
      position: "overlay",
      zIndex: 2147483647,
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<App mode="overlay" />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();

    // Expose cleanup API
    (window as any).__HAMMER__ = {
      cleanup: () => {
        cleanupAll();
        ui.remove();
        delete (window as any).__HAMMER__;
      },
      version: "15.10.0-ext",
    };

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "TOGGLE_VISIBILITY") {
        const store = useStore.getState();
        store.setUIVisible(!store.uiVisible);
        sendResponse({ ok: true });
        return true;
      }
      if (message.type === "SET_DISPLAY_MODE") {
        useStore.getState().setDisplayMode(message.mode);
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });

    // Register cleanup when content script context is invalidated
    ctx.onInvalidated(() => {
      removeKeyboardHandler();
      cleanupAll();
    });
  },
});
