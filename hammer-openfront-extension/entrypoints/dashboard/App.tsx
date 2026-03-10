import { useEffect, useState } from "react";
import { useStore } from "@store/index";
import { deserializeWithSharing, mapsEqual, setsEqual } from "@shared/serialize";
import HammerApp from "@ui/components/App";

// Keys that are local to the dashboard UI — never overwritten by snapshots.
// These let the user navigate tabs, select comms targets, etc. without
// the 500ms sync clobbering their interactions.
const LOCAL_KEYS = new Set([
  // UI navigation
  "view", "paused", "minimized", "sizeIdx", "displayMode", "uiVisible",
  // Comms selections (user picks targets in dashboard)
  "commsTargets", "commsGroupMode", "commsOthersExpanded",
  "commsPendingQC", "commsRecentSent", "allianceCommsExpanded",
  // Reciprocate config
  "reciprocateMode", "reciprocateAutoPct", "reciprocateNotifyDuration",
  "reciprocateEnabled", "reciprocateOnGold", "reciprocateOnTroops",
  "reciprocatePopupsEnabled", "palantirMinPct", "palantirMaxPct",
  // Auto-troops config
  "asTroopsRunning", "asTroopsTargets", "asTroopsRatio",
  "asTroopsThreshold", "asTroopsCooldownSec",
  "asTroopsAllTeamMode", "asTroopsAllAlliesMode",
  // Auto-gold config
  "asGoldRunning", "asGoldTargets", "asGoldRatio",
  "asGoldThreshold", "asGoldCooldownSec",
  "asGoldAllTeamMode", "asGoldAllAlliesMode",
  // CIA user preferences
  "ciaWindowMs", "ciaFeedFilter",
  // Recorder (only the toggle — count & events come from content script snapshots)
  "recorderOn",
]);

export default function DashboardApp() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let disposed = false;
    let unsub: (() => void) | null = null;

    // Intercept sendToMainWorld calls (window.postMessage with __hammer flag)
    // and forward them through the port to the content script
    function interceptPostMessage(e: MessageEvent) {
      if (!e.data?.__hammer || e.data.type !== "send" || !port) return;
      port.postMessage({ type: "command", payload: e.data.payload });
    }
    window.addEventListener("message", interceptPostMessage);

    async function connect() {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_GAME_TAB",
        });

        if (disposed) return;

        if (!response?.ok || !response.tabId) {
          setError("No active game tab found. Open OpenFront.io first.");
          return;
        }

        port = chrome.tabs.connect(response.tabId, {
          name: "hammer-dashboard",
        });

        port.onMessage.addListener((msg) => {
          if (msg.type === "snapshot" && msg.data) {
            const currentState = useStore.getState();
            const data = deserializeWithSharing(msg.data, currentState);
            // Apply only game-data fields, skip local UI keys and functions
            const patch: Record<string, any> = {};
            for (const [key, val] of Object.entries(data)) {
              if (typeof val !== "function" && !LOCAL_KEYS.has(key)) {
                patch[key] = val;
              }
            }

            // Preserve dismissed state for notifications: if the dashboard
            // dismissed a notification, keep it dismissed even if the game tab
            // snapshot still has it as not-dismissed (race window before next sync)
            if (patch.reciprocateNotifications && Array.isArray(patch.reciprocateNotifications)) {
              const dismissedIds = new Set(
                currentState.reciprocateNotifications
                  .filter((n) => n.dismissed)
                  .map((n) => n.id),
              );
              if (dismissedIds.size > 0) {
                patch.reciprocateNotifications = patch.reciprocateNotifications.map(
                  (n: any) => dismissedIds.has(n.id) ? { ...n, dismissed: true } : n,
                );
              }
            }

            // Skip keys where structural sharing already preserved the reference
            const finalPatch: Record<string, any> = {};
            for (const [key, val] of Object.entries(patch)) {
              if (val !== (currentState as any)[key]) {
                finalPatch[key] = val;
              }
            }
            if (Object.keys(finalPatch).length > 0) {
              useStore.setState(finalPatch);
            }
            if (!connected) setConnected(true);
          }
        });

        port.onDisconnect.addListener(() => {
          if (!disposed) {
            setConnected(false);
            setError("Connection to game tab lost. Close and reopen.");
          }
        });

        // Reverse sync: push LOCAL_KEY changes back to the content script
        unsub = useStore.subscribe((state, prev) => {
          if (!port) return;

          // Forward notification dismissals to game tab
          if (state.reciprocateNotifications !== prev.reciprocateNotifications) {
            for (const n of state.reciprocateNotifications) {
              const old = prev.reciprocateNotifications.find((p) => p.id === n.id);
              if (n.dismissed && old && !old.dismissed) {
                port.postMessage({ type: "dismiss-notification", id: n.id });
              }
            }
          }

          const changes: Record<string, unknown> = {};
          for (const key of LOCAL_KEYS) {
            const curr = (state as any)[key];
            const old = (prev as any)[key];
            // Deep equality for Maps/Sets to avoid feedback loops from
            // deserialize() creating new instances with identical content
            if (curr instanceof Map && old instanceof Map) {
              if (!mapsEqual(curr, old)) changes[key] = curr;
            } else if (curr instanceof Set && old instanceof Set) {
              if (!setsEqual(curr, old)) changes[key] = curr;
            } else if (curr !== old) {
              changes[key] = curr;
            }
          }
          if (Object.keys(changes).length > 0) {
            port.postMessage({ type: "sync-local", data: changes });
          }
        });

        setConnected(true);
        setError(null);
      } catch (err: any) {
        if (!disposed) {
          setError(err?.message || "Failed to connect to game tab");
        }
      }
    }

    connect();

    return () => {
      disposed = true;
      unsub?.();
      window.removeEventListener("message", interceptPostMessage);
      port?.disconnect();
    };
  }, []);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#0b1220",
          color: "#ff6b6b",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 21, marginBottom: 12, color: "#7ff2a3" }}>
            {">"}_ Hammer Terminal
          </div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#0b1220",
          color: "#6b7a99",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 16,
        }}
      >
        Connecting to game...
      </div>
    );
  }

  return <HammerApp mode="window" />;
}
