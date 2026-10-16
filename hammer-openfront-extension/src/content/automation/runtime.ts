/**
 * runtime.ts — the one place automation loops are started and stopped.
 *
 * Installed only by the game-tab content script. UI Start/Stop buttons (in the
 * overlay OR the external window) just flip store flags; the external window's
 * flag changes sync to this tab, and this reconciler runs/halts the matching
 * loop here. Loops therefore always run beside the game on live data, and
 * closing the external window can never orphan a "running" loop.
 */

import { useStore } from "@store/index";
import { syncTroopsLoop } from "./auto-troops";
import { syncGoldLoop } from "./auto-gold";
import { syncBroadcastLoop } from "./broadcast";
import { installGovernorSync } from "./attack-ratio";

let installed = false;

export function installAutomationRuntime(): void {
  if (installed) return;
  installed = true;

  const reconcile = () => {
    const s = useStore.getState();
    syncTroopsLoop(s.asTroopsRunning);
    syncGoldLoop(s.asGoldRunning);
    syncBroadcastLoop(s.broadcastEnabled);
  };

  reconcile();
  useStore.subscribe((s, prev) => {
    if (
      s.asTroopsRunning !== prev.asTroopsRunning ||
      s.asGoldRunning !== prev.asGoldRunning ||
      s.broadcastEnabled !== prev.broadcastEnabled
    ) {
      reconcile();
    }
  });

  installGovernorSync();
}
