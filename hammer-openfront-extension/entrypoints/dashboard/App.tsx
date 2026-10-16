import { useEffect, useRef, useState } from "react";
import { useStore } from "@store/index";
import { deserializeWithSharing, mapsEqual, setsEqual } from "@shared/serialize";
import HammerApp from "@ui/components/App";

// Keys the user edits in this window. Edits push to the game tab immediately
// (sync-local); see WINDOW_ONLY_KEYS below for which of them also flow back.
const LOCAL_KEYS = new Set([
  // UI navigation / presentation
  "view", "paused", "sizeIdx", "inGameView", "externalOpen",
  // Comms selections (user picks targets in dashboard)
  "commsTargets", "commsGroupMode", "commsOthersExpanded",
  "commsPendingQC", "commsRecentSent", "allianceCommsExpanded",
  "commsPaceMs", "commsPaceHuman", "commsActiveBatch",
  // Reciprocate config
  "reciprocateMode", "reciprocateAutoPct", "reciprocateNotifyDuration",
  "reciprocateEnabled", "reciprocateOnGold", "reciprocateOnTroops",
  "reciprocatePopupsEnabled", "palantirMinPct", "palantirMaxPct", "popupScale",
  "thankEnabled", "thankMode",
  // Auto-troops config
  "asTroopsRunning", "asTroopsTargets", "asTroopsRatio",
  "asTroopsThreshold", "asTroopsCooldownSec",
  "asTroopsAllTeamMode", "asTroopsAllAlliesMode",
  // Auto-gold config
  "asGoldRunning", "asGoldTargets", "asGoldRatio",
  "asGoldThreshold", "asGoldCooldownSec",
  "asGoldAllTeamMode", "asGoldAllAlliesMode",
  // Attack-ratio governor config (telemetry stays out — it flows content→dashboard)
  "attackRatioRunning", "attackRatioMode", "attackRatioBasePct",
  "attackRatioBreakevenPct", "attackRatioFloorPct", "attackRatioMaxCap",
  // Activity feed toggles
  "screenPopupsEnabled", "donationAlertsEnabled", "growthHudEnabled",
  "toastInboundTroops", "toastInboundGold", "toastOutboundTroops", "toastOutboundGold",
  "toastScale", "statusToastScale",
  // Notification positions
  "reciprocatePosition", "donationPosition", "statusPosition", "growthPosition",
  // CIA user preferences
  "ciaWindowMs", "ciaFeedFilter",
  // Broadcast config
  "broadcastEnabled", "broadcastEmojiIndex", "broadcastSequence",
  "broadcastUseSequence",
  // Recorder (only the toggle — count & events come from content script snapshots)
  "recorderOn",
]);

// Window-local presentation & in-progress selections: never adopted from the
// game tab. Every OTHER LOCAL_KEY is a setting/toggle the GAME TAB owns: it's
// adopted from snapshots (so this window opens showing your real settings and
// reflects changes made in the overlay or by hotkey) unless you edited it here
// within TOUCH_GUARD_MS — so an in-flight snapshot can't revert your click.
const WINDOW_ONLY_KEYS = new Set([
  "view", "paused", "sizeIdx", "inGameView", "externalOpen",
  "commsTargets", "commsGroupMode", "commsOthersExpanded",
  "commsPendingQC", "commsRecentSent", "allianceCommsExpanded", "commsActiveBatch",
]);
const TOUCH_GUARD_MS = 2000;

