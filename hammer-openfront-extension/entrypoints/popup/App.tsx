import { useState, useEffect, useCallback } from "react";
import { version as pkgVersion } from "../../package.json";

/**
 * Extension-icon popup — the master control center.
 *
 * This is the always-available anchor: it talks straight to the background and
 * content script, independent of any possibly-broken in-game or external view.
 * It is the guaranteed way to recover a stuck state.
 */

interface Status {
  ok: boolean;
  gameTabConnected: boolean;
  externalOpen: boolean;
  inGameView: "disguised" | "revealed" | "hidden" | null;
}

const EMPTY: Status = {
  ok: false,
  gameTabConnected: false,
  externalOpen: false,
  inGameView: null,
};

export default function PopupApp() {
  const [status, setStatus] = useState<Status>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
      setLoading(false);
      if (chrome.runtime.lastError || !resp?.ok) {
        setStatus(EMPTY);
      } else {
        setStatus({
          ok: true,
          gameTabConnected: !!resp.gameTabConnected,
          externalOpen: !!resp.externalOpen,
          inGameView: resp.inGameView ?? null,
        });
      }
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const setInGameView = useCallback(
    (view: "disguised" | "revealed" | "hidden") => {
      chrome.runtime.sendMessage({ type: "SET_IN_GAME_VIEW", view }, refresh);
    },
    [refresh],
  );

  const openExternal = useCallback(() => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }, refresh);
  }, [refresh]);

  const closeExternal = useCallback(() => {
    chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" }, refresh);
  }, [refresh]);

  // Reset to a known-good state: external closed, in-game back to disguised.
  const resetViews = useCallback(() => {
    chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" }, () => {
      chrome.runtime.sendMessage({ type: "SET_IN_GAME_VIEW", view: "disguised" }, refresh);
    });
  }, [refresh]);

  const connected = status.gameTabConnected;
  const igv = status.inGameView;
  const igvLabel =
    igv === "revealed" ? "controls open"
    : igv === "hidden" ? "hidden"
    : igv === "disguised" ? "analytics card"
    : "—";

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={{ fontSize: 18 }}>{">"}_</span>
        <span style={S.title}>Hammer Terminal</span>
        <span style={{ marginLeft: "auto", color: "#6b7a99", fontSize: 11 }}>
          v{pkgVersion}
        </span>
      </div>

      {/* Status block */}
      <div style={S.statusBox}>
        <StatusRow
          label="Game tab"
          value={loading ? "…" : connected ? "connected" : "not on OpenFront"}
          color={connected ? "#7ff2a3" : "#ff6b6b"}
        />
        <StatusRow label="In-game" value={igvLabel} color="#c5d0e6" />
        <StatusRow
          label="External"
          value={status.externalOpen ? "open" : "closed"}
          color={status.externalOpen ? "#7bb8ff" : "#6b7a99"}
        />
      </div>

      {/* In-game controls */}
      <div style={S.section}>IN-GAME VIEW</div>
      <div style={S.row}>
        <button style={btn(igv === "disguised")} onClick={() => setInGameView("disguised")} disabled={!connected}>
          Analytics
        </button>
        <button style={btn(igv === "revealed")} onClick={() => setInGameView("revealed")} disabled={!connected}>
          Controls
        </button>
        <button style={btn(igv === "hidden")} onClick={() => setInGameView("hidden")} disabled={!connected}>
          Hide
        </button>
      </div>

      {/* External controls */}
      <div style={S.section}>EXTERNAL WINDOW</div>
      <div style={S.row}>
        {status.externalOpen ? (
          <>
            <button style={btn(false)} onClick={openExternal}>Focus</button>
            <button style={btn(false)} onClick={closeExternal}>Close</button>
          </>
        ) : (
          <button
            style={{ ...btn(false), borderColor: "#7bb8ff", color: "#7bb8ff" }}
            onClick={openExternal}
            disabled={!connected}
          >
            Launch external window
          </button>
        )}
      </div>

      {/* Recovery */}
      <button style={S.reset} onClick={resetViews}>
        Reset views
      </button>
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#6b7a99" }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    background: active ? "rgba(127,242,163,0.12)" : "#151f33",
    color: active ? "#7ff2a3" : "#c5d0e6",
    border: `1px solid ${active ? "rgba(127,242,163,0.4)" : "#1e3050"}`,
    borderRadius: 4,
    padding: "6px 8px",
    fontFamily: "Consolas, monospace",
    fontSize: 12,
    cursor: "pointer",
  };
}

const S: Record<string, React.CSSProperties> = {
  root: {
    width: 280,
    padding: 16,
    backgroundColor: "#0b1220",
    color: "#c5d0e6",
    fontFamily: "Consolas, monospace",
    fontSize: 13,
  },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  title: { color: "#7ff2a3", fontWeight: "bold", fontSize: 16 },
  statusBox: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 14,
    padding: 8,
    backgroundColor: "#151f33",
    borderRadius: 4,
    border: "1px solid #1e3050",
  },
  section: { fontSize: 10, color: "#6b7a99", letterSpacing: 1, margin: "8px 0 4px" },
  row: { display: "flex", gap: 6 },
  reset: {
    width: "100%",
    marginTop: 14,
    background: "transparent",
    color: "#6b7a99",
    border: "1px solid #1e3050",
    borderRadius: 4,
    padding: "6px 8px",
    fontFamily: "Consolas, monospace",
    fontSize: 12,
    cursor: "pointer",
  },
};
