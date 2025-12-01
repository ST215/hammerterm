(function () {
  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log("[OF-Ext][content]", ...args); };
  const OVERLAY_ID = "of-gold-overlay";

  // Auto-inject the main-world script at page load
  log("boot: scheduling main-world injector");
  tryInjectMainWorld();
  document.addEventListener("DOMContentLoaded", tryInjectMainWorld, { once: true });

  function tryInjectMainWorld() {
    try {
      if (document.documentElement && !document.documentElement.__ofGoldInjectorLoaded) {
        document.documentElement.__ofGoldInjectorLoaded = true;

        // Inject logger first
        log("injecting logger.js into MAIN world");
        const logger = document.createElement("script");
        logger.src = chrome.runtime.getURL("utils/logger.js");
        logger.type = "text/javascript";
        logger.onload = () => {
          log("logger.js loaded");

          // Then inject main script
          log("injecting injector.js into MAIN world");
          const s = document.createElement("script");
          s.src = chrome.runtime.getURL("injector.js");
          s.type = "text/javascript";
          s.onload = () => {
            log("injector.js loaded");
            try { s.remove(); } catch {}
          };
          (document.head || document.documentElement).appendChild(s);

          try { logger.remove(); } catch {}
        };
        (document.head || document.documentElement).appendChild(logger);
      }
    } catch {}
  }

  // Bridge: listen to page postMessages from injector
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || msg.__ofTap !== true) return;
    log("message from page:", msg.kind);

    if (msg.kind === "gold_rate") {
      if (!isOverlayEnabledCache) return;
      ensureOverlay();
      updateOverlay(msg);
    } else if (msg.kind === "adv_stats") {
      if (!isAdvOverlayEnabledCache) return;
      ensureAdvOverlay();
      updateAdvOverlay(msg);
    } else if (msg.kind === "troop_status") {
      // Persist troop feeder status for popup
      try { chrome.storage?.local?.set({ of_troop_status: String(msg.text || "") }); } catch {}
    } else if (msg.kind === "gold_status") {
      // Persist gold feeder status for popup
      try { chrome.storage?.local?.set({ of_gold_status: String(msg.text || "") }); } catch {}
    } else if (msg.kind === "players_list") {
      try { chrome.storage?.local?.set({ of_players_list: msg.players || [] }); } catch {}
    }
  });

  // Listen for page -> content messages (for target capture via ALT+M)
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || msg.__ofFromPage !== true) return;

    if (msg.kind === "feeder_set_target") {
      // Update selected target in feeder state
      try {
        const target = msg?.payload?.target;
        if (target) {
          log("received feeder_set_target from page", target);
          chrome.storage?.local?.get(["of_feeder_state"]).then((res) => {
            const st = res?.of_feeder_state || {};
            st.selectedTarget = target;
            chrome.storage?.local?.set({ of_feeder_state: st });
          }).catch(() => {});
        }
      } catch {}
    } else if (msg.kind === "troop_feeder_toggle") {
      // Handle keyboard toggle for troop feeder
      try {
        const wasRunning = !!(msg?.payload?.running);
        if (wasRunning) {
          window.postMessage({ __ofFromExt: true, kind: "troop_feeder_stop" }, "*");
        } else {
          chrome.storage?.local?.get(["of_feeder_state"]).then((res) => {
            const st = res?.of_feeder_state || {};
            if (!st.selectedTarget) {
              try { chrome.storage?.local?.set({ of_troop_status: "No target selected" }); } catch {}
              return;
            }
            const payload = {
              target: st.selectedTarget.name || st.selectedTarget.id,
              targetId: st.selectedTarget.id,
              ratio: st.troopRatio || 20,
              threshold: st.troopThreshold || 50
            };
            window.postMessage({ __ofFromExt: true, kind: "troop_feeder_start", payload }, "*");
          }).catch(() => {});
        }
      } catch {}
    } else if (msg.kind === "gold_feeder_toggle") {
      // Handle keyboard toggle for gold feeder
      try {
        const wasRunning = !!(msg?.payload?.running);
        if (wasRunning) {
          window.postMessage({ __ofFromExt: true, kind: "gold_feeder_stop" }, "*");
        } else {
          chrome.storage?.local?.get(["of_feeder_state"]).then((res) => {
            const st = res?.of_feeder_state || {};
            if (!st.selectedTarget) {
              try { chrome.storage?.local?.set({ of_gold_status: "No target selected" }); } catch {}
              return;
            }
            const payload = {
              target: st.selectedTarget.name || st.selectedTarget.id,
              targetId: st.selectedTarget.id,
              ratio: st.goldRatio || 20,
              threshold: st.goldThreshold || 1000,
              rate: st.goldRate || 2000
            };
            window.postMessage({ __ofFromExt: true, kind: "gold_feeder_start", payload }, "*");
          }).catch(() => {});
        }
      } catch {}
    }
  });

  // Toggle overlay via popup -> content messaging and storage
  let isOverlayEnabledCache = false;
  let isAdvOverlayEnabledCache = false;

  try {
    chrome.storage?.local?.get("of_overlay_enabled").then((res) => {
      if (res && res.of_overlay_enabled === true) {
        isOverlayEnabledCache = true;
        ensureOverlay();
      } else {
        isOverlayEnabledCache = false;
        hideOverlay();
      }
    }).catch(() => {});
  } catch {}

  chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
    if (msg && msg.__ofCmd === "overlay_toggle") {
      isOverlayEnabledCache = !!msg.enabled;
      if (isOverlayEnabledCache) {
        ensureOverlay();
      } else {
        hideOverlay();
      }
    }

    if (msg && msg.__ofCmd === "adv_overlay_toggle") {
      isAdvOverlayEnabledCache = !!msg.enabled;
      if (isAdvOverlayEnabledCache) {
        ensureAdvOverlay();
      } else {
        hideAdvOverlay();
      }
    }

    // Troop Feeder commands
    if (msg && msg.__ofCmd === "troop_feeder_start") {
      window.postMessage({ __ofFromExt: true, kind: "troop_feeder_start", payload: msg.payload || {} }, "*");
    }
    if (msg && msg.__ofCmd === "troop_feeder_stop") {
      window.postMessage({ __ofFromExt: true, kind: "troop_feeder_stop" }, "*");
    }

    // Gold Feeder commands
    if (msg && msg.__ofCmd === "gold_feeder_start") {
      window.postMessage({ __ofFromExt: true, kind: "gold_feeder_start", payload: msg.payload || {} }, "*");
    }
    if (msg && msg.__ofCmd === "gold_feeder_stop") {
      window.postMessage({ __ofFromExt: true, kind: "gold_feeder_stop" }, "*");
    }

    // Feeder log toggle
    if (msg && msg.__ofCmd === "feeder_log_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "feeder_log_toggle", payload: { enabled } }, "*");
    }

    // Capture target (Alt+M) - still useful
    if (msg && msg.__ofCmd === "capture_mouse_player") {
      window.postMessage({ __ofFromExt: true, kind: "capture_mouse_player" }, "*");
    }

    // Logger commands - forward to page via postMessage
    if (msg && msg.__ofCmd === "get_recent_logs") {
      window.__pendingLogResponse = sendResponse;
      window.postMessage({ __ofFromExt: true, kind: "get_recent_logs" }, "*");
      return true; // async response
    }
    if (msg && msg.__ofCmd === "export_logs") {
      window.__pendingLogResponse = sendResponse;
      window.postMessage({ __ofFromExt: true, kind: "export_logs", payload: msg.payload || {} }, "*");
      return true; // async response
    }
    if (msg && msg.__ofCmd === "export_errors") {
      window.__pendingLogResponse = sendResponse;
      window.postMessage({ __ofFromExt: true, kind: "export_errors" }, "*");
      return true; // async response
    }
    if (msg && msg.__ofCmd === "clear_logs") {
      window.postMessage({ __ofFromExt: true, kind: "clear_logs" }, "*");
      sendResponse({ success: true });
      return true;
    }
    if (msg && msg.__ofCmd === "set_log_level") {
      window.postMessage({ __ofFromExt: true, kind: "set_log_level", payload: msg.payload || {} }, "*");
      sendResponse({ success: true });
      return true;
    }
  });

  // Listen for log responses from page
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || msg.__ofFromPage !== true) return;

    if (msg.kind === "recent_logs_response" && window.__pendingLogResponse) {
      window.__pendingLogResponse({ logs: msg.payload?.logs || [] });
      delete window.__pendingLogResponse;
    } else if (msg.kind === "export_logs_response" && window.__pendingLogResponse) {
      window.__pendingLogResponse({ logs: msg.payload?.logs || '{}' });
      delete window.__pendingLogResponse;
    } else if (msg.kind === "export_errors_response" && window.__pendingLogResponse) {
      window.__pendingLogResponse({ logs: msg.payload?.logs || '{}' });
      delete window.__pendingLogResponse;
    }
  });

  function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    log("creating overlay");
    Object.assign(el.style, {
      position: "fixed",
      zIndex: 2147483647,
      top: "12px",
      left: "12px",
      minWidth: "220px",
      maxWidth: "320px",
      color: "#fff",
      background: "rgba(0,0,0,0.75)",
      borderRadius: "10px",
      padding: "10px 12px",
      font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
      boxShadow: "0 4px 18px rgba(0,0,0,.4)",
      pointerEvents: "none",
    });
    el.innerHTML = "<div style=\"font-weight:600;margin-bottom:6px\">Gold Rate</div><div id=\"of-gold-body\">waiting for data...</div>";
    document.documentElement.appendChild(el);
    positionOverlays();
  }

  function hideOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  // Advanced overlay
  const ADV_OVERLAY_ID = "of-adv-overlay";
  function ensureAdvOverlay() {
    if (document.getElementById(ADV_OVERLAY_ID)) return;
    const el = document.createElement("div");
    el.id = ADV_OVERLAY_ID;
    Object.assign(el.style, {
      position: "fixed",
      zIndex: 2147483646,
      top: "12px",
      left: "12px",
      minWidth: "260px",
      maxWidth: "360px",
      color: "#fff",
      background: "rgba(0,0,0,0.75)",
      borderRadius: "10px",
      padding: "10px 12px",
      font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
      boxShadow: "0 4px 18px rgba(0,0,0,.4)",
      pointerEvents: "none",
    });
    el.innerHTML = "<div style=\"font-weight:600;margin-bottom:6px\">Advanced Stats</div><div id=\"of-adv-body\">waiting...</div>";
    document.documentElement.appendChild(el);
    positionOverlays();
  }

  function hideAdvOverlay() {
    const el = document.getElementById(ADV_OVERLAY_ID);
    if (el) el.remove();
  }

  function updateAdvOverlay({ playerName, team, smallID, tilesOwned, troops, maxTroops, outgoing, incoming, allies, embargoes }) {
    const body = document.getElementById("of-adv-body");
    if (!body) return;
    body.innerHTML = `
      <div><b>Player</b>: ${escapeHtml(playerName || "me")}</div>
      <div><b>Team</b>: ${escapeHtml(String(team ?? "-"))}</div>
      <div><b>ID</b>: ${smallID ?? "-"}</div>
      <div><b>Tiles</b>: ${tilesOwned}</div>
      <div><b>Troops</b>: ${formatTroopsK(troops)}${Number.isFinite(Number(maxTroops)) && maxTroops > 0 ? ` / ${formatTroopsK(maxTroops)}` : ""}</div>
      <div><b>Attacks</b>: out ${outgoing}, in ${incoming}</div>
      <div><b>Allies</b>: ${allies}</div>
    `;
    positionOverlays();
  }

  function positionOverlays() {
    try {
      const gold = document.getElementById(OVERLAY_ID);
      const adv = document.getElementById(ADV_OVERLAY_ID);
      if (!gold || !adv) return;
      const ar = adv.getBoundingClientRect();
      const margin = 12;
      gold.style.left = `${Math.round(ar.right + margin)}px`;
      gold.style.top = `${Math.round(ar.top)}px`;
      gold.style.transform = "none";
    } catch {}
  }

  function updateOverlay({ gpm60, gpm120, gps30, gps60, lastGold, lastAt, playerName }) {
    const body = document.getElementById("of-gold-body");
    if (!body) return;
    log("render overlay", { gps30, gps60, gpm60, gpm120, lastGold });
    body.innerHTML = `
      <div><b>Player</b>: ${escapeHtml(playerName || "me")}</div>
      <div><b>Gold/sec (30s)</b>: ${formatGoldK(gps30)}</div>
      <div><b>Gold/sec (60s)</b>: ${formatGoldK(gps60)}</div>
      <div><b>Gold/min (60s)</b>: ${formatGoldK(gpm60)}</div>
      <div><b>Gold/min (120s)</b>: ${formatGoldK(gpm120)}</div>
      <div><b>Gold</b>: ${formatGoldK(lastGold)}</div>
    `;
    positionOverlays();
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatGoldK(v) {
    try {
      if (typeof v === "bigint") {
        const rounded = (v + 500n) / 1000n;
        return `${rounded.toString()}k`;
      }
      if (typeof v === "string" && /^\d+$/.test(v)) {
        const bi = BigInt(v);
        const rounded = (bi + 500n) / 1000n;
        return `${rounded.toString()}k`;
      }
      const n = Number(v);
      if (Number.isFinite(n)) {
        return `${Math.round(n / 1000)}k`;
      }
      return String(v);
    } catch {
      return String(v);
    }
  }

  function formatNumberK(v) {
    try {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      if (Math.abs(n) < 1000) return String(Math.round(n));
      const divided = n / 1000;
      return `${divided.toFixed(1).replace(/\.0$/, "")}k`;
    } catch {
      return String(v);
    }
  }

  function formatTroopsK(v) {
    try {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      const display = n / 10;
      return formatNumberK(display);
    } catch {
      return String(v);
    }
  }
})();
