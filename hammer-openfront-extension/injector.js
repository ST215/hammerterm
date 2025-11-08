(function () {
  const DEBUG = true;
  const SAM_DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log("[OF-Ext][injector]", ...args); };
  const slog = (...args) => { if (SAM_DEBUG) console.log("[OF-Ext][SAM]", ...args); };
  if (window.__ofGoldTapInstalled) return;
  window.__ofGoldTapInstalled = true;

  // Minimal constants to index into updates
  const GameUpdateType = {
    Tile: 0,
    Unit: 1,
    Player: 2,
    DisplayEvent: 3,
    DisplayChatEvent: 4,
    AllianceRequest: 5,
    AllianceRequestReply: 6,
    BrokeAlliance: 7,
    AllianceExpired: 8,
    AllianceExtension: 9,
    TargetPlayer: 10,
    Emoji: 11,
    Win: 12,
    Hash: 13,
    UnitIncoming: 14,
    BonusEvent: 15,
    RailroadEvent: 16,
    ConquestEvent: 17,
    EmbargoEvent: 18,
  };

  let currentClientID = null;
  try {
    const cid = localStorage.getItem("client_id");
    if (cid && typeof cid === "string") currentClientID = cid;
  } catch {}

  // --- DISABLED: Old Alt+T keyboard listener (now handled by unified keyboard handler) ---
  // try {
  //   window.addEventListener('keydown', (ev) => {
  //     try {
  //       const tag = (ev.target && ev.target.tagName || '').toLowerCase();
  //       if (tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable)) return;
  //     } catch {}
  //     try {
  //       const isAltT = ev.altKey && (ev.key?.toLowerCase() === 't' || ev.code === 'KeyT');
  //       if (!isAltT) return;
  //       try { console.log('[OF-Ext][Alliances] Alt+T detected', { alliancesOverlayEnabled }); } catch {}
  //       ev.preventDefault();
  //       ev.stopPropagation();
  //       const next = !alliancesOverlayEnabled;
  //       alliancesOverlayEnabled = next;
  //       if (next) { ensureAlliancesOverlay(); renderAlliancesOverlay(); startAlliancesLoop(); }
  //       else { hideAlliancesOverlay(); stopAlliancesLoop(); }
  //       try { chrome?.storage?.local?.set({ of_alliances_enabled: next }); } catch {}
  //     } catch {}
  //   }, true);
  // } catch {}

  // --- DISABLED: Old Alt+E keyboard listener (now handled by unified keyboard handler) ---
  // try {
  //   window.addEventListener('keydown', (ev) => {
  //     try {
  //       const tag = (ev.target && ev.target.tagName || '').toLowerCase();
  //       if (tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable)) return;
  //     } catch {}
  //     try {
  //       const isAltE = ev.altKey && (ev.key?.toLowerCase() === 'e' || ev.code === 'KeyE');
  //       if (!isAltE) return;
  //       ev.preventDefault();
  //       ev.stopPropagation();
  //       try { console.log('[OF-Ext][Trade] Alt+E embargo all'); } catch {}
  //       embargoAllPlayers();
  //     } catch {}
  //   }, true);
  // } catch {}

  const OriginalWorker = window.Worker;
  log("installing Worker wrapper");

  // Simple gold history for rate calculation
  const goldHistory = [];
  const MAX_AGE_MS = 2 * 60 * 1000; // keep last 2 minutes of samples
  let lastDispatch = 0;
  const TICK_MS = 100; // game tick duration approximation

  // Emoji spam state
  let gameSocket = null;
  let spamTimer = null;
  // Auto-Send Troops state
  let asTimer = null;
  let asRunning = false;
  let asTarget = null; // string id or name; resolved each loop
  let asAttackRatioPct = 20;
  let asThresholdPct = 50; // percent of max troops
  let asLastSend = {}; // key: resolved target id (smallID or PlayerID), value: ms
  let asCooldownMs = 10000; // match game donateCooldown: 10s (100 ticks * 100ms)
  // Auto-Send Log UI
  let asLogEnabled = false;
  let asLogEl = null;
  let asLogBody = null;
  const AS_MAX_LOG = 300;
  let asLastUiLogMs = 0;
  // Small overlay to indicate Scope Feeder status
  let sfOverlayEl = null;
  let asLastChosenId = null;
  let asLastChosenName = "";
  const asToggleCooldownMs = 350;
  let asLastToggleMs = 0;
  let lastMouseClient = { x: 0, y: 0 };

  function asSetStatus(text) {
    try { window.postMessage({ __ofTap: true, kind: "as_status", text }, "*"); } catch {}
  }

  function ensureAsLog() {
    if (!asLogEnabled) return;
    try {
      if (asLogEl) return;
      const el = document.createElement("div");
      el.id = "of-as-log";
      Object.assign(el.style, {
        position: "fixed",
        zIndex: 2147483647,
        right: "12px",
        top: "50%",
        transform: "translateY(-50%)",
        width: "360px",
        maxHeight: "60vh",
        background: "rgba(0,0,0,0.8)",
        color: "#cff",
        font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        border: "1px solid rgba(0,200,255,0.35)",
        borderRadius: "8px",
        boxShadow: "0 6px 18px rgba(0,0,0,.45)",
        overflow: "hidden",
      });
      const header = document.createElement("div");
      header.textContent = "Auto-Send Log";
      Object.assign(header.style, {
        padding: "6px 8px",
        background: "rgba(0,200,255,0.12)",
        borderBottom: "1px solid rgba(0,200,255,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      });
      const btns = document.createElement("div");
      const clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.onclick = () => { if (asLogBody) asLogBody.textContent = ""; };
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.style.marginLeft = "6px";
      closeBtn.onclick = () => { try { el.remove(); } catch {} asLogEl = null; asLogBody = null; asLogEnabled = false; };
      for (const b of [clearBtn, closeBtn]) {
        Object.assign(b.style, {
          background: "rgba(0,200,255,0.12)",
          color: "#cff",
          border: "1px solid rgba(0,200,255,0.35)",
          borderRadius: "6px",
          font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "2px 6px",
          cursor: "pointer",
        });
      }
      btns.appendChild(clearBtn);
      btns.appendChild(closeBtn);
      header.appendChild(btns);
      const body = document.createElement("div");
      asLogBody = body;
      Object.assign(body.style, {
        padding: "8px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: "calc(60vh - 34px)",
      });
      el.appendChild(header);
      el.appendChild(body);
      document.documentElement.appendChild(el);
      asLogEl = el;
    } catch {}
  }

  function asLog(line) {
    if (!asLogEnabled) return;
    ensureAsLog();
    try {
      const div = document.createElement("div");
      const ts = new Date().toLocaleTimeString();
      div.textContent = `[${ts}] ${line}`;
      asLogBody?.appendChild(div);
      if (asLogBody) asLogBody.scrollTop = asLogBody.scrollHeight;
      // Trim
      if (asLogBody && asLogBody.childNodes.length > AS_MAX_LOG) {
        asLogBody.removeChild(asLogBody.firstChild);
      }
    } catch {}
  }

  function readCurrentTroops() {
    try {
      const me = lastPlayers?.find((p) => p.clientID === currentClientID) || null;
      return me?.troops ?? 0;
    } catch { return 0; }
  }

  function readMyPlayer() {
    try {
      let me = null;
      if (currentClientID) me = lastPlayers?.find((p) => p.clientID === currentClientID) || null;
      if (!me && mySmallID != null) me = lastPlayers?.find((p) => p.smallID === mySmallID) || null;
      return me;
    } catch { return null; }
  }

  function readMaxTroopsEstimate() {
    try {
      const me = readMyPlayer();
      if (!me) return 0;
      return estimateMaxTroops(me.tilesOwned, me.smallID);
    } catch { return 0; }
  }

  function readCurrentAttackRatio() {
    try {
      const v = localStorage.getItem("settings.attackRatio");
      return v ? Number(v) : 0.2;
    } catch { return 0.2; }
  }

  function writeAttackRatio(ratio) {
    try { localStorage.setItem("settings.attackRatio", String(ratio)); } catch {}
  }

  function asResolveTargetIds(targetStr) {
    // Returns array of player IDs to consider
    if (!targetStr) return [];
    try {
      if (String(targetStr).toLowerCase() === "allplayers") {
        const ids = [];
        for (const [, p] of playersById.entries()) {
          if (!p) continue;
          if (p.id && p.smallID !== mySmallID && asIsAllyOrTeammate(p.id)) ids.push(p.id);
        }
        return ids;
      }
      if (/^\d+$/.test(targetStr)) {
        const p = playersBySmallId.get(Number(targetStr));
        return p && p.id ? [p.id] : [];
      }
      if (playersById.has(targetStr)) return [targetStr];
      const p = playersByName.get(String(targetStr).toLowerCase());
      return p && p.id ? [p.id] : [];
    } catch { return []; }
  }

  function asSendDonateTroops(targetId, troopsAmount /* number|null */) {
    try {
      if (!gameSocket) { try { console.log('[OF-Ext][AS] send: no gameSocket'); } catch {} return false; }
      if (gameSocket.readyState !== 1) { try { console.log('[OF-Ext][AS] send: socket not OPEN', { readyState: gameSocket.readyState }); } catch {} return false; }
      if (!currentClientID) { try { console.log('[OF-Ext][AS] send: missing currentClientID'); } catch {} return false; }
    } catch {}
    const intent = {
      type: "donate_troops",
      clientID: currentClientID,
      recipient: targetId,
      troops: troopsAmount == null ? null : Number(troopsAmount),
    };
    try {
      const payload = { type: "intent", intent };
      try { console.log('[OF-Ext][AS] sending donate', payload); } catch {}
      gameSocket.send(JSON.stringify(payload));
      return true;
    } catch { return false; }
  }

  // (removed) sendBreakAllianceIntent

  // Attempt to send an embargo/stop-trade intent for a specific player
  function sendEmbargoIntent(recipientId, action /* 'start'|'stop' */ = "start") {
    try {
      if (!gameSocket || gameSocket.readyState !== 1) { try { console.warn('[OF-Ext][Trade] no open socket'); } catch {} return false; }
      if (!currentClientID) { try { console.warn('[OF-Ext][Trade] missing clientID'); } catch {} return false; }
      const intent = {
        type: "embargo",
        clientID: currentClientID,
        targetID: recipientId,
        action: action === 'stop' ? 'stop' : 'start',
      };
      const payload = { type: "intent", intent };
      try { console.log('[OF-Ext][Trade] sending embargo intent', payload); } catch {}
      gameSocket.send(JSON.stringify(payload));
      return true;
    } catch { return false; }
  }

  function embargoAllPlayers() {
    try {
      const me = readMyPlayer();
      const myId = me?.id;
      let count = 0;
      for (const [, p] of playersById.entries()) {
        try {
          if (!p) continue;
          const targetId = p.id;
          if (!targetId) continue;
          if (myId && targetId === myId) continue; // skip self
          if (sendEmbargoIntent(targetId, 'start')) count++;
        } catch {}
      }
      try { console.log('[OF-Ext][Trade] embargo all attempted', { count }); } catch {}
      try { window.postMessage({ __ofTap: true, kind: "as_status", text: `Embargo sent to ${count} players` }, "*"); } catch {}
    } catch {}
  }

  function asIsAllyOrTeammate(targetId) {
    try {
      const p = playersById.get(targetId);
      if (!p) return false;
      const small = p.smallID;
      if (small != null && myAllies && typeof myAllies.has === "function" && myAllies.has(small)) return true;
      if (myTeam != null && p.team != null && myTeam === p.team) return true;
      return false;
    } catch { return false; }
  }

  function asTick() {
    if (!asRunning) return;
    try {
      const now = Date.now();
      const candidateIds = asResolveTargetIds(asTarget);
      if (!candidateIds.length) { asSetStatus("Invalid target"); return; }

      // Pick the first eligible ally whose cooldown has elapsed
      let chosenId = null;
      for (const id of candidateIds) {
        if (!asIsAllyOrTeammate(id)) continue;
        const last = asLastSend[id] || 0;
        const remaining = last + asCooldownMs - now;
        if (remaining <= 0) { chosenId = id; break; }
      }
      if (!chosenId) {
        // Report per-ally remaining cooldown among considered allies
        let maxRemaining = 0;
        const perAlly = [];
        for (const id of candidateIds) {
          if (!asIsAllyOrTeammate(id)) continue;
          const last = asLastSend[id] || 0;
          const rem = last + asCooldownMs - now;
          if (rem > 0) {
            const sec = Math.ceil(rem / 1000);
            const p = playersById.get(id);
            const name = p ? String(p.displayName || p.name || p.smallID || id) : String(id);
            perAlly.push(`${name} ${sec}s`);
            if (rem > maxRemaining) maxRemaining = rem;
          }
        }
        if (perAlly.length > 0) {
          asSetStatus(`On cooldown ${Math.ceil(maxRemaining/1000)}s`);
          if (now - asLastUiLogMs > 1500) { asLog(`Cooldowns: ${perAlly.join(', ')}`); asLastUiLogMs = now; }
        } else {
          asSetStatus("No eligible ally");
          if (now - asLastUiLogMs > 1500) { asLog("No eligible ally found"); asLastUiLogMs = now; }
        }
        return;
      }

      const troops = readCurrentTroops();
      const maxTroops = readMaxTroopsEstimate();
      if (!maxTroops || maxTroops <= 0) { asSetStatus("Waiting…"); return; }
      const pct = (troops / maxTroops) * 100;
      if (pct < asThresholdPct) {
        asSetStatus("Waiting…");
        if (now - asLastUiLogMs > 1500) { asLog(`Troops ${Math.round(pct)}% < threshold ${asThresholdPct}%`); asLastUiLogMs = now; }
        return;
      }

      // Donate explicit amount = current troops * attack ratio
      const ratio = Math.max(0.01, Math.min(1, asAttackRatioPct / 100));
      const toSend = Math.max(1, Math.floor(troops * ratio));
      try { console.log('[OF-Ext][AS] attempt donate', { chosenId, toSend, troops, ratio, hasSocket: !!gameSocket, readyState: gameSocket?.readyState, hasClient: !!currentClientID }); } catch {}
      try {
        const p = playersById.get(chosenId);
        asLastChosenId = chosenId;
        asLastChosenName = p ? String(p.displayName || p.name || p.smallID || chosenId) : String(chosenId);
        if (asRunning) updateSfOverlay();
      } catch {}
      const ok = asSendDonateTroops(chosenId, toSend);
      if (ok) {
        asLastSend[chosenId] = now;
        try { chrome?.storage?.local?.set({ of_as_lastSend: asLastSend }); } catch {}
        asSetStatus("Donated. Cooldown...");
        asLog(`Donated ${toSend} troops to ${chosenId} (ratio=${asAttackRatioPct}%). Current troops=${troops}`);
      } else {
        asSetStatus("Donate failed");
        asLog(`Donate failed to ${chosenId}`);
      }
    } catch {}
  }

  function asStart(payload) {
    try {
      try { console.log('[OF-Ext][AS] asStart called with payload', payload, { prevRunning: asRunning, hasTimer: !!asTimer }); } catch {}
      asTarget = payload?.target || "";
      asAttackRatioPct = Math.max(1, Math.min(100, Number(payload?.ratio || 20)));
      asThresholdPct = Math.max(1, Math.min(100, Number(payload?.threshold || 50)));
      asLastChosenId = null; asLastChosenName = "";
      asRunning = true;
      if (asTimer) clearInterval(asTimer);
      asTimer = setInterval(asTick, 800);
      try {
        chrome?.storage?.local?.get(["of_as_lastSend"]).then((res)=>{ if (res?.of_as_lastSend) asLastSend = res.of_as_lastSend; }).catch(()=>{});
      } catch {}
      asSetStatus("Running…");
      asLog(`Started Auto-Donate target='${asTarget}' threshold=${asThresholdPct}%`);
      try { ensureSfOverlay(); updateSfOverlay(); } catch {}
    } catch { asSetStatus("Start failed"); }
  }

  function asStop() {
    try { console.log('[OF-Ext][AS] asStop called', { prevRunning: asRunning, hasTimer: !!asTimer }); } catch {}
    asRunning = false;
    if (asTimer) { clearInterval(asTimer); asTimer = null; }
    asSetStatus("Stopped");
    asLog("Stopped Auto-Donate");
    try { hideSfOverlay(); } catch {}
  }
  let lastPlayers = [];
  const playersById = new Map();
  const playersBySmallId = new Map();
  const playersByName = new Map();

  // Current player snapshot for relation checks
  let mySmallID = null;
  let myTeam = null;
  let myAllies = new Set();

  // SAM overlay state
  const SAM_RANGE_TILES = 70;
  let samOverlayEnabled = false;
  let samOverlayCanvas = null;
  let samOverlayCtx = null;
  let targetCanvas = null;
  let currentTransform = { a: 1, d: 1, e: 0, f: 0 };
  const samUnits = new Map(); // id -> { ref }
  let screenCanvasWidth = 0;
  let screenCanvasHeight = 0;
  let worldTilesWidth = 0;
  let worldTilesHeight = 0;

  // City tracking to estimate max troops (mirrors DefaultConfig.maxTroops formula)
  const CITY_TROOP_INCREASE = 250000;
  const cityById = new Map(); // id -> { ownerID: number, level: number }
  const cityLevelSumByOwner = new Map(); // owner smallID -> total city levels
  function addToOwnerSum(ownerID, deltaLevel) {
    if (typeof ownerID !== "number" || !Number.isFinite(ownerID)) return;
    const prev = cityLevelSumByOwner.get(ownerID) || 0;
    cityLevelSumByOwner.set(ownerID, prev + deltaLevel);
  }
  function upsertCity(u) {
    const idKey = String(u.id);
    const newLevel = Number(u.level || 0);
    const newOwner = Number(u.ownerID);
    const prev = cityById.get(idKey);
    if (u.isActive === false) {
      if (prev) {
        addToOwnerSum(prev.ownerID, -prev.level);
        cityById.delete(idKey);
      }
      return;
    }
    if (prev) {
      if (prev.ownerID !== newOwner) {
        addToOwnerSum(prev.ownerID, -prev.level);
        addToOwnerSum(newOwner, newLevel);
        cityById.set(idKey, { ownerID: newOwner, level: newLevel });
      } else if (prev.level !== newLevel) {
        addToOwnerSum(newOwner, newLevel - prev.level);
        cityById.set(idKey, { ownerID: newOwner, level: newLevel });
      }
    } else {
      addToOwnerSum(newOwner, newLevel);
      cityById.set(idKey, { ownerID: newOwner, level: newLevel });
    }
  }
  function estimateMaxTroops(tilesOwned, mySmall) {
    try {
      const tiles = Math.max(0, Number(tilesOwned || 0));
      const base = 2 * (Math.pow(tiles, 0.6) * 1000 + 50000);
      const cityLevels = cityLevelSumByOwner.get(Number(mySmall)) || 0;
      const cityBonus = cityLevels * CITY_TROOP_INCREASE;
      return Math.max(0, Math.floor(base + cityBonus));
    } catch { return 0; }
  }

  // SAM log window state
  let samLogEnabled = false;
  let samLogEl = null;
  let samLogBody = null;
  const samLogLines = [];
  const MAX_SAM_LOG_LINES = 300;

  // Atom bomb overlay state (follows mouse)
  const ATOM_INNER_TILES = 12; // from DefaultConfig.nukeMagnitudes(UnitType.AtomBomb)
  const ATOM_OUTER_TILES = 30;
  const HYDROGEN_INNER_TILES = 80; // from DefaultConfig.nukeMagnitudes(UnitType.HydrogenBomb)
  const HYDROGEN_OUTER_TILES = 100;
  let atomOverlayEnabled = false;
  let atomOverlayCanvas = null;
  let atomOverlayCtx = null;
  let atomMouseWorld = { x: 0, y: 0 };
  let atomMouseScreen = { x: 0, y: 0 };
  let atomRafId = 0;
  let hydrogenOverlayEnabled = false;
  function ensureAtomOverlay() {
    try {
      if (!atomOverlayCanvas) {
        atomOverlayCanvas = document.createElement("canvas");
        atomOverlayCanvas.id = "of-atom-overlay";
        Object.assign(atomOverlayCanvas.style, {
          position: "fixed",
          zIndex: 2147483647,
          pointerEvents: "none",
          top: "0px",
          left: "0px",
        });
        document.documentElement.appendChild(atomOverlayCanvas);
        atomOverlayCtx = atomOverlayCanvas.getContext("2d");
      }
      syncAtomOverlayBounds();
    } catch {}
  }
  function hideAtomOverlay() {
    try { if (atomOverlayCanvas) atomOverlayCanvas.remove(); } catch {}
    atomOverlayCanvas = null; atomOverlayCtx = null;
  }
  function syncAtomOverlayBounds() {
    try {
      if (!atomOverlayCanvas || !targetCanvas) return;
      const r = targetCanvas.getBoundingClientRect();
      atomOverlayCanvas.width = targetCanvas.width;
      atomOverlayCanvas.height = targetCanvas.height;
      atomOverlayCanvas.style.width = `${Math.round(r.width)}px`;
      atomOverlayCanvas.style.height = `${Math.round(r.height)}px`;
      atomOverlayCanvas.style.left = `${Math.round(r.left)}px`;
      atomOverlayCanvas.style.top = `${Math.round(r.top)}px`;
    } catch {}
  }
  function startAtomLoop() {
    if (!(atomOverlayEnabled || hydrogenOverlayEnabled)) return;
    if (atomRafId) return;
    const tick = () => {
      if (!(atomOverlayEnabled || hydrogenOverlayEnabled)) { atomRafId = 0; return; }
      drawAtomOverlay();
      atomRafId = requestAnimationFrame(tick);
    };
    atomRafId = requestAnimationFrame(tick);
  }
  function stopAtomLoop() {
    if (atomRafId) { cancelAnimationFrame(atomRafId); atomRafId = 0; }
  }
  function drawAtomOverlay() {
    try {
      if (!atomOverlayEnabled && !hydrogenOverlayEnabled) return;
      ensureAtomOverlay();
      if (!atomOverlayCtx || !atomOverlayCanvas) return;
      syncAtomOverlayBounds();
      atomOverlayCtx.clearRect(0, 0, atomOverlayCanvas.width, atomOverlayCanvas.height);
      // Draw directly in screen coordinates centered on the cursor
      const scale = Math.max(Math.abs(currentTransform.a || 1), Math.abs(currentTransform.d || 1));
      atomOverlayCtx.lineWidth = 2;
      // Atom
      if (atomOverlayEnabled) {
        const innerPx = ATOM_INNER_TILES * scale;
        const outerPx = ATOM_OUTER_TILES * scale;
        atomOverlayCtx.strokeStyle = "rgba(255, 0, 0, 0.9)";
        atomOverlayCtx.beginPath();
        atomOverlayCtx.arc(atomMouseScreen.x, atomMouseScreen.y, innerPx, 0, Math.PI * 2);
        atomOverlayCtx.stroke();
        atomOverlayCtx.strokeStyle = "rgba(255, 160, 0, 0.9)";
        atomOverlayCtx.setLineDash([6, 6]);
        atomOverlayCtx.beginPath();
        atomOverlayCtx.arc(atomMouseScreen.x, atomMouseScreen.y, outerPx, 0, Math.PI * 2);
        atomOverlayCtx.stroke();
        atomOverlayCtx.setLineDash([]);
      }
      // Hydrogen
      if (hydrogenOverlayEnabled) {
        const innerPxH = HYDROGEN_INNER_TILES * scale;
        const outerPxH = HYDROGEN_OUTER_TILES * scale;
        atomOverlayCtx.strokeStyle = "rgba(0, 200, 255, 0.9)";
        atomOverlayCtx.beginPath();
        atomOverlayCtx.arc(atomMouseScreen.x, atomMouseScreen.y, innerPxH, 0, Math.PI * 2);
        atomOverlayCtx.stroke();
        atomOverlayCtx.strokeStyle = "rgba(0, 255, 180, 0.9)";
        atomOverlayCtx.setLineDash([8, 8]);
        atomOverlayCtx.beginPath();
        atomOverlayCtx.arc(atomMouseScreen.x, atomMouseScreen.y, outerPxH, 0, Math.PI * 2);
        atomOverlayCtx.stroke();
        atomOverlayCtx.setLineDash([]);
      }
    } catch {}
  }
  function updateAtomMouseFromClient(clientX, clientY) {
    try {
      if ((atomOverlayEnabled || hydrogenOverlayEnabled) && !atomOverlayCanvas) ensureAtomOverlay();
      if ((atomOverlayEnabled || hydrogenOverlayEnabled) && !atomRafId) startAtomLoop();
      if (!targetCanvas) return;
      const r = targetCanvas.getBoundingClientRect();
      const cx = ((clientX - r.left) / Math.max(1, r.width)) * targetCanvas.width;
      const cy = ((clientY - r.top) / Math.max(1, r.height)) * targetCanvas.height;
      const a = currentTransform.a || 1;
      const d = currentTransform.d || 1;
      const e = currentTransform.e || 0;
      const f = currentTransform.f || 0;
      atomMouseWorld.x = (cx - e) / a;
      atomMouseWorld.y = (cy - f) / d;
      atomMouseScreen.x = cx;
      atomMouseScreen.y = cy;
      // drawing loop will pick up latest coords
    } catch {}
  }
  const onMouseMove = (ev) => {
    try { lastMouseClient.x = ev.clientX; lastMouseClient.y = ev.clientY; } catch {}
    if (atomOverlayEnabled || hydrogenOverlayEnabled) updateAtomMouseFromClient(ev.clientX, ev.clientY);
  };
  try { window.addEventListener("mousemove", onMouseMove, true); } catch {}

  // Alliances overlay state
  let alliancesOverlayEnabled = false;
  let alliancesEl = null;
  let alliancesBody = null;
  let myAlliances = [];
  let lastTick = 0;
  let lastTickMs = Date.now();
  let alliancesTimer = null;
  // Tile ownership cache: tileRef -> owner smallID (0 means unowned)
  const tileOwnerByRef = new Map();
  function getTileRefFromClient(clientX, clientY) {
    try {
      if (!targetCanvas || !worldTilesWidth || !worldTilesHeight) return null;
      const r = targetCanvas.getBoundingClientRect();
      const cx = ((clientX - r.left) / Math.max(1, r.width)) * targetCanvas.width;
      const cy = ((clientY - r.top) / Math.max(1, r.height)) * targetCanvas.height;
      const a = currentTransform.a || 1;
      const d = currentTransform.d || 1;
      const e = currentTransform.e || 0;
      const f = currentTransform.f || 0;
      const worldX = (cx - e) / a;
      const worldY = (cy - f) / d;
      const halfW = (worldTilesWidth || 0) / 2;
      const halfH = (worldTilesHeight || 0) / 2;
      const tx = Math.floor(worldX + halfW);
      const ty = Math.floor(worldY + halfH);
      if (tx < 0 || ty < 0 || tx >= worldTilesWidth || ty >= worldTilesHeight) return null;
      return ty * worldTilesWidth + tx;
    } catch { return null; }
  }
  function positionAlliancesOverlay() {
    try {
      if (!alliancesEl) return;
      const gold = document.getElementById('of-gold-overlay');
      if (gold) {
        const gr = gold.getBoundingClientRect();
        alliancesEl.style.top = `${Math.round(gr.top)}px`;
        alliancesEl.style.left = `${Math.round(gr.right + 12)}px`;
        alliancesEl.style.right = "auto";
      } else {
        alliancesEl.style.top = "12px";
        alliancesEl.style.left = "auto";
        alliancesEl.style.right = "12px";
      }
    } catch {}
  }
  function ensureAlliancesOverlay() {
    try {
      if (alliancesEl) return;
      const el = document.createElement("div");
      el.id = "of-alliances-overlay";
      Object.assign(el.style, {
        position: "fixed",
        zIndex: 2147483646,
        top: "12px",
        right: "12px",
        minWidth: "360px",
        maxWidth: "640px",
        color: "#fff",
        background: "rgba(0,0,0,0.75)",
        borderRadius: "10px",
        padding: "10px 12px",
        font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        boxShadow: "0 4px 18px rgba(0,0,0,.4)",
        pointerEvents: "auto",
      });
      el.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Alliances</div><div id="of-alliances-body">waiting…</div>';
      document.documentElement.appendChild(el);
      alliancesEl = el;
      alliancesBody = el.querySelector('#of-alliances-body');
      try { console.log('[OF-Ext][Alliances] overlay created'); } catch {}
      try {
        el.addEventListener("click", (ev) => {
          try {
            const tgt = ev && ev.target ? (ev.target.id || ev.target.tagName || typeof ev.target) : null;
            console.log("[OF-Ext][Alliances] overlay click", { target: tgt });
          } catch {}
        }, true);
      } catch {}
      positionAlliancesOverlay();
    } catch {}
  }
  function hideAlliancesOverlay() {
    try { if (alliancesEl) alliancesEl.remove(); } catch {}
    alliancesEl = null; alliancesBody = null;
    if (alliancesTimer) { clearInterval(alliancesTimer); alliancesTimer = null; }
  }
  function formatSeconds(sec) {
    try {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${r.toString().padStart(2, '0')}`;
    } catch { return String(sec); }
  }
  function formatKInt(v) {
    try {
      if (typeof v === 'bigint') {
        const rounded = (v + 500n) / 1000n;
        return `${rounded.toString()}k`;
      }
      if (typeof v === 'string' && /^\d+$/.test(v)) {
        const bi = BigInt(v);
        const rounded = (bi + 500n) / 1000n;
        return `${rounded.toString()}k`;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      return `${Math.round(n / 1000)}k`;
    } catch { return String(v); }
  }
  function formatTroopsKInt(v) {
    try {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      // troops shown as troops/10 in UI
      return formatKInt(n / 10);
    } catch { return String(v); }
  }
  function renderAlliancesOverlay() {
    try {
      if (!alliancesBody) return;
      positionAlliancesOverlay();
      // Approximate current tick using elapsed real time
      const approxTick = lastTick + Math.max(0, Math.floor((Date.now() - lastTickMs) / TICK_MS));
      alliancesBody.textContent = "";
      if (!myAlliances || myAlliances.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "no active alliances";
        alliancesBody.appendChild(empty);
        return;
      }
      for (const a of myAlliances) {
        try {
          const row = document.createElement("div");
          Object.assign(row.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", margin: "4px 0" });
          const left = document.createElement("div");
          const other = a && a.other ? playersById.get(a.other) : null;
          const name = other ? (other.displayName || other.name || other.smallID || a.other) : a.other;
          const remainingTicks = Math.max(0, (a.expiresAt || 0) - approxTick);
          const remainingSec = (remainingTicks * TICK_MS) / 1000;
          const troopsStr = other ? formatTroopsKInt(other.troops) : "-";
          const goldStr = other ? formatKInt(other.gold) : "-";
          left.textContent = `${String(name)} — ${troopsStr} troops • ${goldStr} gold • ${formatSeconds(remainingSec)}`;
          row.appendChild(left);
          alliancesBody.appendChild(row);
        } catch {}
      }
    } catch {}
  }
  function startAlliancesLoop() {
    if (alliancesTimer) return;
    alliancesTimer = setInterval(renderAlliancesOverlay, 500);
    try {
      document.addEventListener('click', (ev) => {
        try {
          if (!alliancesEl) return;
          const path = (ev.composedPath && ev.composedPath()) || [];
          if (Array.isArray(path) ? path.includes(alliancesEl) : alliancesEl.contains(ev.target)) {
            const t = ev && ev.target ? (ev.target.id || ev.target.tagName) : null;
            console.log('[OF-Ext][Alliances] document click within overlay', { target: t });
          }
        } catch {}
      }, true);
    } catch {}
  }
  function stopAlliancesLoop() {
    if (alliancesTimer) { clearInterval(alliancesTimer); alliancesTimer = null; }
  }

  // --- Scope Feeder small overlay ---
  function ensureSfOverlay() {
    try {
      if (sfOverlayEl) return;
      const el = document.createElement("div");
      el.id = "of-scopefeeder-overlay";
      Object.assign(el.style, {
        position: "fixed",
        zIndex: 2147483645,
        left: "12px",
        bottom: "12px",
        padding: "6px 8px",
        color: "#fff",
        background: "rgba(0,160,255,0.2)",
        border: "1px solid rgba(0,160,255,0.5)",
        borderRadius: "8px",
        font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
        pointerEvents: "none",
      });
      el.textContent = "Scope Feeder Active";
      document.documentElement.appendChild(el);
      sfOverlayEl = el;
      updateSfOverlay();
    } catch {}
  }
  function updateSfOverlay() {
    try {
      if (!sfOverlayEl) return;
      let label = "?";
      if (asLastChosenName && String(asLastChosenName).trim()) {
        label = String(asLastChosenName).trim();
      } else {
        const raw = (asTarget && String(asTarget).trim()) || "";
        if (raw) {
          try {
            let p = null;
            if (playersById.has(raw)) p = playersById.get(raw);
            else if (/^\d+$/.test(raw)) p = playersBySmallId.get(Number(raw));
            else p = playersByName.get(raw.toLowerCase());
            if (p) label = String(p.displayName || p.name || p.smallID || raw);
            else label = raw;
          } catch { label = raw; }
        }
      }
      sfOverlayEl.textContent = `Scope Feeder Active: ${label}`;
    } catch {}
  }
  function hideSfOverlay() {
    try { if (sfOverlayEl) sfOverlayEl.remove(); } catch {}
    sfOverlayEl = null;
  }

  function onWorkerMessage(e) {
    const msg = e.data;
    try {
      if (!msg || msg.type !== "game_update" || !msg.gameUpdate) return;
      const { updates } = msg.gameUpdate;
      if (typeof msg.gameUpdate.tick === 'number') { lastTick = msg.gameUpdate.tick | 0; lastTickMs = Date.now(); }
      log("got game_update");
      const players = updates && updates[GameUpdateType.Player];
      if (!players || !Array.isArray(players)) return;

      // Prefer matching our client; otherwise fallback to first alive
      let my = null;
      if (currentClientID) my = players.find((p) => p.clientID === currentClientID) || null;
      if (!my) my = players.find((p) => p.isAlive) || null;
      if (!my) return;

      // Index players for targeting
      try {
        lastPlayers = players.slice();
        playersById.clear();
        playersBySmallId.clear();
        playersByName.clear();
        for (const p of players) {
          playersById.set(p.id, p);
          playersBySmallId.set(p.smallID, p);
          if (p.name) playersByName.set(String(p.name).toLowerCase(), p);
          if (p.displayName) playersByName.set(String(p.displayName).toLowerCase(), p);
        }
      } catch {}

      // Capture my relation snapshot
      try {
        mySmallID = my.smallID ?? null;
        myTeam = my.team ?? null;
        myAllies = new Set(Array.isArray(my.allies) ? my.allies : []);
        myAlliances = Array.isArray(my.alliances) ? my.alliances.slice() : [];
      } catch {}

      // Emit players list immediately for popup syncing
      try {
        const list = [];
        // Build a Set of embargoed targetIDs from 'my' if present
        let embargoSet = null;
        try { embargoSet = my && my.embargoes && typeof my.embargoes.has === 'function' ? my.embargoes : null; } catch {}
        for (const [, p] of playersById.entries()) {
          if (!p) continue;
          const id = p.id;
          const smallID = p.smallID;
          const name = p.displayName || p.name || String(smallID || id);
          const isTeamMate = !!(p.team != null && myTeam != null && p.team === myTeam);
          const isAllied = !!(Array.isArray(myAlliances) && myAlliances.some((a) => a && a.other === id));
          const isAlly = isTeamMate || isAllied || (myAllies && myAllies.has(smallID));
          const trading = embargoSet ? !embargoSet.has(id) : true;
          list.push({ id, smallID, name, isAlly, trading });
        }
        window.postMessage({ __ofTap: true, kind: 'players_list', players: list }, '*');
      } catch {}

      // Track City and SAM units from unit updates
      try {
        const unitUps = updates && updates[GameUpdateType.Unit];
        if (unitUps && Array.isArray(unitUps)) {
          let samCount = 0;
          for (const u of unitUps) {
            if (!u || u.id === undefined) continue;
            const idKey = String(u.id);
            const isSam = u.unitType === "SAM Launcher" || u.unitType === "SAMLauncher";
            const isCity = u.unitType === "City";
            if (isCity) {
              upsertCity(u);
            }
            if (isSam) {
              // Add/update when active, remove when destroyed
              if (u.isActive === false) {
                samUnits.delete(idKey);
                samLogAppend({ tick: msg.gameUpdate?.tick, id: u.id, pos: u.pos, isActive: u.isActive, ownerID: u.ownerID });
              } else {
                samUnits.set(idKey, { ref: u.pos, ownerID: u.ownerID });
              samLogAppend({ tick: msg.gameUpdate?.tick, id: u.id, pos: u.pos, isActive: u.isActive, ownerID: u.ownerID });
              samCount++;
              }
            } else if (u.isActive === false) {
              // If any other unit type shares an id that we previously tracked (unlikely), ensure cleanup
              samUnits.delete(idKey);
            }
          }
          if (samCount) slog("SAM updates received", { samCount, tracked: samUnits.size });
        }
      } catch {}
      // Track tile owners from packed tile updates (bigint-encoded)
      try {
        const packed = msg.gameUpdate && msg.gameUpdate.packedTileUpdates;
        if (packed && typeof packed.length === 'number') {
          for (let i = 0; i < packed.length; i++) {
            let tu = packed[i];
            try {
              if (typeof tu === 'string') tu = BigInt(tu);
            } catch {}
            try {
              // Format: [ref<<16] | state; owner smallID in lower 12 bits of state
              const ref = Number(tu >> 16n);
              const state = Number(tu & 0xffffn);
              const ownerSmall = state & 0x0fff;
              tileOwnerByRef.set(ref, ownerSmall);
            } catch {}
          }
        }
      } catch {}

      updateGoldRate(my);
      if (alliancesOverlayEnabled) renderAlliancesOverlay();
      if (samOverlayEnabled) scheduleSamDraw();
    } catch {}
  }

  function updateGoldRate(playerUpdate) {
    const now = Date.now();
    goldHistory.push({ t: now, g: playerUpdate.gold, name: playerUpdate.displayName || playerUpdate.name });
    // Trim old samples
    const cutoff = now - MAX_AGE_MS;
    while (goldHistory.length && goldHistory[0].t < cutoff) goldHistory.shift();

    function computeRates(windowMs) {
      const seg = goldHistory.filter((e) => e.t >= now - windowMs);
      if (seg.length < 2) return { gps: 0, gpm: 0 };
      const first = seg[0];
      const last = seg[seg.length - 1];
    const dtSec = Math.max(1, Math.floor((last.t - first.t) / 1000));
    let positiveDiff = 0n;
    try {
        for (let i = 1; i < seg.length; i++) {
          const prev = BigInt(seg[i - 1].g);
          const curr = BigInt(seg[i].g);
        const d = curr - prev;
        if (d > 0n) positiveDiff += d;
      }
    } catch {}
      const gpsVal = Number(positiveDiff) / dtSec;
      return { gps: Math.max(0, gpsVal), gpm: Math.max(0, gpsVal) * 60 };
    }

    const { gps: gps30, gpm: gpm30 } = computeRates(30 * 1000);
    const { gps: gps60, gpm: gpm60 } = computeRates(60 * 1000);
    const { gps: gps120, gpm: gpm120 } = computeRates(120 * 1000);
    log("gold rate", { gps30, gps60, gpm60, gpm120 });

    // Throttle UI updates
    if (now - lastDispatch > 200) {
      lastDispatch = now;
      const lastSample = goldHistory[goldHistory.length - 1] || { t: now, g: playerUpdate.gold, name: playerUpdate.displayName || playerUpdate.name };
      let lastGoldStr;
      try {
        if (typeof lastSample.g === "bigint") lastGoldStr = lastSample.g.toString();
        else lastGoldStr = String(lastSample.g);
      } catch {
        try { lastGoldStr = String(lastSample.g); } catch { lastGoldStr = ""; }
      }
      window.postMessage(
        {
          __ofTap: true,
          kind: "gold_rate",
          gps30: gps30.toFixed(2),
          gps60: gps60.toFixed(2),
          gpm60: Math.round(gpm60),
          gpm120: Math.round(gpm120),
          lastGold: lastGoldStr,
          lastAt: lastSample.t,
          playerName: lastSample.name,
        },
        "*",
      );

      // Also emit a lightweight advanced stats snapshot
      try {
        const maxTroopsEst = estimateMaxTroops(playerUpdate.tilesOwned, playerUpdate.smallID);
        window.postMessage(
          {
            __ofTap: true,
            kind: "adv_stats",
            playerName: playerUpdate.displayName || playerUpdate.name,
            team: playerUpdate.team,
            smallID: playerUpdate.smallID,
            tilesOwned: playerUpdate.tilesOwned,
            troops: playerUpdate.troops,
            maxTroops: maxTroopsEst,
            outgoing: (playerUpdate.outgoingAttacks || []).length,
            incoming: (playerUpdate.incomingAttacks || []).length,
            allies: (playerUpdate.allies || []).length,
            embargoes: playerUpdate.embargoes ? (playerUpdate.embargoes.size || 0) : 0,
          },
          "*",
        );
      } catch {}

      // Emit players list with embargo status for popup syncing
      try {
        const list = [];
        for (const [, p] of playersById.entries()) {
          if (!p) continue;
          const id = p.id;
          const smallID = p.smallID;
          const name = p.displayName || p.name || String(smallID || id);
          const isAlly = !!(p.team != null && myTeam != null && p.team === myTeam) || (myAllies && myAllies.has(smallID));
          const my = readMyPlayer();
          const myEmbargoes = my && my.embargoes ? my.embargoes : null;
          const trading = myEmbargoes ? !myEmbargoes.has(id) : true;
          list.push({ id, smallID, name, isAlly, trading });
        }
        window.postMessage({ __ofTap: true, kind: 'players_list', players: list }, '*');
      } catch {}
    }
  }

  function wrapWorker(worker) {
    if (worker.__ofWrapped) return worker;
    worker.__ofWrapped = true;

    const origPostMessage = worker.postMessage;
    worker.postMessage = function patchedPostMessage(data, ...rest) {
      try {
        if (data && typeof data === "object" && data.type === "init") {
          if (data.clientID) currentClientID = data.clientID;
          log("init seen; clientID=", currentClientID);
        }
      } catch {}
      return origPostMessage.call(this, data, ...rest);
    };

    worker.addEventListener("message", onWorkerMessage);
    return worker;
  }

  class WrappedWorker extends OriginalWorker {
    constructor(...args) {
      super(...args);
      wrapWorker(this);
    }
    static ofWrap(w) {
      return wrapWorker(w);
    }
  }

  Object.defineProperty(window, "Worker", {
    configurable: true,
    writable: true,
    value: WrappedWorker,
  });
  log("Worker wrapper installed");
  // Bring up the SAM log by default so we can verify updates
  if (samLogEnabled) { try { ensureSamLog(); } catch {} }
  // Bring up Auto-Donate log by default so user always sees status
  if (asLogEnabled) { try { ensureAsLog(); } catch {} }

  // --- WebSocket wrapper to identify game socket and send intents ---
  try {
    const OriginalWebSocket = window.WebSocket;
    class WrappedWebSocket extends OriginalWebSocket {
      constructor(url, protocols) {
        super(url, protocols);
        try {
          this.addEventListener("open", () => {
            // no-op; we will detect join message to bind clientID/socket
          });
          this.addEventListener("message", (ev) => {
            try {
              if (!ev || !ev.data) return;
              let obj;
              if (typeof ev.data === "string") obj = JSON.parse(ev.data);
              // Server messages have discriminated union 'type'
              if (obj && (obj.type === "turn" || obj.type === "start" || obj.type === "ping")) {
                gameSocket = this;
              }
            } catch {}
          });
        } catch {}
      }
      send(data) {
        try {
          // Detect join to learn clientID and bind socket
          if (typeof data === "string") {
            try {
              const obj = JSON.parse(data);
              if (obj && obj.type === "join" && obj.clientID) {
                currentClientID = obj.clientID;
                gameSocket = this;
              }
              // Any intent implies this is the game socket
              if (obj && obj.type === "intent" && obj.intent && typeof obj.intent.type === "string") {
                gameSocket = this;
              }
            } catch {}
          }
        } catch {}
        return super.send(data);
      }
    }
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: WrappedWebSocket,
    });
  } catch {}

  function resolveRecipient(target) {
    try {
      if (target === "AllPlayers") return "AllPlayers";
      if (typeof target === "number") {
        const p = playersBySmallId.get(target);
        return p ? p.id : null;
      }
      if (typeof target === "string") {
        // Exact id
        if (playersById.has(target)) return target;
        // Try integer smallID represented as string
        if (/^\d+$/.test(target)) {
          const p = playersBySmallId.get(Number(target));
          return p ? p.id : null;
        }
        // Fuzzy name match
        const p = playersByName.get(target.toLowerCase());
        if (p) return p.id;
      }
    } catch {}
    return null;
  }

  function sendEmojiOnce(recipient, emojiIndex) {
    if (!gameSocket || gameSocket.readyState !== 1 /* OPEN */) return false;
    if (!currentClientID) return false;
    const msg = {
      type: "intent",
      intent: {
        type: "emoji",
        clientID: currentClientID,
        recipient,
        emoji: emojiIndex,
      },
    };
    try {
      gameSocket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  function startEmojiSpam(params) {
    try { stopEmojiSpam(); } catch {}
    const { target, emojiIndex, intervalMs } = params || {};
    const recipient = resolveRecipient(target);
    if (!recipient && target !== "AllPlayers") return;
    const iv = Math.max(250, Number(intervalMs || 1000));
    spamTimer = setInterval(() => {
      sendEmojiOnce(recipient ?? "AllPlayers", Number(emojiIndex || 0));
    }, iv);
  }

  function stopEmojiSpam() {
    if (spamTimer) {
      clearInterval(spamTimer);
      spamTimer = null;
    }
  }

  // ========== CUSTOM KEYBOARD HANDLER SYSTEM ==========
  // Default keybinds - user can customize these
  const DEFAULT_KEYBINDS = {
    sam: "Ctrl+Shift+KeyF",
    atom: "Alt+KeyA",
    hydrogen: "Alt+KeyH",
    captureTarget: "Alt+KeyM",
    scopeFeeder: "Alt+KeyF",
    alliances: "Alt+KeyT",
    embargoAll: "Alt+KeyE"
  };

  // Current keybinds (loaded from storage or defaults)
  let currentKeybinds = { ...DEFAULT_KEYBINDS };

  // Load custom keybinds from storage
  function loadKeybinds() {
    try {
      chrome?.storage?.local?.get(['of_keybinds'], (result) => {
        if (result && result.of_keybinds) {
          currentKeybinds = { ...DEFAULT_KEYBINDS, ...result.of_keybinds };
          log('[Keyboard] Loaded custom keybinds:', currentKeybinds);
        } else {
          log('[Keyboard] Using default keybinds');
        }
      });
    } catch (e) {
      log('[Keyboard] Failed to load keybinds:', e);
    }
  }

  // Convert key event to normalized string (e.g., "Ctrl+Shift+KeyF")
  function keyEventToString(ev) {
    const parts = [];
    if (ev.ctrlKey) parts.push('Ctrl');
    if (ev.altKey) parts.push('Alt');
    if (ev.shiftKey) parts.push('Shift');
    if (ev.metaKey) parts.push('Meta');
    parts.push(ev.code);
    return parts.join('+');
  }

  // Check if key event matches a keybind string
  function matchesKeybind(ev, keybindStr) {
    return keyEventToString(ev) === keybindStr;
  }

  // Toggle SAM overlay
  function toggleSAMOverlay() {
    samOverlayEnabled = !samOverlayEnabled;
    log('[Keyboard] SAM overlay:', samOverlayEnabled);
    if (samOverlayEnabled) {
      ensureSamOverlay();
      scheduleSamDraw();
    } else {
      hideSamOverlay();
    }
    try { chrome?.storage?.local?.set({ of_sam_enabled: samOverlayEnabled }); } catch {}
  }

  // Toggle Atom overlay
  function toggleAtomOverlay() {
    atomOverlayEnabled = !atomOverlayEnabled;
    log('[Keyboard] Atom overlay:', atomOverlayEnabled);
    if (atomOverlayEnabled) {
      ensureAtomOverlay();
      scheduleAtomDraw();
    } else {
      hideAtomOverlay();
    }
    try { chrome?.storage?.local?.set({ of_atom_enabled: atomOverlayEnabled }); } catch {}
  }

  // Toggle Hydrogen overlay
  function toggleHydrogenOverlay() {
    hydrogenOverlayEnabled = !hydrogenOverlayEnabled;
    log('[Keyboard] Hydrogen overlay:', hydrogenOverlayEnabled);
    if (hydrogenOverlayEnabled) {
      ensureAtomOverlay(); // Reuses same canvas
      scheduleAtomDraw();
    } else {
      hideAtomOverlay();
    }
    try { chrome?.storage?.local?.set({ of_hydrogen_enabled: hydrogenOverlayEnabled }); } catch {}
  }

  // Toggle Alliances overlay
  function toggleAlliancesOverlay() {
    alliancesOverlayEnabled = !alliancesOverlayEnabled;
    log('[Keyboard] Alliances overlay:', alliancesOverlayEnabled);
    if (alliancesOverlayEnabled) {
      ensureAlliancesOverlay();
      renderAlliancesOverlay();
      startAlliancesLoop();
    } else {
      hideAlliancesOverlay();
      stopAlliancesLoop();
    }
    try { chrome?.storage?.local?.set({ of_alliances_enabled: alliancesOverlayEnabled }); } catch {}
  }

  // Capture mouse-over territory as auto-send target
  function captureMouseTarget(ev) {
    try {
      const tileRef = getTileRefFromClient(ev.clientX, ev.clientY);
      if (tileRef === null) return;
      const ownerID = tileOwnerByRef.get(tileRef);
      if (!ownerID) return;
      const owner = playersBySmallID.get(ownerID);
      if (!owner) return;
      asTargetID = owner.id;
      asTargetName = owner.displayName || owner.name || '';
      log('[Keyboard] Captured target:', asTargetName, 'ID:', asTargetID);
      try { chrome?.storage?.local?.set({ of_as_target_id: asTargetID, of_as_target_name: asTargetName }); } catch {}
    } catch (e) {
      log('[Keyboard] Capture target failed:', e);
    }
  }

  // Toggle Scope Feeder (auto-send)
  function toggleScopeFeeder() {
    asEnabled = !asEnabled;
    log('[Keyboard] Scope Feeder:', asEnabled);
    try { chrome?.storage?.local?.set({ of_as_enabled: asEnabled }); } catch {}
  }

  // Embargo All
  function embargoAll() {
    log('[Keyboard] Embargo All triggered');
    if (typeof embargoAllPlayers === 'function') {
      embargoAllPlayers();
    }
  }

  // Unified keyboard handler
  function handleKeyPress(ev) {
    // Ignore keypresses in input fields
    try {
      const tag = (ev.target && ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable)) return;
    } catch {}

    const keyStr = keyEventToString(ev);
    log('[Keyboard] Key pressed:', keyStr);

    // Check against all keybinds
    if (matchesKeybind(ev, currentKeybinds.sam)) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleSAMOverlay();
    } else if (matchesKeybind(ev, currentKeybinds.atom)) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleAtomOverlay();
    } else if (matchesKeybind(ev, currentKeybinds.hydrogen)) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleHydrogenOverlay();
    } else if (matchesKeybind(ev, currentKeybinds.alliances)) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleAlliancesOverlay();
    } else if (matchesKeybind(ev, currentKeybinds.captureTarget)) {
      ev.preventDefault();
      ev.stopPropagation();
      captureMouseTarget(ev);
    } else if (matchesKeybind(ev, currentKeybinds.scopeFeeder)) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleScopeFeeder();
    } else if (matchesKeybind(ev, currentKeybinds.embargoAll)) {
      ev.preventDefault();
      ev.stopPropagation();
      embargoAll();
    }
  }

  // Initialize keyboard handler
  try {
    loadKeybinds();
    window.addEventListener('keydown', handleKeyPress, true);
    log('[Keyboard] Custom keyboard handler initialized');
  } catch (e) {
    log('[Keyboard] Failed to initialize:', e);
  }
  // ========== END KEYBOARD HANDLER SYSTEM ==========

  // Listen for extension -> page commands via content bridge
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.__ofFromExt !== true) return;
    if (m.kind === "emoji_spam_start") {
      startEmojiSpam(m.payload || {});
    } else if (m.kind === "emoji_spam_stop") {
      stopEmojiSpam();
    } else if (m.kind === "sam_overlay_toggle") {
      samOverlayEnabled = !!(m.payload && m.payload.enabled);
      if (samOverlayEnabled) {
        ensureSamOverlay();
        scheduleSamDraw();
      } else {
        hideSamOverlay();
      }
    } else if (m.kind === "sam_log_toggle") {
      const enabled = !!(m.payload && m.payload.enabled);
      samLogEnabled = enabled;
      if (enabled) {
        ensureSamLog();
      } else {
        if (samLogEl) { try { samLogEl.remove(); } catch {} }
        samLogEl = null; samLogBody = null;
      }
    } else if (m.kind === "as_start") {
      asStart(m.payload || {});
    } else if (m.kind === "as_stop") {
      asStop();
    } else if (m.kind === "as_log_toggle") {
      const en = !!(m.payload && m.payload.enabled);
      asLogEnabled = en;
      if (en) {
        ensureAsLog();
      } else {
        try { if (asLogEl) asLogEl.remove(); } catch {}
        asLogEl = null; asLogBody = null;
      }
    } else if (m.kind === "embargo_all") {
      embargoAllPlayers();
    } else if (m.kind === "unembargo_all") {
      try {
        const me = readMyPlayer();
        const myId = me?.id;
        let count = 0;
        for (const [, p] of playersById.entries()) {
          try {
            if (!p) continue;
            const targetId = p.id;
            if (!targetId) continue;
            if (myId && targetId === myId) continue; // skip self
            if (sendEmbargoIntent(targetId, 'stop')) count++;
          } catch {}
        }
        try { window.postMessage({ __ofTap: true, kind: "as_status", text: `Trading enabled with ${count} players` }, "*"); } catch {}
      } catch {}
    } else if (m.kind === "embargo_toggle") {
      try {
        const id = m?.payload?.id;
        const action = m?.payload?.action;
        if (id) sendEmbargoIntent(id, action === 'stop' ? 'stop' : 'start');
      } catch {}
    } else if (m.kind === "atom_overlay_toggle") {
      const en = !!(m.payload && m.payload.enabled);
      atomOverlayEnabled = en;
      if (en) {
        ensureAtomOverlay();
        try {
          if (targetCanvas) {
            const r = targetCanvas.getBoundingClientRect();
            updateAtomMouseFromClient(r.left + r.width / 2, r.top + r.height / 2);
          }
        } catch {}
        startAtomLoop();
      } else {
        // only hide if hydrogen is not enabled
        if (!hydrogenOverlayEnabled) { hideAtomOverlay(); stopAtomLoop(); }
      }
    } else if (m.kind === "hydrogen_overlay_toggle") {
      const en = !!(m.payload && m.payload.enabled);
      hydrogenOverlayEnabled = en;
      if (en) {
        ensureAtomOverlay();
        try {
          if (targetCanvas) {
            const r = targetCanvas.getBoundingClientRect();
            updateAtomMouseFromClient(r.left + r.width / 2, r.top + r.height / 2);
          }
        } catch {}
        startAtomLoop();
      } else {
        if (!atomOverlayEnabled) { hideAtomOverlay(); stopAtomLoop(); }
      }
    } else if (m.kind === "alliances_overlay_toggle") {
      const en = !!(m.payload && m.payload.enabled);
      alliancesOverlayEnabled = en;
      if (en) { ensureAlliancesOverlay(); renderAlliancesOverlay(); startAlliancesLoop(); }
      else { hideAlliancesOverlay(); stopAlliancesLoop(); }
    } else if (m.kind === "capture_mouse_player") {
      try {
        const ref = getTileRefFromClient(lastMouseClient.x, lastMouseClient.y);
        if (ref == null) {
          try { console.log('[OF-Ext][ScopeFeeder] ALT+M: no tile under cursor'); } catch {}
          window.postMessage({ __ofTap: true, kind: "as_status", text: "No tile under cursor" }, "*");
          return;
        }
        const ownerSmall = tileOwnerByRef.get(ref) || 0;
        if (!ownerSmall) {
          try { console.log('[OF-Ext][ScopeFeeder] ALT+M: tile has no owner', { ref }); } catch {}
          window.postMessage({ __ofTap: true, kind: "as_status", text: "Tile unowned" }, "*");
          return;
        }
        const p = playersBySmallId.get(ownerSmall);
        const name = p ? (p.displayName || p.name || String(ownerSmall)) : String(ownerSmall);
        asTarget = name;
        try { asLog(`Target set via Alt+M: ${name}`); } catch {}
        try { console.log('[OF-Ext][ScopeFeeder] ALT+M: resolved owner', { ref, ownerSmall, playerId: p?.id, name }); } catch {}
        try { chrome?.storage?.local?.get(["of_as_state"]).then((res)=>{
          const st = res?.of_as_state || {};
          const next = Object.assign({}, st, { target: name });
          chrome?.storage?.local?.set({ of_as_state: next });
        }).catch(()=>{}); } catch {}
        window.postMessage({ __ofTap: true, kind: "as_status", text: `Target set: ${name}` }, "*");
        // Notify extension (via content bridge) so popup can live-update when open
        try {
          window.postMessage({ __ofFromPage: true, kind: "as_set_target", payload: { target: name } }, "*");
          window.postMessage({ __ofFromPage: true, kind: "emoji_set_target", payload: { target: name } }, "*");
        } catch {}
        if (asRunning) { try { updateSfOverlay(); } catch {} }
      } catch {}
    }
  });

  // --- DISABLED: Old Alt+F keyboard listener (now handled by unified keyboard handler) ---
  // try {
  //   window.addEventListener('keydown', (ev) => {
  //     try {
  //       // Ignore if user is typing in an input/textarea
  //       const tag = (ev.target && ev.target.tagName || '').toLowerCase();
  //       if (tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable)) return;
  //     } catch {}
  //     try {
  //       const isAltF = ev.altKey && (ev.key?.toLowerCase() === 'f' || ev.code === 'KeyF');
  //       if (!isAltF) return;
  //       // rely on cooldown below to avoid accidental double toggles; allow repeats otherwise
  //       try { console.log('[OF-Ext][AS] Alt+F detected', { asRunning, hasTimer: !!asTimer }); } catch {}
  //       ev.preventDefault();
  //       ev.stopPropagation();
  //       const now = Date.now();
  //       if (now - asLastToggleMs < asToggleCooldownMs) { try { console.log('[OF-Ext][AS] toggle ignored due to cooldown'); } catch {} return; }
  //       asLastToggleMs = now;
  //       // Delegate to content script (has chrome APIs) to perform stop-then-start with saved settings
  //       try { window.postMessage({ __ofFromPage: true, kind: "as_altf_toggle", payload: { running: !!asRunning } }, "*"); } catch {}
  //     } catch {}
  //   }, true);
  // } catch {}

  // --- Capture canvas transform and host overlay alongside the main canvas ---
  try {
    const proto = CanvasRenderingContext2D.prototype;
    const originalSetTransform = proto.setTransform;
    proto.setTransform = function patchedSetTransform(a, b, c, d, e, f) {
      try {
        // Record transform for the likely main canvas
        const canvas = this.canvas;
        if (canvas && canvas.width && canvas.height) {
          targetCanvas = canvas;
          currentTransform = { a: Number(a) || 1, d: Number(d) || 1, e: Number(e) || 0, f: Number(f) || 0 };
          const prevW = screenCanvasWidth, prevH = screenCanvasHeight;
          screenCanvasWidth = canvas.width | 0;
          screenCanvasHeight = canvas.height | 0;
          if (prevW !== screenCanvasWidth || prevH !== screenCanvasHeight) {
            slog("screen canvas size", { screenCanvasWidth, screenCanvasHeight });
          }
          if (samOverlayEnabled) scheduleSamDraw();
        }
      } catch {}
      return originalSetTransform.apply(this, arguments);
    };
  } catch {}

  // Capture world (tile) dimensions from layer drawImage calls
  try {
    const proto2 = CanvasRenderingContext2D.prototype;
    const originalDrawImage = proto2.drawImage;
    proto2.drawImage = function patchedDrawImage(img) {
      try {
        // Overloads: we care about drawImage(sourceCanvas, dx, dy, dWidth, dHeight)
        if (img && img instanceof HTMLCanvasElement) {
          const args = arguments;
          if (args.length === 5) {
            const dWidth = Number(args[3]);
            const dHeight = Number(args[4]);
            // TerrainLayer draws its offscreen canvas scaled to game.width()/height()
            if (dWidth && dHeight) {
              // dWidth/dHeight are passed as game.width()/height() in tile units. Trust them.
              const w = Math.round(dWidth);
              const h = Math.round(dHeight);
              const prevArea = worldTilesWidth * worldTilesHeight;
              const newArea = w * h;
              if (newArea > prevArea) {
                worldTilesWidth = w;
                worldTilesHeight = h;
              }
            }
          }
        }
      } catch {}
      return originalDrawImage.apply(this, arguments);
    };
  } catch {}

  function ensureSamOverlay() {
    try {
      if (!samOverlayCanvas) {
        samOverlayCanvas = document.createElement("canvas");
        samOverlayCanvas.id = "of-sam-overlay";
        Object.assign(samOverlayCanvas.style, {
          position: "fixed",
          zIndex: 2147483647,
          pointerEvents: "none",
          top: "0px",
          left: "0px",
        });
        document.documentElement.appendChild(samOverlayCanvas);
        samOverlayCtx = samOverlayCanvas.getContext("2d");
        slog("created sam overlay canvas");
      }
      syncOverlayBounds();
    } catch {}
  }

  function hideSamOverlay() {
    try {
      if (samOverlayCanvas) {
        samOverlayCanvas.remove();
      }
    } catch {}
    samOverlayCanvas = null;
    samOverlayCtx = null;
  }

  function syncOverlayBounds() {
    try {
      if (!samOverlayCanvas) return;
      if (!targetCanvas) return;
      const r = targetCanvas.getBoundingClientRect();
      samOverlayCanvas.width = targetCanvas.width;
      samOverlayCanvas.height = targetCanvas.height;
      samOverlayCanvas.style.width = `${Math.round(r.width)}px`;
      samOverlayCanvas.style.height = `${Math.round(r.height)}px`;
      samOverlayCanvas.style.left = `${Math.round(r.left)}px`;
      samOverlayCanvas.style.top = `${Math.round(r.top)}px`;
      slog("sync overlay bounds", { cw: samOverlayCanvas.width, ch: samOverlayCanvas.height, rect: { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top) } });
    } catch {}
  }

  let samDrawScheduled = false;
  function scheduleSamDraw() {
    if (samDrawScheduled) return;
    samDrawScheduled = true;
    requestAnimationFrame(() => {
      samDrawScheduled = false;
      drawSamOverlay();
    });
  }

  function drawSamOverlay() {
    try {
      if (!samOverlayEnabled) return;
      ensureSamOverlay();
      if (!samOverlayCtx || !samOverlayCanvas) return;
      syncOverlayBounds();
      samOverlayCtx.clearRect(0, 0, samOverlayCanvas.width, samOverlayCanvas.height);

      // Apply same transform as game. Account for device pixel ratio scaling.
      samOverlayCtx.setTransform(currentTransform.a, 0, 0, currentTransform.d, currentTransform.e, currentTransform.f);
      samOverlayCtx.lineWidth = 1.5 / Math.max(0.5, currentTransform.a);

      // Draw each SAM circle
      const radius = SAM_RANGE_TILES;
      const halfW = (worldTilesWidth || 0) / 2;
      const halfH = (worldTilesHeight || 0) / 2;
      if (!worldTilesWidth || !worldTilesHeight) {
        slog("skip draw: unknown worldTiles dims", { worldTilesWidth, worldTilesHeight });
        return;
      }
      slog("draw overlay", { samCount: samUnits.size, radius, transform: currentTransform });
      for (const { ref, ownerID } of samUnits.values()) {
        const tx = ref % worldTilesWidth;
        const ty = Math.floor(ref / worldTilesWidth);
        // Convert tile index to world coordinates via TransformHandler formula
        // worldX = (tx - game.width()/2), worldY = (ty - game.height()/2)
        const cx = tx - halfW;
        const cy = ty - halfH;
        slog("sam circle", { ref, tx, ty, cx, cy });
        // Pick color per relation: self=cyan, ally/team=green, hostile=red
        let stroke = "rgba(0, 200, 255, 0.65)";
        let fill = "rgba(0, 200, 255, 0.10)";
        try {
          if (ownerID !== undefined && mySmallID !== null) {
            const isSelf = ownerID === mySmallID;
            const owner = playersBySmallId.get(ownerID);
            const sameTeam = owner && myTeam !== null && owner.team === myTeam;
            const isAlly = myAllies.has(ownerID);
            if (isSelf) {
              stroke = "rgba(0, 200, 255, 0.85)";
              fill = "rgba(0, 200, 255, 0.15)";
            } else if (sameTeam || isAlly) {
              stroke = "rgba(0, 200, 0, 0.85)"; // green
              fill = "rgba(0, 200, 0, 0.15)";
            } else {
              stroke = "rgba(220, 0, 0, 0.85)"; // red
              fill = "rgba(220, 0, 0, 0.15)";
            }
          }
        } catch {}
        samOverlayCtx.strokeStyle = stroke;
        samOverlayCtx.fillStyle = fill;
        samOverlayCtx.beginPath();
        samOverlayCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        samOverlayCtx.fill();
        samOverlayCtx.stroke();
      }

      // Reset transform so subsequent DOM paints unaffected
      samOverlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    } catch {}
  }

  function ensureSamLog() {
    if (!samLogEnabled) return;
    try {
      if (samLogEl) return;
      const el = document.createElement("div");
      el.id = "of-sam-log";
      Object.assign(el.style, {
        position: "fixed",
        zIndex: 2147483647,
        left: "12px",
        top: "50%",
        transform: "translateY(-50%)",
        width: "340px",
        maxHeight: "60vh",
        background: "rgba(0,0,0,0.8)",
        color: "#cff",
        font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        border: "1px solid rgba(0,200,255,0.5)",
        borderRadius: "8px",
        boxShadow: "0 6px 18px rgba(0,0,0,.45)",
        overflow: "hidden",
      });
      const header = document.createElement("div");
      header.textContent = "SAM Updates";
      Object.assign(header.style, {
        padding: "6px 8px",
        background: "rgba(0,200,255,0.15)",
        borderBottom: "1px solid rgba(0,200,255,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      });
      const btns = document.createElement("div");
      const clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.onclick = () => {
        samLogLines.length = 0;
        if (samLogBody) samLogBody.textContent = "";
      };
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.style.marginLeft = "6px";
      closeBtn.onclick = () => {
        try { el.remove(); } catch {}
        samLogEl = null; samLogBody = null; samLogEnabled = false;
      };
      for (const b of [clearBtn, closeBtn]) {
        Object.assign(b.style, {
          background: "rgba(0,200,255,0.15)",
          color: "#cff",
          border: "1px solid rgba(0,200,255,0.35)",
          borderRadius: "6px",
          font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "2px 6px",
          cursor: "pointer",
        });
      }
      btns.appendChild(clearBtn);
      btns.appendChild(closeBtn);
      header.appendChild(btns);
      const body = document.createElement("div");
      samLogBody = body;
      Object.assign(body.style, {
        padding: "8px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: "calc(40vh - 34px)",
      });
      el.appendChild(header);
      el.appendChild(body);
      document.documentElement.appendChild(el);
      samLogEl = el;
      // Render existing lines if any
      for (const line of samLogLines) {
        const div = document.createElement("div");
        div.textContent = line;
        body.appendChild(div);
      }
    } catch {}
  }

  function samLogAppend(data) {
    if (!samLogEnabled) return;
    ensureSamLog();
    try {
      const parts = [];
      if (data.tick !== undefined) parts.push(`t=${data.tick}`);
      if (data.id !== undefined) parts.push(`id=${data.id}`);
      if (data.pos !== undefined) parts.push(`pos=${data.pos}`);
      if (data.isActive !== undefined) parts.push(`active=${data.isActive}`);
      if (data.ownerID !== undefined) parts.push(`owner=${data.ownerID}`);
      const line = parts.join(" ");
      samLogLines.push(line);
      while (samLogLines.length > MAX_SAM_LOG_LINES) samLogLines.shift();
      if (samLogBody) {
        const div = document.createElement("div");
        div.textContent = line;
        samLogBody.appendChild(div);
        samLogBody.scrollTop = samLogBody.scrollHeight;
      }
    } catch {}
  }
})();


