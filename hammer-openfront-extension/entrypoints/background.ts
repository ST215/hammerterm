import { PersistedStateSchema, type PersistedState } from "@shared/schemas";

const STORAGE_KEY = "hammer_config";
const DEBOUNCE_MS = 2000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function loadPersistedState(): Promise<PersistedState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY] ?? {};
  return PersistedStateSchema.parse(raw);
}

async function savePersistedState(state: PersistedState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function debouncedSave(state: PersistedState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    savePersistedState(state);
    saveTimer = null;
  }, DEBOUNCE_MS);
}

const VERSION = "15.19.0-ext";

export default defineBackground(() => {
  console.log("[Hammer] Background service worker started");

  let dashboardWindowId: number | null = null;
  let gameTabId: number | null = null;
  // Guards against duplicate windows from rapid double-clicks: while a
  // windows.create() is in flight, dashboardWindowId is still null, so a second
  // OPEN_DASHBOARD would otherwise create a second window.
  let launchingDashboard = false;

  // Tell the game-tab content script the authoritative external-window state.
  // The content script applies setExternalOpen(open), which drives inGameView
  // via the externalOpen invariant (open ⇒ in-game hidden; closed ⇒ disguised).
  function notifyExternalState(open: boolean) {
    if (gameTabId === null) return;
    try {
      chrome.tabs.sendMessage(
        gameTabId,
        { type: "EXTERNAL_STATE", open },
        () => void chrome.runtime.lastError, // swallow "no receiver"
      );
    } catch {
      /* tab gone */
    }
  }

  // Handle messages from popup and content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CONTENT_READY") {
      // Content script registers its tab ID
      if (sender.tab?.id) {
        gameTabId = sender.tab.id;
        console.log("[Hammer] Game tab registered:", gameTabId);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === "GET_GAME_TAB") {
      if (gameTabId !== null) {
        sendResponse({ ok: true, tabId: gameTabId });
      } else {
        // Fallback: service worker may have restarted, query by URL
        chrome.tabs.query(
          { url: ["*://openfront.io/*", "*://*.openfront.io/*"] },
          (tabs) => {
            const tab = tabs?.[0];
            if (tab?.id) {
              gameTabId = tab.id;
              sendResponse({ ok: true, tabId: tab.id });
            } else {
              sendResponse({ ok: false, tabId: null });
            }
          },
        );
      }
      return true;
    }

    if (message.type === "OPEN_DASHBOARD") {
      // A create is already in flight — ignore (prevents duplicate windows).
      if (launchingDashboard) {
        sendResponse({ ok: true, pending: true });
        return true;
      }
      // Reuse existing dashboard window if it's still open
      if (dashboardWindowId !== null) {
        chrome.windows.get(dashboardWindowId, (win) => {
          if (chrome.runtime.lastError || !win) {
            dashboardWindowId = null;
            openDashboardWindow(sendResponse);
          } else {
            chrome.windows.update(dashboardWindowId!, { focused: true });
            notifyExternalState(true);
            sendResponse({ ok: true });
          }
        });
      } else {
        openDashboardWindow(sendResponse);
      }
      return true;
    }

    if (message.type === "OPEN_REPLAY_VIEWER") {
      // Open the bundled replay viewer; it reads the just-exported data from
      // chrome.storage.local on load. A fresh window each time is fine.
      chrome.windows.create(
        {
          url: chrome.runtime.getURL("/replay-viewer.html"),
          type: "popup",
          width: 1200,
          height: 900,
        },
        () => {
          void chrome.runtime.lastError;
          sendResponse({ ok: true });
        },
      );
      return true;
    }

    if (message.type === "CLOSE_DASHBOARD") {
      if (dashboardWindowId !== null) {
        chrome.windows.remove(dashboardWindowId, () => {
          void chrome.runtime.lastError; // window already gone
          dashboardWindowId = null;
          notifyExternalState(false);
          sendResponse({ ok: true });
        });
      } else {
        notifyExternalState(false);
        sendResponse({ ok: true });
      }
      return true;
    }

    if (message.type === "LOAD_CONFIG") {
      loadPersistedState().then((state) => {
        sendResponse({ ok: true, config: state });
      });
      return true;
    }

    if (message.type === "SAVE_CONFIG") {
      const parsed = PersistedStateSchema.safeParse(message.config);
      if (parsed.success) {
        debouncedSave(parsed.data);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: parsed.error.message });
      }
      return true;
    }

    if (message.type === "GET_STATUS") {
      // Report live control-center status. externalOpen is authoritative here
      // (background owns the window); inGameView is fetched from the content
      // script, which is the store's source of truth.
      const externalOpen = dashboardWindowId !== null;
      const respond = (inGameView: string | null, connected: boolean) =>
        sendResponse({
          ok: true,
          version: VERSION,
          externalOpen,
          gameTabConnected: connected,
          inGameView,
        });
      if (gameTabId === null) {
        respond(null, false);
        return true;
      }
      try {
        chrome.tabs.sendMessage(gameTabId, { type: "GET_IN_GAME_VIEW" }, (resp) => {
          if (chrome.runtime.lastError || !resp) respond(null, false);
          else respond(resp.inGameView ?? null, true);
        });
      } catch {
        respond(null, false);
      }
      return true;
    }

    if (message.type === "SET_IN_GAME_VIEW") {
      // From the popup control center — forward to the content script.
      if (gameTabId !== null) {
        try {
          chrome.tabs.sendMessage(
            gameTabId,
            { type: "SET_IN_GAME_VIEW", view: message.view },
            () => void chrome.runtime.lastError,
          );
        } catch {
          /* tab gone */
        }
      }
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  function openDashboardWindow(sendResponse: (response: any) => void) {
    launchingDashboard = true;
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("/dashboard.html"),
        type: "popup",
        width: 1120,
        height: 820,
      },
      (win) => {
        launchingDashboard = false;
        if (chrome.runtime.lastError || !win?.id) {
          dashboardWindowId = null;
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message ?? "window creation failed",
          });
          return;
        }
        dashboardWindowId = win.id;
        notifyExternalState(true);
        sendResponse({ ok: true });
      },
    );
  }

  // Inject content scripts into existing game tabs on install/update
  chrome.runtime.onInstalled.addListener(async () => {
    try {
      const tabs = await chrome.tabs.query({
        url: ["*://openfront.io/*", "*://*.openfront.io/*"],
      });
      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content-scripts/hooks.js"],
            world: "MAIN" as chrome.scripting.ExecutionWorld,
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content-scripts/openfront.js"],
          });
          console.log("[Hammer] Injected into existing game tab:", tab.id);
        } catch (err) {
          console.warn("[Hammer] Injection failed for tab", tab.id, err);
        }
      }
    } catch {}
  });

  // Clean up tracked window ID when windows are closed (X on the popup, OS close,
  // etc.). This is the critical "no stuck externalOpen / way back to in-game"
  // fix: whenever the window goes away by any means, tell the content script to
  // clear externalOpen, which restores the in-game overlay to its disguised card.
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === dashboardWindowId) {
      dashboardWindowId = null;
      notifyExternalState(false);
    }
  });

  // Clean up game tab tracking when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === gameTabId) {
      gameTabId = null;
    }
  });
});
