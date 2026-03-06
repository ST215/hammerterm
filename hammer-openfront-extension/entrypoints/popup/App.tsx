import { useState, useEffect, useCallback } from "react";

type Status = "loading" | "active" | "inactive";

export default function PopupApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [displayMode, setDisplayMode] = useState<"overlay" | "window">("overlay");

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus("inactive");
      } else {
        setStatus("active");
      }
    });
  }, []);

  const toggleVisibility = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_VISIBILITY" });
    }
  }, []);

  const toggleMode = useCallback(async () => {
    const newMode = displayMode === "overlay" ? "window" : "overlay";
    setDisplayMode(newMode);

    // Tell content script to switch display mode
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "SET_DISPLAY_MODE", mode: newMode });
    }

    // Open dashboard for window mode, close it for overlay mode
    if (newMode === "window") {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    } else {
      chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" });
    }
  }, [displayMode]);

  const openDashboard = useCallback(() => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  }, []);

  const statusColor =
    status === "active" ? "#7ff2a3" : status === "inactive" ? "#ff6b6b" : "#6b7a99";
  const statusLabel =
    status === "active" ? "Connected" : status === "inactive" ? "Not on OpenFront" : "Loading...";

  return (
    <div
      style={{
        width: 280,
        padding: 16,
        backgroundColor: "#0b1220",
        color: "#c5d0e6",
        fontFamily: "Consolas, monospace",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{">"}_</span>
        <span style={{ color: "#7ff2a3", fontWeight: "bold", fontSize: 16 }}>
          Hammer Terminal
        </span>
      </div>

      {/* Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          padding: 8,
          backgroundColor: "#151f33",
          borderRadius: 4,
          border: "1px solid #1e3050",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: statusColor,
            display: "inline-block",
          }}
        />
        <span style={{ color: statusColor, fontSize: 12 }}>{statusLabel}</span>
        <span style={{ marginLeft: "auto", color: "#6b7a99", fontSize: 11 }}>v11.0</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button onClick={toggleVisibility} style={btnStyle}>
          Toggle UI Visibility
        </button>
        <button onClick={toggleMode} style={btnStyle}>
          Mode: {displayMode === "overlay" ? "Overlay" : "Window"}
        </button>
        <button onClick={openDashboard} style={{ ...btnStyle, borderColor: "#7bb8ff" }}>
          Open Dashboard
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#151f33",
  color: "#c5d0e6",
  border: "1px solid #1e3050",
  borderRadius: 4,
  padding: "6px 12px",
  fontFamily: "Consolas, monospace",
  fontSize: 12,
  cursor: "pointer",
  textAlign: "left",
};
