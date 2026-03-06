import { useEffect, useState } from "react";
import { useStore } from "@store/index";
import { deserialize } from "@shared/serialize";
import HammerApp from "@ui/components/App";

export default function DashboardApp() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let disposed = false;

    async function connect() {
      try {
        // Ask background for the game tab ID
        const response = await chrome.runtime.sendMessage({
          type: "GET_GAME_TAB",
        });

        if (disposed) return;

        if (!response?.ok || !response.tabId) {
          setError("No active game tab found. Open OpenFront.io first.");
          return;
        }

        // Connect directly to the content script
        port = chrome.tabs.connect(response.tabId, {
          name: "hammer-dashboard",
        });

        port.onMessage.addListener((msg) => {
          if (msg.type === "snapshot" && msg.data) {
            const data = deserialize(msg.data);
            // Apply data fields to local store, skip functions
            const patch: Record<string, any> = {};
            for (const [key, val] of Object.entries(data)) {
              if (typeof val !== "function") {
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
      port?.disconnect();
    };
  }, []);

  // Override store actions to send commands through port to content script
  // (The dashboard's local store actions work for UI-only state like view/tab,
  //  but game commands need to go through the content script)

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
          fontFamily: "Consolas, monospace",
          fontSize: 14,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 18, marginBottom: 12, color: "#7ff2a3" }}>
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
          fontFamily: "Consolas, monospace",
          fontSize: 14,
        }}
      >
        Connecting to game...
      </div>
    );
  }

  return <HammerApp mode="window" />;
}
