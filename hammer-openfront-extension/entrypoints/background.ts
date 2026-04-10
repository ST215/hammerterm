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

export default defineBackground(() => {
  console.log("[Hammer] Background service worker started");

  let dashboardWindowId: number | null = null;
  let gameTabId: number | null = null;

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
      // Reuse existing dashboard window if it's still open
      if (dashboardWindowId !== null) {
        chrome.windows.get(dashboardWindowId, (win) => {
          if (chrome.runtime.lastError || !win) {
            dashboardWindowId = null;
            openDashboardWindow(sendResponse);
          } else {
            chrome.windows.update(dashboardWindowId!, { focused: true });
            sendResponse({ ok: true });
          }
        });
      } else {
        openDashboardWindow(sendResponse);
      }
      return true;
    }

    if (message.type === "CLOSE_DASHBOARD") {
      if (dashboardWindowId !== null) {
        chrome.windows.remove(dashboardWindowId, () => {
          if (chrome.runtime.lastError) {
            // Window already gone
          }
          dashboardWindowId = null;
          sendResponse({ ok: true });
        });
      } else {
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
      sendResponse({ ok: true, version: "15.10.0-ext" });
      return true;
    }

    return false;
  });

  function openDashboardWindow(sendResponse: (response: any) => void) {
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("/dashboard.html"),
        type: "popup",
        width: 1120,
        height: 820,
      },
      (win) => {
        dashboardWindowId = win?.id ?? null;
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

  // Clean up tracked window ID when windows are closed
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === dashboardWindowId) {
      dashboardWindowId = null;
    }
  });

  // Clean up game tab tracking when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === gameTabId) {
      gameTabId = null;
    }
  });
});
