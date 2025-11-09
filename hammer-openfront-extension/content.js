(function () {
  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log("[OF-Ext][content]", ...args); };
  const OVERLAY_ID = "of-gold-overlay";
  const EVENT_NAME = "__of_gold_update";

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
    } else if (msg.kind === "as_status") {
      try {
        const text = String(msg.text || "");
        // Persist last Scope Feeder status text for popup to read
        chrome.storage?.local?.set({ of_as_status_text: text });
      } catch {}
    } else if (msg.kind === "players_list") {
      try { chrome.storage?.local?.set({ of_players_list: msg.players || [] }); } catch {}
    }
  });

  // Listen for page -> content messages (for ALT+M target capture)
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || msg.__ofFromPage !== true) return;
    if (msg.kind === "as_altf_toggle") {
      try {
        const wasRunning = !!(msg && msg.payload && msg.payload.running);
        if (wasRunning) {
          // If it was running, just stop
          window.postMessage({ __ofFromExt: true, kind: "as_stop" }, "*");
        } else {
          // If it was not running, load saved settings then stop-then-start
          chrome.storage?.local?.get(["of_as_state"]).then((res) => {
            const st = res?.of_as_state || {};
            const target = (st.target || "");
            const ratio = Math.max(1, Math.min(100, Number(st.ratio || 20)));
            const threshold = Math.max(1, Math.min(100, Number(st.threshold || 50)));
            if (!target) {
              try { window.postMessage({ __ofTap: true, kind: "as_status", text: "No target set" }, "*"); } catch {}
              return;
            }
            window.postMessage({ __ofFromExt: true, kind: "as_stop" }, "*");
            setTimeout(() => {
              window.postMessage({ __ofFromExt: true, kind: "as_start", payload: { target, ratio, threshold } }, "*");
            }, 150);
          }).catch(() => {
            try { window.postMessage({ __ofTap: true, kind: "as_status", text: "No target set" }, "*"); } catch {}
          });
        }
      } catch {}
      return;
    }
    if (msg.kind === "as_set_target") {
      try {
        const target = msg?.payload?.target || "";
        log("received as_set_target from page", target);
        // Persist to storage so the popup (if open) live-updates via storage.onChanged
        chrome.storage?.local?.get(["of_as_state"]).then((res) => {
          const st = res?.of_as_state || {};
          const next = Object.assign({}, st, { target });
          chrome.storage?.local?.set({ of_as_state: next });
        }).catch(() => {});
      } catch {}
    } else if (msg.kind === "emoji_set_target") {
      try {
        const target = msg?.payload?.target || "";
        log("received emoji_set_target from page", target);
        chrome.storage?.local?.get(["of_emoji_state"]).then((res) => {
          const st = res?.of_emoji_state || {};
          const next = Object.assign({}, st, { target });
          chrome.storage?.local?.set({ of_emoji_state: next });
        }).catch(() => {});
      } catch {}
    }
  });

  // Toggle overlay via popup -> content messaging and storage
  // Default to disabled so injecting content.js for other features never shows the gold overlay
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
    if (msg && msg.__ofCmd === "emoji_spam_start") {
      window.postMessage({ __ofFromExt: true, kind: "emoji_spam_start", payload: msg.payload || {} }, "*");
    }
    if (msg && msg.__ofCmd === "emoji_spam_stop") {
      window.postMessage({ __ofFromExt: true, kind: "emoji_spam_stop" }, "*");
    }
    if (msg && msg.__ofCmd === "sam_overlay_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "sam_overlay_toggle", payload: { enabled } }, "*");
      try { chrome.storage?.local?.set({ of_sam_enabled: enabled }); } catch {}
    }
    if (msg && msg.__ofCmd === "atom_overlay_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "atom_overlay_toggle", payload: { enabled } }, "*");
      try { chrome.storage?.local?.set({ of_atom_enabled: enabled }); } catch {}
    }
    if (msg && msg.__ofCmd === "hydrogen_overlay_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "hydrogen_overlay_toggle", payload: { enabled } }, "*");
      try { chrome.storage?.local?.set({ of_hydrogen_enabled: enabled }); } catch {}
    }
    if (msg && msg.__ofCmd === "alliances_overlay_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "alliances_overlay_toggle", payload: { enabled } }, "*");
      try { chrome.storage?.local?.set({ of_alliances_enabled: enabled }); } catch {}
    }
    if (msg && msg.__ofCmd === "sam_log_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "sam_log_toggle", payload: { enabled } }, "*");
    }
    if (msg && msg.__ofCmd === "as_start") {
      window.postMessage({ __ofFromExt: true, kind: "as_start", payload: msg.payload || {} }, "*");
    }
    if (msg && msg.__ofCmd === "as_stop") {
      window.postMessage({ __ofFromExt: true, kind: "as_stop" }, "*");
    }
    if (msg && msg.__ofCmd === "as_log_toggle") {
      const enabled = !!msg.enabled;
      window.postMessage({ __ofFromExt: true, kind: "as_log_toggle", payload: { enabled } }, "*");
    }
    if (msg && msg.__ofCmd === "embargo_toggle") {
      const id = msg?.payload?.id;
      const action = msg?.payload?.action;
      if (id) window.postMessage({ __ofFromExt: true, kind: "embargo_toggle", payload: { id, action } }, "*");
    }
    if (msg && msg.__ofCmd === "embargo_all") {
      window.postMessage({ __ofFromExt: true, kind: "embargo_all" }, "*");
    }
    if (msg && msg.__ofCmd === "unembargo_all") {
      window.postMessage({ __ofFromExt: true, kind: "unembargo_all" }, "*");
    }
    if (msg && msg.__ofCmd === "capture_mouse_player") {
      window.postMessage({ __ofFromExt: true, kind: "capture_mouse_player" }, "*");
    }
    // Logger commands - forward to page via postMessage
    if (msg && msg.__ofCmd === "get_recent_logs") {
      // Store sendResponse callback for async response
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
    el.innerHTML = "<div style=\"font-weight:600;margin-bottom:6px\">Gold Rate</div><div id=\"of-gold-body\">waiting for data…</div>";
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
    el.innerHTML = "<div style=\"font-weight:600;margin-bottom:6px\">Advanced Stats</div><div id=\"of-adv-body\">waiting…</div>";
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
      <div><b>Allies</b>: ${allies}, <b>Embargoes</b>: ${embargoes}</div>
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
      // Place Gold directly to the right of Advanced
      gold.style.left = `${Math.round(ar.right + margin)}px`;
      gold.style.top = `${Math.round(ar.top)}px`;
      gold.style.transform = "none";
    } catch {}
  }

  function updateOverlay({ gpm60, gpm120, gps30, gps60, lastGold, lastAt, playerName }) {
    const body = document.getElementById("of-gold-body");
    if (!body) return;
    const fmt = (v) => (typeof v === "bigint" ? v.toString() : String(v));
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
        const rounded = (v + 500n) / 1000n; // nearest 1k
        return `${rounded.toString()}k`;
      }
      if (typeof v === "string" && /^\d+$/.test(v)) {
        const bi = BigInt(v);
        const rounded = (bi + 500n) / 1000n; // nearest 1k
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
      // Game renders troops as troops/10
      const display = n / 10;
      return formatNumberK(display);
    } catch {
      return String(v);
    }
  }
})();