export default function DashboardApp() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // Once this window has shown data, a dropped connection (the game page
  // reloads at the end of EVERY match) keeps the terminal up with a banner
  // instead of blanking or erroring.
  const [everConnected, setEverConnected] = useState(false);
  const everConnectedRef = useRef(false);

  // This window's own store always shows the full terminal (mode="window"
  // ignores inGameView). The game-tab overlay's externalOpen/inGameView is
  // driven authoritatively by the background (EXTERNAL_STATE), not from here.

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let disposed = false;
    let unsub: (() => void) | null = null;
    const touchedAt = new Map<string, number>();
    let applyingSnapshot = false;

    // LOCAL_KEY edits made while disconnected (the game page reloads at the
    // end of every match), replayed on reconnect.
    const pendingLocal = new Set<string>();

    // Reverse sync: push LOCAL_KEY edits to the game tab. Lives for the whole
    // window (not per connection) so edits during a reload aren't dropped.
    unsub = useStore.subscribe((state, prev) => {
      if (applyingSnapshot) return;

      // Forward notification dismissals to game tab
      if (port && state.reciprocateNotifications !== prev.reciprocateNotifications) {
        for (const n of state.reciprocateNotifications) {
          const old = prev.reciprocateNotifications.find((p) => p.id === n.id);
          if (n.dismissed && old && !old.dismissed) {
            try { port.postMessage({ type: "dismiss-notification", id: n.id }); } catch { /* port died */ }
          }
        }
      }

      const changes: Record<string, unknown> = {};
      for (const key of LOCAL_KEYS) {
        const curr = (state as any)[key];
        const old = (prev as any)[key];
        if (curr instanceof Map && old instanceof Map) {
          if (!mapsEqual(curr, old)) changes[key] = curr;
        } else if (curr instanceof Set && old instanceof Set) {
          if (!setsEqual(curr, old)) changes[key] = curr;
        } else if (curr !== old) {
          changes[key] = curr;
        }
      }
      const keys = Object.keys(changes);
      if (keys.length === 0) return;
      const now = Date.now();
      for (const key of keys) touchedAt.set(key, now);
      if (!port) {
        for (const key of keys) pendingLocal.add(key);
        return;
      }
      try { port.postMessage({ type: "sync-local", data: changes }); } catch { /* port died */ }
    });

    // Intercept sendToMainWorld calls (window.postMessage with __hammer flag)
    // and forward them through the port to the content script
    function interceptPostMessage(e: MessageEvent) {
      if (!e.data?.__hammer || e.data.type !== "send" || !port) return;
      port.postMessage({ type: "command", payload: e.data.payload });
    }
    window.addEventListener("message", interceptPostMessage);

    async function connect() {
      try {
        let response: any;
        try {
          response = await chrome.runtime.sendMessage({ type: "GET_GAME_TAB" });
        } catch {
          // "Receiving end does not exist" — background not ready yet
          throw new Error("Background service not ready");
        }

        if (disposed) return;

        if (!response?.ok || !response.tabId) {
          throw new Error("No active game tab found. Open OpenFront.io first.");
        }

        port = chrome.tabs.connect(response.tabId, {
          name: "hammer-dashboard",
        });

        port.onMessage.addListener((msg) => {
          if (msg.type === "snapshot" && msg.data) {
            attempt = 0; // connection proven — reset the backoff
            // Edits made while the game tab was reloading: replay them now that
            // the connection is proven, and guard them so this very snapshot
            // (built before the replay lands) can't revert them.
            if (pendingLocal.size > 0 && port) {
              const state = useStore.getState() as any;
              const data: Record<string, unknown> = {};
              const now = Date.now();
              for (const key of pendingLocal) {
                data[key] = state[key];
                touchedAt.set(key, now);
              }
              pendingLocal.clear();
              try { port.postMessage({ type: "sync-local", data }); } catch { /* port died */ }
            }
            const currentState = useStore.getState();
            const data = deserializeWithSharing(msg.data, currentState);
            const now = Date.now();
            const patch: Record<string, any> = {};
            for (const [key, val] of Object.entries(data)) {
              if (typeof val === "function" || WINDOW_ONLY_KEYS.has(key)) continue;
              if (LOCAL_KEYS.has(key) && now - (touchedAt.get(key) ?? 0) < TOUCH_GUARD_MS) continue;
              patch[key] = val;
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
              // Adopted values must not echo back to the game tab as "edits".
              applyingSnapshot = true;
              try {
                useStore.setState(finalPatch);
              } finally {
                applyingSnapshot = false;
              }
            }
            setConnected(true);
            everConnectedRef.current = true;
            setEverConnected(true);
            setError(null);
          }
        });

        port.onDisconnect.addListener(() => {
          // Null out port immediately so edits queue in pendingLocal instead.
          port = null;

          if (!disposed) {
            setConnected(false);
            scheduleRetry();
          }
        });


        // Connected only once a snapshot arrives: a tab whose content script
        // isn't listening yet (page still loading) just drops the port.
      } catch (err: any) {
        if (!disposed) {
          lastError = err?.message || "Failed to connect to game tab";
          scheduleRetry();
        }
      }
    }

    // Retry for as long as this window is open. The game page reloads at the
    // end of every match and takes several seconds to bring its content script
    // back, so a fixed retry budget (the old 5×1s, never reset) killed this
    // window after the first match. Backoff caps at 3s.
    let attempt = 0;
    let lastError = "No active game tab found. Open OpenFront.io first.";
    const SHOW_ERROR_AFTER = 10; // only if we've never connected

    function scheduleRetry() {
      if (disposed) return;
      attempt++;
      if (attempt >= SHOW_ERROR_AFTER && !everConnectedRef.current) setError(lastError);
      setTimeout(tryConnect, Math.min(3000, 500 * attempt));
    }

    function tryConnect() {
      if (disposed) return;
      connect();
    }

    tryConnect();

    return () => {
      disposed = true;
      unsub?.();
      window.removeEventListener("message", interceptPostMessage);
      port?.disconnect();
    };
  }, [retryKey]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#0b1220",
          color: "#7694b0",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 14,
          padding: 24,
          textAlign: "center",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 21, color: "#7ff2a3" }}>
          {">"}_ Hammer Terminal
        </div>
        <div style={{ color: "#ff6b6b" }}>{error}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => { setError(null); setConnected(false); setRetryKey((k) => k + 1); }}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              color: "#7ff2a3",
              background: "rgba(127, 242, 163, 0.08)",
              border: "1px solid rgba(127, 242, 163, 0.3)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            RETRY CONNECTION
          </button>
          {/* Never trap the user in a dead external window: closing it makes the
              background restore the in-game overlay (the guaranteed way back). */}
          <button
            onClick={() => chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" })}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              color: "#7694b0",
              background: "transparent",
              border: "1px solid #1e3558",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            RETURN TO IN-GAME
          </button>
        </div>
      </div>
    );
  }

  if (!connected && !everConnected) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#0b1220",
          color: "#7694b0",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 14,
        }}
      >
        Connecting to game tab...
      </div>
    );
  }

  // Click-to-enter gate. Looks like a generic loading screen so screen
  // viewers don't immediately notice the tool. User clicks anywhere
  // (including the small Continue button) to enter.
  if (!unlocked) {
    return (
      <div
        onClick={() => setUnlocked(true)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#0b1220",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          gap: 16,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 13, color: "#5a7090" }}>_</div>
        <button
          onClick={(e) => { e.stopPropagation(); setUnlocked(true); }}
          style={{
            padding: "6px 18px",
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: "#7694b0",
            background: "transparent",
            border: "1px solid #1e3558",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <>
      {!connected && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            padding: "2px 8px",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: "#f2c94c",
            background: "rgba(11, 18, 32, 0.92)",
            borderBottom: "1px solid #1e3558",
            textAlign: "center",
          }}
        >
          game tab reloading — reconnecting…
        </div>
      )}
      <HammerApp mode="window" />
    </>
  );
}
