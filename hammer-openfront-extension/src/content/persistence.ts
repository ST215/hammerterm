/**
 * persistence.ts — hydrate/save user settings across game-tab refresh and
 * tool close/reopen.
 *
 * Runs in the content-tab (the canonical store). The background service worker
 * owns chrome.storage via LOAD_CONFIG/SAVE_CONFIG; here we just read/write the
 * subset of store keys named by PERSIST_KEYS (derived from PersistedStateSchema).
 *
 * Deliberately CONFIG ONLY — see PersistedStateSchema. Presentation state
 * (inGameView, externalOpen) and live automation toggles (asTroopsRunning, …)
 * are never persisted, so the overlay always reopens as the disguised card and
 * automation never silently resumes on a streamed page reload.
 */

import { useStore } from "@store/index";
import { PERSIST_KEYS } from "@shared/schemas";
import { registerCleanup } from "./cleanup";

const SAVE_DEBOUNCE_MS = 1500;

/** Pull the persisted-key subset out of the current store state. */
function snapshotSettings(): Record<string, unknown> {
  const s = useStore.getState() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PERSIST_KEYS) {
    if (s[k] !== undefined) out[k] = s[k];
  }
  return out;
}

/** Load persisted settings from background and apply to the store. */
export async function hydrateSettings(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "LOAD_CONFIG" });
    if (resp?.ok && resp.config) {
      // Apply only the persisted keys — never let stored blob touch presentation
      // or game data. Schema defaults fill any missing keys.
      const patch: Record<string, unknown> = {};
      for (const k of PERSIST_KEYS) {
        if (resp.config[k] !== undefined) patch[k] = resp.config[k];
      }
      if (Object.keys(patch).length > 0) useStore.setState(patch);
    }
  } catch {
    // Background not ready or no stored config — fall back to store defaults.
  }
}

/** Subscribe to store changes and persist the config subset (debounced). */
export function startSettingsAutosave(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastJson = JSON.stringify(snapshotSettings());

  const unsub = useStore.subscribe(() => {
    const snap = snapshotSettings();
    const json = JSON.stringify(snap);
    if (json === lastJson) return; // no persisted key changed
    lastJson = json;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        chrome.runtime.sendMessage({ type: "SAVE_CONFIG", config: snap });
      } catch {
        /* background asleep — next change retries */
      }
    }, SAVE_DEBOUNCE_MS);
  });

  registerCleanup(() => {
    if (timer) clearTimeout(timer);
    unsub();
  });
}
