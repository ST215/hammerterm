import ReactDOM from "react-dom/client";
import { installBridge } from "@content/bridge";
import { installKeyboardHandler, removeKeyboardHandler } from "@content/game/keyboard";
import { startReciprocateProcessor } from "@content/automation/reciprocate-engine";
import { cleanupAll } from "@content/cleanup";
import { useStore } from "@store/index";
import { hydrateSettings, startSettingsAutosave } from "@content/persistence";
import App from "@ui/components/App";
import "./style.css";

export default defineContentScript({
  matches: ["*://openfront.io/*", "*://*.openfront.io/*"],
  runAt: "document_start",
  cssInjectionMode: "ui",

  async main(ctx) {
    console.log("[Hammer] Content script loaded on", window.location.href);

    // Phase 0: Hydrate persisted user settings into the store BEFORE the bridge
    // or UI read it, so config (ratios/targets/positions/size) is present on
    // first paint. Presentation (inGameView/externalOpen) is intentionally not
    // persisted — it always boots to the disguised card. Then keep saving on
    // change. This is the content tab's store, the canonical source of truth.
    await hydrateSettings();
    startSettingsAutosave();

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
      version: "15.21.0-ext",
    };

    // Listen for messages from popup/background. The store here is the source
    // of truth; the popup control center and background drive it via these.
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const store = useStore.getState();
      switch (message.type) {
        case "GET_IN_GAME_VIEW":
          sendResponse({ ok: true, inGameView: store.inGameView });
          return true;
        case "SET_IN_GAME_VIEW":
          // Explicit presentation control from the popup control center.
          if (message.view === "disguised") store.disguiseInGame();
          else if (message.view === "revealed") store.revealInGame();
          else if (message.view === "hidden") store.hideInGame();
          sendResponse({ ok: true });
          return true;
        case "EXTERNAL_STATE":
          // Authoritative external-window state from background. Drives the
          // externalOpen ⇒ inGameView invariant (open ⇒ hidden; closed ⇒ disguised).
          store.setExternalOpen(!!message.open);
          sendResponse({ ok: true });
          return true;
        case "TOGGLE_VISIBILITY":
          // Legacy toggle (popup/keyboard): disguised ⇄ hidden.
          store.setInGameView(store.inGameView === "hidden" ? "disguised" : "hidden");
          sendResponse({ ok: true });
          return true;
        default:
          return false;
      }
    });

    // Register cleanup when content script context is invalidated
    ctx.onInvalidated(() => {
      removeKeyboardHandler();
      cleanupAll();
    });
  },
});
