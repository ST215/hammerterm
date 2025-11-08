// Background script: lives in the extension service worker context.
// Responsible for global keyboard shortcuts and manual injection.
// No direct DOM access here; communicates with content scripts via chrome.tabs.sendMessage.
const DEBUG = false;
const log = (...a) => { if (DEBUG) console.log("[OF-Ext][bg]", ...a); };

// Clicking the extension icon force-injects the main-world injector into the active tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    log("injecting injector.js into tab", tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["injector.js"],
    });
    log("injector.js injected");
  } catch (e) {
    if (DEBUG) console.error("[OF-Ext][bg] Failed to inject injector.js", e);
  }
});

// Keyboard shortcuts declared in manifest.json land here.
// We flip the stored on/off state and broadcast a message to the content script.
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (command === "toggle-sam") {
      // Flip stored state then broadcast
      const { of_sam_enabled } = await chrome.storage.local.get("of_sam_enabled");
      const enabled = !of_sam_enabled;
      await chrome.storage.local.set({ of_sam_enabled: enabled });
      chrome.tabs.sendMessage(tab.id, { __ofCmd: "sam_overlay_toggle", enabled });
    } else if (command === "toggle-atom") {
      const { of_atom_enabled } = await chrome.storage.local.get("of_atom_enabled");
      const enabled = !of_atom_enabled;
      await chrome.storage.local.set({ of_atom_enabled: enabled });
      chrome.tabs.sendMessage(tab.id, { __ofCmd: "atom_overlay_toggle", enabled });
    } else if (command === "toggle-hydrogen") {
      const { of_hydrogen_enabled } = await chrome.storage.local.get("of_hydrogen_enabled");
      const enabled = !of_hydrogen_enabled;
      await chrome.storage.local.set({ of_hydrogen_enabled: enabled });
      chrome.tabs.sendMessage(tab.id, { __ofCmd: "hydrogen_overlay_toggle", enabled });
    } else if (command === "toggle-alliances") {
      const { of_alliances_enabled } = await chrome.storage.local.get("of_alliances_enabled");
      const enabled = !of_alliances_enabled;
      await chrome.storage.local.set({ of_alliances_enabled: enabled });
      chrome.tabs.sendMessage(tab.id, { __ofCmd: "alliances_overlay_toggle", enabled });
    } else if (command === "capture-mouse-player") {
      chrome.tabs.sendMessage(tab.id, { __ofCmd: "capture_mouse_player" });
    }
  } catch {}
});


