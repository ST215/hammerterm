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

  // ========== STATUS HELPERS ==========
  function setTroopStatus(text) {
    const el = document.getElementById("troop-status");
    if (el) el.textContent = text;
  }

  function setGoldStatus(text) {
    const el = document.getElementById("gold-status");
    if (el) el.textContent = text;
  }

  // ========== PLAYER LIST STATE ==========
  let allPlayers = [];
  let currentPage = 0;
  const PLAYERS_PER_PAGE = 9; // 3x3 grid
  let selectedPlayer = null; // { id, name, smallID }

  // ========== FEEDER STATE ==========
  let feederState = {
    selectedTarget: null,
    troopRatio: 20,
    troopThreshold: 50,
    goldRatio: 20,
    goldThreshold: 1000,
    goldRate: 2000,
    troopRunning: false,
    goldRunning: false
  };

  // Save feeder state
  function saveFeederState() {
    chrome.storage.local.set({ of_feeder_state: feederState });
  }

  // Load feeder state
  function loadFeederState() {
    chrome.storage.local.get(['of_feeder_state'], (result) => {
      if (result.of_feeder_state) {
        feederState = { ...feederState, ...result.of_feeder_state };
        updateFeederInputs();
        if (feederState.selectedTarget) {
          selectedPlayer = feederState.selectedTarget;
          updateSelectedPlayerDisplay();
        }
      }
    });
  }

  // Update inputs from state
  function updateFeederInputs() {
    const troopRatio = document.getElementById('troop-ratio');
    const troopThreshold = document.getElementById('troop-threshold');
    const goldRatio = document.getElementById('gold-ratio');
    const goldThreshold = document.getElementById('gold-threshold');
    const goldRate = document.getElementById('gold-rate');

    if (troopRatio) troopRatio.value = feederState.troopRatio;
    if (troopThreshold) troopThreshold.value = feederState.troopThreshold;
    if (goldRatio) goldRatio.value = feederState.goldRatio;
    if (goldThreshold) goldThreshold.value = feederState.goldThreshold;
    if (goldRate) goldRate.value = feederState.goldRate;
  }

  // Persist inputs on change
  function setupInputListeners() {
    const inputs = ['troop-ratio', 'troop-threshold', 'gold-ratio', 'gold-threshold', 'gold-rate'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const key = id.replace('-', '').replace('troop', 'troop').replace('gold', 'gold');
        // Map to state keys
        if (id === 'troop-ratio') feederState.troopRatio = Math.max(1, Math.min(100, Number(el.value) || 20));
        if (id === 'troop-threshold') feederState.troopThreshold = Math.max(1, Math.min(100, Number(el.value) || 50));
        if (id === 'gold-ratio') feederState.goldRatio = Math.max(1, Math.min(100, Number(el.value) || 20));
        if (id === 'gold-threshold') feederState.goldThreshold = Math.max(100, Number(el.value) || 1000);
        if (id === 'gold-rate') feederState.goldRate = Math.max(500, Number(el.value) || 2000);
        saveFeederState();
      });
    });
  }

  // ========== PLAYER GRID RENDERING ==========
  function renderPlayerGrid() {
    const grid = document.getElementById('player-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (allPlayers.length === 0) {
      grid.innerHTML = '<div style="grid-column: span 3; text-align: center; opacity: 0.6; font-size: 11px;">No players available</div>';
      updatePagination();
      return;
    }

    const totalPages = Math.ceil(allPlayers.length / PLAYERS_PER_PAGE);
    currentPage = Math.min(currentPage, totalPages - 1);
    const start = currentPage * PLAYERS_PER_PAGE;
    const end = Math.min(start + PLAYERS_PER_PAGE, allPlayers.length);
    const pageItems = allPlayers.slice(start, end);

    pageItems.forEach(player => {
      const btn = document.createElement('button');
      btn.className = 'player-btn';
      btn.textContent = player.name || `#${player.smallID}`;
      btn.title = `${player.name} (ID: ${player.smallID})`;

      if (player.isAlly) {
        btn.classList.add('ally');
      }

      if (selectedPlayer && selectedPlayer.id === player.id) {
        btn.classList.add('selected');
      }

      btn.addEventListener('click', () => {
        selectedPlayer = player;
        feederState.selectedTarget = player;
        saveFeederState();
        renderPlayerGrid();
        updateSelectedPlayerDisplay();
      });

      grid.appendChild(btn);
    });

    updatePagination();
  }

  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(allPlayers.length / PLAYERS_PER_PAGE));
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');

    if (pageInfo) {
      pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    }

    if (prevBtn) {
      prevBtn.disabled = currentPage === 0;
    }

    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages - 1;
    }
  }

  function updateSelectedPlayerDisplay() {
    const el = document.getElementById('selected-player');
    if (el) {
      el.textContent = selectedPlayer ? (selectedPlayer.name || `#${selectedPlayer.smallID}`) : 'None';
    }
  }

  // Pagination buttons
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--;
        renderPlayerGrid();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(allPlayers.length / PLAYERS_PER_PAGE);
      if (currentPage < totalPages - 1) {
        currentPage++;
        renderPlayerGrid();
      }
    });
  }

  // ========== PLAYER LIST UPDATES ==========
  // Listen for player list updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.of_players_list) {
      const players = changes.of_players_list.newValue || [];
      // Sort: allies first, then by name
      allPlayers = players.slice().sort((a, b) => {
        if (!!a.isAlly !== !!b.isAlly) return a.isAlly ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      renderPlayerGrid();
    }

    // Update troop status from storage
    if (changes.of_troop_status) {
      setTroopStatus(changes.of_troop_status.newValue || 'Waiting...');
    }

    // Update gold status from storage
    if (changes.of_gold_status) {
      setGoldStatus(changes.of_gold_status.newValue || 'Waiting...');
    }
  });

  // Load initial player list
  chrome.storage.local.get(['of_players_list', 'of_troop_status', 'of_gold_status'], (result) => {
    if (result.of_players_list) {
      allPlayers = result.of_players_list.slice().sort((a, b) => {
        if (!!a.isAlly !== !!b.isAlly) return a.isAlly ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      renderPlayerGrid();
    }
    if (result.of_troop_status) {
      setTroopStatus(result.of_troop_status);
    }
    if (result.of_gold_status) {
      setGoldStatus(result.of_gold_status);
    }
  });

  // ========== TROOP FEEDER CONTROLS ==========
  const troopStartBtn = document.getElementById('troop-start');
  const troopStopBtn = document.getElementById('troop-stop');

  if (troopStartBtn) {
    troopStartBtn.addEventListener('click', () => {
      if (!selectedPlayer) {
        setTroopStatus('Select a player first!');
        return;
      }

      const ratio = Math.max(1, Math.min(100, Number(document.getElementById('troop-ratio')?.value) || 20));
      const threshold = Math.max(1, Math.min(100, Number(document.getElementById('troop-threshold')?.value) || 50));

      feederState.troopRatio = ratio;
      feederState.troopThreshold = threshold;
      feederState.troopRunning = true;
      saveFeederState();

      const payload = {
        target: selectedPlayer.name || selectedPlayer.id,
        targetId: selectedPlayer.id,
        ratio,
        threshold
      };

      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'troop_feeder_start', payload });
      });

      setTroopStatus('Starting...');
    });
  }

  if (troopStopBtn) {
    troopStopBtn.addEventListener('click', () => {
      feederState.troopRunning = false;
      saveFeederState();

      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'troop_feeder_stop' });
      });

      setTroopStatus('Stopped');
    });
  }

  // ========== GOLD FEEDER CONTROLS ==========
  const goldStartBtn = document.getElementById('gold-start');
  const goldStopBtn = document.getElementById('gold-stop');

  if (goldStartBtn) {
    goldStartBtn.addEventListener('click', () => {
      if (!selectedPlayer) {
        setGoldStatus('Select a player first!');
        return;
      }

      const ratio = Math.max(1, Math.min(100, Number(document.getElementById('gold-ratio')?.value) || 20));
      const threshold = Math.max(100, Number(document.getElementById('gold-threshold')?.value) || 1000);
      const rate = Math.max(500, Number(document.getElementById('gold-rate')?.value) || 2000);

      feederState.goldRatio = ratio;
      feederState.goldThreshold = threshold;
      feederState.goldRate = rate;
      feederState.goldRunning = true;
      saveFeederState();

      const payload = {
        target: selectedPlayer.name || selectedPlayer.id,
        targetId: selectedPlayer.id,
        ratio,
        threshold,
        rate
      };

      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'gold_feeder_start', payload });
      });

      setGoldStatus('Starting...');
    });
  }

  if (goldStopBtn) {
    goldStopBtn.addEventListener('click', () => {
      feederState.goldRunning = false;
      saveFeederState();

      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'gold_feeder_stop' });
      });

      setGoldStatus('Stopped');
    });
  }

  // ========== TOGGLE SWITCHES ==========
  // Gold display toggle
  const displayTgl = document.getElementById("toggle-display");
  if (displayTgl) {
    chrome.storage.local.get("of_overlay_enabled", (res) => {
      displayTgl.checked = !!res?.of_overlay_enabled;
    });
    displayTgl.addEventListener("change", () => {
      const enabled = !!displayTgl.checked;
      chrome.storage.local.set({ of_overlay_enabled: enabled });
      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: "overlay_toggle", enabled });
      });
    });
  }

  // Advanced overlay toggle
  const advTgl = document.getElementById("toggle-adv");
  if (advTgl) {
    advTgl.addEventListener("change", () => {
      const enabled = !!advTgl.checked;
      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: "adv_overlay_toggle", enabled });
      });
    });
  }

  // Feeder log toggle
  const asLogTgl = document.getElementById("toggle-as-log");
  if (asLogTgl) {
    asLogTgl.addEventListener("change", () => {
      const enabled = !!asLogTgl.checked;
      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: "feeder_log_toggle", enabled });
      });
    });
  }

  // ========== KEYBOARD SHORTCUTS ==========
  const DEFAULT_KEYBINDS = {
    atom: "Alt+KeyA",
    hydrogen: "Alt+KeyH",
    captureTarget: "Alt+KeyM",
    alliances: "Alt+KeyT",
    troopFeeder: "Alt+KeyF",
    goldFeeder: "Alt+KeyG"
  };

  let currentKeybinds = { ...DEFAULT_KEYBINDS };
  let capturingKey = null;

  function loadKeybinds() {
    chrome.storage.local.get(['of_keybinds'], (result) => {
      if (result && result.of_keybinds) {
        // Filter out old keybinds that no longer exist
        const validKeys = Object.keys(DEFAULT_KEYBINDS);
        const filtered = {};
        for (const key of validKeys) {
          filtered[key] = result.of_keybinds[key] || DEFAULT_KEYBINDS[key];
        }
        currentKeybinds = filtered;
      }
      updateKeybindButtons();
    });
  }

  function updateKeybindButtons() {
    Object.keys(currentKeybinds).forEach(key => {
      const btn = document.getElementById(`keybind-${key}`);
      if (btn) {
        btn.textContent = formatKeybind(currentKeybinds[key]);
      }
    });
  }

  function formatKeybind(keybindStr) {
    return keybindStr.replace(/Key([A-Z])/g, '$1')
                     .replace(/Digit(\d)/g, '$1')
                     .replace(/Numpad(\w+)/g, 'Num$1');
  }

  function keyEventToString(ev) {
    const parts = [];
    if (ev.ctrlKey) parts.push('Ctrl');
    if (ev.altKey) parts.push('Alt');
    if (ev.shiftKey) parts.push('Shift');
    if (ev.metaKey) parts.push('Meta');
    parts.push(ev.code);
    return parts.join('+');
  }

  function saveKeybinds() {
    chrome.storage.local.set({ of_keybinds: currentKeybinds }, () => {
      showKeybindStatus('Saved!', 2000);
    });
  }

  function showKeybindStatus(message, duration = 2000) {
    const statusEl = document.getElementById('keybind-status');
    if (statusEl) {
      statusEl.textContent = message;
      setTimeout(() => { statusEl.textContent = ''; }, duration);
    }
  }

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

  const MODIFIER_KEYS = new Set([
    'AltLeft', 'AltRight',
    'ControlLeft', 'ControlRight',
    'ShiftLeft', 'ShiftRight',
    'MetaLeft', 'MetaRight'
  ]);

  function hasModifier(ev) {
    return ev.ctrlKey || ev.altKey || ev.shiftKey || ev.metaKey;
  }

  document.addEventListener('keydown', (ev) => {
    if (!capturingKey) return;

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

    if (MODIFIER_KEYS.has(ev.code)) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const btn = document.getElementById(`keybind-${capturingKey}`);

    if (!hasModifier(ev)) {
      showKeybindStatus('Please use Ctrl/Alt/Shift + key', 2500);
      return;
    }

    const newKeybind = keyEventToString(ev);

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

    currentKeybinds[capturingKey] = newKeybind;
    if (btn) {
      btn.textContent = formatKeybind(newKeybind);
      btn.style.background = '';
    }

    saveKeybinds();
    capturingKey = null;
  });

  const resetBtn = document.getElementById('reset-keybinds');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentKeybinds = { ...DEFAULT_KEYBINDS };
      updateKeybindButtons();
      saveKeybinds();
      showKeybindStatus('Reset to defaults', 2000);
    });
  }

  loadKeybinds();

  // ========== DEBUG LOGS ==========
  function showLogStatus(message, duration = 2000) {
    const statusEl = document.getElementById('log-status');
    if (statusEl) {
      statusEl.textContent = message;
      setTimeout(() => { statusEl.textContent = ''; }, duration);
    }
  }

  function updateLogPreview() {
    withActiveTab(tabId => {
      chrome.tabs.sendMessage(tabId, { __ofCmd: 'get_recent_logs' }, (response) => {
        const previewEl = document.getElementById('log-preview');
        if (!previewEl) return;

        if (chrome.runtime.lastError || !response || !response.logs) {
          previewEl.textContent = 'No logs available';
          return;
        }

        const logs = response.logs;
        if (logs.length === 0) {
          previewEl.textContent = '(empty)';
          return;
        }

        previewEl.textContent = logs.map(log => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          const args = Array.isArray(log.args) ?
            log.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') :
            String(log.args || '');
          return `[${time}] ${log.level.toUpperCase()}: ${args.substring(0, 100)}`;
        }).join('\n');
      });
    });
  }

  const copyAllBtn = document.getElementById('copy-all-logs');
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', () => {
      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'export_logs', payload: { limit: 100 } }, (response) => {
          if (chrome.runtime.lastError || !response || !response.logs) {
            showLogStatus('Error: Could not retrieve logs', 3000);
            return;
          }

          navigator.clipboard.writeText(response.logs).then(() => {
            showLogStatus('All logs copied!', 2500);
          }).catch(() => {
            showLogStatus('Copy failed', 2000);
          });
        });
      });
    });
  }

  const copyErrorsBtn = document.getElementById('copy-errors');
  if (copyErrorsBtn) {
    copyErrorsBtn.addEventListener('click', () => {
      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'export_errors' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.logs) {
            showLogStatus('Error: Could not retrieve errors', 3000);
            return;
          }

          navigator.clipboard.writeText(response.logs).then(() => {
            showLogStatus('Errors copied!', 2500);
          }).catch(() => {
            showLogStatus('Copy failed', 2000);
          });
        });
      });
    });
  }

  const clearLogsBtn = document.getElementById('clear-logs');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      withActiveTab(tabId => {
        chrome.tabs.sendMessage(tabId, { __ofCmd: 'clear_logs' }, () => {
          showLogStatus('Logs cleared', 1500);
          updateLogPreview();
        });
      });
    });
  }

  const logLevelSelect = document.getElementById('log-level');
  if (logLevelSelect) {
    chrome.storage.local.get(['of_log_level'], (result) => {
      const level = result.of_log_level !== undefined ? result.of_log_level : 1;
      logLevelSelect.value = String(level);
    });

    logLevelSelect.addEventListener('change', () => {
      const newLevel = parseInt(logLevelSelect.value, 10);
      chrome.storage.local.set({ of_log_level: newLevel }, () => {
        showLogStatus(`Log level: ${logLevelSelect.options[logLevelSelect.selectedIndex].text}`, 2000);
        withActiveTab(tabId => {
          chrome.tabs.sendMessage(tabId, { __ofCmd: 'set_log_level', payload: { level: newLevel } });
        });
      });
    });
  }

  // ========== INITIALIZATION ==========
  setupInputListeners();
  loadFeederState();
  updateLogPreview();
  setInterval(updateLogPreview, 2000);
})();
