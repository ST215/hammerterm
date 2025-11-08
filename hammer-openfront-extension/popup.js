(function () {
  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log("[OF-Ext][popup]", ...a); };

  function withActiveTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab?.id) return;
      cb(tab.id);
    });
  }
  // Auto-Send Troops wiring
  function setStatus(text) {
    try { const el = document.getElementById("as-status"); if (el) el.textContent = text; } catch {}
  }

  function saveAutoSendState(state) {
    try { chrome.storage?.local?.set({ of_as_state: state }); } catch {}
  }

  function loadAutoSendState(cb) {
    try { chrome.storage?.local?.get(["of_as_state"]).then(res => cb(res?.of_as_state)).catch(() => cb(undefined)); } catch { cb(undefined); }
  }

  // Emoji Spam persistence
  function saveEmojiState(state) {
    try { chrome.storage?.local?.set({ of_emoji_state: state }); } catch {}
  }
  function loadEmojiState(cb) {
    try { chrome.storage?.local?.get(["of_emoji_state"]).then(res => cb(res?.of_emoji_state)).catch(() => cb(undefined)); } catch { cb(undefined); }
  }

  function sendAsCommand(tabId, kind, payload) {
    try { chrome.tabs.sendMessage(tabId, { __ofCmd: kind, payload }); } catch {}
  }

  // Restore saved inputs and keep a local copy to update on changes
  let asState = undefined;
  loadAutoSendState((st) => {
    try {
      asState = st || {};
      if (!st) return;
      const t = document.getElementById("as-target"); if (t && st.target) t.value = st.target;
      const r = document.getElementById("as-ratio"); if (r && st.ratio) r.value = String(st.ratio);
      const th = document.getElementById("as-threshold"); if (th && st.threshold) th.value = String(st.threshold);
      if (st.running) setStatus("Resumed (waiting…)");
    } catch {}
  });

  // Restore emoji spam inputs
  let emojiState = undefined;
  loadEmojiState((st) => {
    try {
      emojiState = st || {};
      const t = document.getElementById("emoji-target"); if (t && st?.target) t.value = st.target;
      const ei = document.getElementById("emoji-index"); if (ei && st?.emojiIndex !== undefined) ei.value = String(st.emojiIndex);
      const iv = document.getElementById("emoji-interval"); if (iv && st?.intervalMs !== undefined) iv.value = String(st.intervalMs);
    } catch {}
  });

  function persistInputs() {
    try {
      const target = (document.getElementById("as-target")?.value || "").trim();
      const ratio = Math.max(1, Math.min(100, Number((document.getElementById("as-ratio")?.value || "20").trim())));
      const threshold = Math.max(1, Math.min(100, Number((document.getElementById("as-threshold")?.value || "50").trim())));
      const next = Object.assign({}, asState || {}, { target, ratio, threshold });
      saveAutoSendState(next);
      asState = next;
    } catch {}
  }

  ["as-target", "as-ratio", "as-threshold"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", persistInputs);
    el.addEventListener("change", persistInputs);
    el.addEventListener("blur", persistInputs);
  });

  function persistEmojiInputs() {
    try {
      const target = (document.getElementById("emoji-target")?.value || "").trim() || "AllPlayers";
      const emojiIndex = Number((document.getElementById("emoji-index")?.value || "0").trim());
      const intervalMs = Number((document.getElementById("emoji-interval")?.value || "1000").trim());
      const next = Object.assign({}, emojiState || {}, { target, emojiIndex, intervalMs });
      saveEmojiState(next);
      emojiState = next;
    } catch {}
  }
  ["emoji-target", "emoji-index", "emoji-interval"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", persistEmojiInputs);
    el.addEventListener("change", persistEmojiInputs);
    el.addEventListener("blur", persistEmojiInputs);
  });

  // Live-sync Scope Feeder target when other contexts (page/injector) update storage
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area !== "local") return;
        if (changes.of_as_state) {
          const next = changes.of_as_state.newValue || {};
          const t = document.getElementById("as-target");
          if (t && typeof next.target === "string") {
            t.value = next.target;
            try { console.log("[OF-Ext][popup] Scope Feeder target updated from storage:", next.target); } catch {}
          }
        }
        if (changes.of_emoji_state) {
          const e = changes.of_emoji_state.newValue || {};
          const et = document.getElementById("emoji-target");
          if (et && typeof e.target === "string") {
            et.value = e.target;
            try { console.log("[OF-Ext][popup] Emoji target updated from storage:", e.target); } catch {}
          }
        }
        if (changes.of_as_status_text) {
          const txt = changes.of_as_status_text.newValue || "";
          setStatus(txt || "");
        }
      } catch {}
    });
  } catch {}

  // On popup open, read last as_status text and display
  try {
    chrome.storage?.local?.get(["of_as_status_text"]).then((res) => {
      if (res && typeof res.of_as_status_text === "string") setStatus(res.of_as_status_text);
    }).catch(() => {});
  } catch {}

  const asStart = document.getElementById("as-start");
  if (asStart) {
    asStart.addEventListener("click", () => {
      const target = (document.getElementById("as-target")?.value || "").trim();
      const ratio = Math.max(1, Math.min(100, Number((document.getElementById("as-ratio")?.value || "20").trim())));
      const threshold = Math.max(1, Math.min(100, Number((document.getElementById("as-threshold")?.value || "50").trim())));
      const payload = { target, ratio, threshold };
      saveAutoSendState({ target, ratio, threshold, running: true });
      setStatus("Restarting…");
      withActiveTab((tabId) => {
        // Ensure a clean restart: stop first, then start shortly after
        try { chrome.tabs.sendMessage(tabId, { __ofCmd: "as_stop" }); } catch {}
        setTimeout(() => sendAsCommand(tabId, "as_start", payload), 150);
      });
    });
  }

  const asStop = document.getElementById("as-stop");
  if (asStop) {
    asStop.addEventListener("click", () => {
      // Preserve last-known target/ratio/threshold so Alt+F has data to start with later
      const target = (document.getElementById("as-target")?.value || asState?.target || "").trim();
      const ratio = Math.max(1, Math.min(100, Number((document.getElementById("as-ratio")?.value || String(asState?.ratio || 20)).trim())));
      const threshold = Math.max(1, Math.min(100, Number((document.getElementById("as-threshold")?.value || String(asState?.threshold || 50)).trim())));
      saveAutoSendState({ target, ratio, threshold, running: false });
      setStatus("Stopped");
      withActiveTab((tabId) => sendAsCommand(tabId, "as_stop"));
    });
  }

  function sendToggleMessage(tabId, enabled) {
    try {
      chrome.tabs.sendMessage(tabId, { __ofCmd: "overlay_toggle", enabled: !!enabled });
    } catch {}
  }
  // Gold display toggle switch
  const displayTgl = document.getElementById("toggle-display");
  if (displayTgl) {
    try {
      chrome.storage.local.get("of_overlay_enabled").then((res) => {
        displayTgl.checked = !!res?.of_overlay_enabled;
      }).catch(() => {});
    } catch {}
    displayTgl.addEventListener("change", () => {
      const enabled = !!displayTgl.checked;
      try { chrome.storage.local.set({ of_overlay_enabled: enabled }); } catch {}
      withActiveTab((tabId) => sendToggleMessage(tabId, enabled));
    });
  }

  // Advanced overlay toggle
  const advTgl = document.getElementById("toggle-adv");
  if (advTgl) {
    advTgl.addEventListener("change", () => {
      const enabled = !!advTgl.checked;
      withActiveTab((tabId) => { try { chrome.tabs.sendMessage(tabId, { __ofCmd: "adv_overlay_toggle", enabled }); } catch {} });
    });
  }

  // Emoji spam controls
  function sendEmojiCommand(tabId, cmd, payload) {
    try { chrome.tabs.sendMessage(tabId, { __ofCmd: cmd, payload }); } catch {}
  }

  const startEmoji = document.getElementById("start-emoji");
  if (startEmoji) {
    startEmoji.addEventListener("click", () => {
      const target = (document.getElementById("emoji-target")?.value || "").trim() || "AllPlayers";
      const emojiIndex = Number((document.getElementById("emoji-index")?.value || "0").trim());
      const intervalMs = Number((document.getElementById("emoji-interval")?.value || "1000").trim());
      const payload = { target, emojiIndex, intervalMs };
      saveEmojiState(payload);
      withActiveTab((tabId) => sendEmojiCommand(tabId, "emoji_spam_start", payload));
    });
  }

  const stopEmoji = document.getElementById("stop-emoji");
  if (stopEmoji) {
    stopEmoji.addEventListener("click", () => {
      withActiveTab((tabId) => sendEmojiCommand(tabId, "emoji_spam_stop"));
    });
  }

  // SAM overlay toggle
  const samTgl = document.getElementById("toggle-sam");
  if (samTgl) {
    try {
      chrome.storage.local.get("of_sam_enabled").then((res) => {
        samTgl.checked = !!res?.of_sam_enabled;
      }).catch(() => {});
    } catch {}
    samTgl.addEventListener("change", () => {
      const enabled = !!samTgl.checked;
      try { chrome.storage.local.set({ of_sam_enabled: enabled }); } catch {}
      withActiveTab((tabId) => { try { chrome.tabs.sendMessage(tabId, { __ofCmd: "sam_overlay_toggle", enabled }); } catch {} });
    });
  }

  // SAM log toggle
  const samLogTgl = document.getElementById("toggle-sam-log");
  if (samLogTgl) {
    samLogTgl.addEventListener("change", () => {
      const enabled = !!samLogTgl.checked;
      withActiveTab((tabId) => { try { chrome.tabs.sendMessage(tabId, { __ofCmd: "sam_log_toggle", enabled }); } catch {} });
    });
  }

  // Auto-Send log toggle
  const asLogTgl = document.getElementById("toggle-as-log");
  if (asLogTgl) {
    asLogTgl.addEventListener("change", () => {
      const enabled = !!asLogTgl.checked;
      withActiveTab((tabId) => { try { chrome.tabs.sendMessage(tabId, { __ofCmd: "as_log_toggle", enabled }); } catch {} });
    });
  }

  // Embargo All button
  const embargoAllBtn = document.getElementById("embargo-all");
  if (embargoAllBtn) {
    embargoAllBtn.addEventListener("click", () => {
      withActiveTab((tabId) => { try { chrome.tabs.sendMessage(tabId, { __ofCmd: "embargo_all" }); } catch {} });
      // Uncheck all in UI immediately
      try {
        const container = document.getElementById("players-list");
        if (container) {
          container.querySelectorAll("input[type=checkbox]").forEach((cb) => { try { cb.checked = false; } catch {} });
        }
      } catch {}
    });
  }

  // Enable All Trading button
  const unembargoAllBtn = document.getElementById("unembargo-all");
  if (unembargoAllBtn) {
    unembargoAllBtn.addEventListener("click", () => {
      withActiveTab((tabId) => { try { chrome.tabs.sendMessage(tabId, { __ofCmd: "unembargo_all" }); } catch {} });
      // Check all in UI immediately
      try {
        const container = document.getElementById("players-list");
        if (container) {
          container.querySelectorAll("input[type=checkbox]").forEach((cb) => { try { cb.checked = true; } catch {} });
        }
      } catch {}
    });
  }

  // Render players list with checkboxes
  function renderPlayersList(players) {
    try {
      const container = document.getElementById("players-list");
      if (!container) return;
      container.innerHTML = "";
      if (!Array.isArray(players) || players.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "no players";
        container.appendChild(empty);
        return;
      }
      // Sort: allies first
      const sorted = players.slice().sort((a, b) => {
        if (!!a.isAlly === !!b.isAlly) return String(a.name).localeCompare(String(b.name));
        return a.isAlly ? -1 : 1;
      });
      for (const p of sorted) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.gap = "8px";
        const label = document.createElement("label");
        label.textContent = String(p.name);
        try {
          label.style.color = p.isAlly ? "#6EE16E" : "#ffffff";
          if (p.isAlly) label.style.fontWeight = "700"; else label.style.fontWeight = "600";
        } catch {}
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!p.trading;
        cb.addEventListener("change", () => {
          withActiveTab((tabId) => {
            try {
              const action = cb.checked ? "stop" : "start"; // checked means enable trade => stop embargo
              chrome.tabs.sendMessage(tabId, { __ofCmd: "embargo_toggle", payload: { id: p.id, action } });
            } catch {}
          });
        });
        row.appendChild(label);
        row.appendChild(cb);
        container.appendChild(row);
      }
    } catch {}
  }

  // Listen to player list updates from storage and render
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.of_players_list) {
        renderPlayersList(changes.of_players_list.newValue || []);
      }
    });
    chrome.storage?.local?.get(["of_players_list"]).then((res) => {
      renderPlayersList(res?.of_players_list || []);
    }).catch(() => {});
  } catch {}

  // ========== KEYBOARD SHORTCUTS CUSTOMIZATION ==========
  const DEFAULT_KEYBINDS = {
    sam: "Ctrl+Shift+KeyF",
    atom: "Alt+KeyA",
    hydrogen: "Alt+KeyH",
    captureTarget: "Alt+KeyM",
    scopeFeeder: "Alt+KeyF",
    alliances: "Alt+KeyT",
    embargoAll: "Alt+KeyE"
  };

  let currentKeybinds = { ...DEFAULT_KEYBINDS };
  let capturingKey = null; // Which keybind is currently being captured

  // Load saved keybinds and update button labels
  function loadKeybinds() {
    try {
      chrome.storage?.local?.get(["of_keybinds"], (result) => {
        if (result && result.of_keybinds) {
          currentKeybinds = { ...DEFAULT_KEYBINDS, ...result.of_keybinds };
        }
        updateKeybindButtons();
      });
    } catch (e) {
      log('Failed to load keybinds:', e);
    }
  }

  // Update button labels to show current keybinds
  function updateKeybindButtons() {
    Object.keys(currentKeybinds).forEach(key => {
      const btn = document.getElementById(`keybind-${key}`);
      if (btn) {
        btn.textContent = formatKeybind(currentKeybinds[key]);
      }
    });
  }

  // Format keybind string for display (e.g., "Ctrl+Shift+KeyF" -> "Ctrl+Shift+F")
  function formatKeybind(keybindStr) {
    return keybindStr.replace(/Key([A-Z])/g, '$1')
                     .replace(/Digit(\d)/g, '$1')
                     .replace(/Numpad(\w+)/g, 'Num$1');
  }

  // Convert key event to normalized string
  function keyEventToString(ev) {
    const parts = [];
    if (ev.ctrlKey) parts.push('Ctrl');
    if (ev.altKey) parts.push('Alt');
    if (ev.shiftKey) parts.push('Shift');
    if (ev.metaKey) parts.push('Meta');
    parts.push(ev.code);
    return parts.join('+');
  }

  // Save keybinds to storage
  function saveKeybinds() {
    try {
      chrome.storage?.local?.set({ of_keybinds: currentKeybinds }, () => {
        showKeybindStatus('Saved!', 2000);
        log('Keybinds saved:', currentKeybinds);
      });
    } catch (e) {
      showKeybindStatus('Error saving', 2000);
      log('Failed to save keybinds:', e);
    }
  }

  // Show status message
  function showKeybindStatus(message, duration = 2000) {
    const statusEl = document.getElementById('keybind-status');
    if (statusEl) {
      statusEl.textContent = message;
      setTimeout(() => { statusEl.textContent = ''; }, duration);
    }
  }

  // Check if keybind is already in use
  function isKeybindInUse(keybindStr, excludeKey) {
    for (const [key, value] of Object.entries(currentKeybinds)) {
      if (key !== excludeKey && value === keybindStr) {
        return key;
      }
    }
    return null;
  }

  // Set up keybind capture buttons
  Object.keys(DEFAULT_KEYBINDS).forEach(key => {
    const btn = document.getElementById(`keybind-${key}`);
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (capturingKey) {
        // Cancel previous capture
        const prevBtn = document.getElementById(`keybind-${capturingKey}`);
        if (prevBtn) {
          prevBtn.textContent = formatKeybind(currentKeybinds[capturingKey]);
          prevBtn.style.background = '';
        }
      }

      capturingKey = key;
      btn.textContent = 'Press key...';
      btn.style.background = '#FF6B6B';
      showKeybindStatus('Press your desired key combination');
    });
  });

  // Modifier-only keys that should be ignored
  const MODIFIER_KEYS = new Set([
    'AltLeft', 'AltRight',
    'ControlLeft', 'ControlRight',
    'ShiftLeft', 'ShiftRight',
    'MetaLeft', 'MetaRight'
  ]);

  // Check if event has at least one modifier
  function hasModifier(ev) {
    return ev.ctrlKey || ev.altKey || ev.shiftKey || ev.metaKey;
  }

  // Global keydown listener for capturing keys
  document.addEventListener('keydown', (ev) => {
    if (!capturingKey) return;

    // Allow Escape to cancel capture
    if (ev.key === 'Escape' || ev.code === 'Escape') {
      const btn = document.getElementById(`keybind-${capturingKey}`);
      if (btn) {
        btn.textContent = formatKeybind(currentKeybinds[capturingKey]);
        btn.style.background = '';
      }
      capturingKey = null;
      showKeybindStatus('Cancelled', 1000);
      return;
    }

    // Ignore modifier-only keys (e.g., pressing just Alt, Ctrl, Shift)
    if (MODIFIER_KEYS.has(ev.code)) {
      return; // Keep waiting for a real key
    }

    ev.preventDefault();
    ev.stopPropagation();

    const btn = document.getElementById(`keybind-${capturingKey}`);

    // Require at least one modifier for safety (prevents breaking game controls)
    if (!hasModifier(ev)) {
      showKeybindStatus('Please use Ctrl/Alt/Shift + key', 2500);
      return; // Don't cancel capture, let them try again
    }

    const newKeybind = keyEventToString(ev);

    // Check if this keybind is already in use
    const inUseBy = isKeybindInUse(newKeybind, capturingKey);
    if (inUseBy) {
      showKeybindStatus(`Already used by ${inUseBy}!`, 3000);
      if (btn) {
        btn.textContent = formatKeybind(currentKeybinds[capturingKey]);
        btn.style.background = '';
      }
      capturingKey = null;
      return;
    }

    // Update keybind
    currentKeybinds[capturingKey] = newKeybind;
    if (btn) {
      btn.textContent = formatKeybind(newKeybind);
      btn.style.background = '';
    }

    saveKeybinds();
    capturingKey = null;
  });

  // Reset to defaults button
  const resetBtn = document.getElementById('reset-keybinds');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentKeybinds = { ...DEFAULT_KEYBINDS };
      updateKeybindButtons();
      saveKeybinds();
      showKeybindStatus('Reset to defaults', 2000);
    });
  }

  // Load keybinds on popup open
  loadKeybinds();
  // ========== END KEYBOARD SHORTCUTS CUSTOMIZATION ==========
})();


