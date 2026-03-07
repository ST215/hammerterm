import { useEffect, useState } from "react";
import { useStore } from "@store/index";
import { deserialize } from "@shared/serialize";
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
  "reciprocatePopupsEnabled",
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
            const data = deserialize(msg.data);
            // Apply only game-data fields, skip local UI keys and functions
            const patch: Record<string, any> = {};
            for (const [key, val] of Object.entries(data)) {
              if (typeof val !== "function" && !LOCAL_KEYS.has(key)) {
                patch[key] = val;
              }
            }
            useStore.setState(patch);
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
          const changes: Record<string, unknown> = {};
          for (const key of LOCAL_KEYS) {
            if ((state as any)[key] !== (prev as any)[key]) {
              changes[key] = (state as any)[key];
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
