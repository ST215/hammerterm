// =====================
// HAMMER v3.0 "WORKER INTERCEPT EDITION"
// Combines: ME Stream UI + MARS Worker interception technique
// Tracks donations via direct Worker message interception
// Full donation tracking: inbound, outbound, ports, feed
// =====================
;(() => {
  // ----- hard reset any prior instance -----
  if (window.__HAMMER__?.ui?.root) {
    try { window.__HAMMER__.cleanup?.() } catch {}
    try { window.__HAMMER__.ui.root.remove() } catch {}
    delete window.__HAMMER__
  }

  const DEBUG = false
  const log = (...args) => { if (DEBUG) console.log('[HAMMER]', ...args) }

  // ===== WORKER INTERCEPTION (from MARS extension) =====
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
  }

  const MessageType = {
    ATTACK_FAILED: 0,
    ATTACK_CANCELLED: 1,
    RECEIVED_GOLD_FROM_TRADE: 20,
    SENT_GOLD_TO_PLAYER: 18,
    RECEIVED_GOLD_FROM_PLAYER: 19,
    SENT_TROOPS_TO_PLAYER: 21,
    RECEIVED_TROOPS_FROM_PLAYER: 22,
  }

  let currentClientID = null
  try {
    const cid = localStorage.getItem("client_id")
    if (cid && typeof cid === "string") currentClientID = cid
  } catch {}

  // Player tracking
  let mySmallID = null
  let myTeam = null
  let myAllies = new Set()
  const playersById = new Map()
  const playersBySmallId = new Map()
  const playersByName = new Map()

  // ----- utils -----
  const toNum = (v) => Number(v) || 0
  const nowDate = () => new Date()
  const fmtClock = (d) => d.toLocaleTimeString()
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    )
  const short = (v) => {
    v = Math.abs(toNum(v))
    if (v >= 1_000_000) return Math.round(v / 100000) / 10 + "M"
    if (v >= 1_000) return Math.round(v / 1000) + "k"
    return String(Math.trunc(v))
  }

  // ----- state -----
  const SIZES = [
    { w: 420, h: 300, bodyH: 252 },
    { w: 600, h: 420, bodyH: 372 },
    { w: 760, h: 520, bodyH: 472 },
  ]
  const S = {
    view: "inbound", // inbound | outbound | ports | feed | debug
    paused: false,
    minimized: false,
    sizeIdx: 1,
    // tag mates
    myTag: null,
    filterTagMates: false,

    // de-dup of raw events
    seen: new Set(),

    // aggregations keyed by player ID
    inbound: new Map(), // id -> { gold,troops,count,last }
    outbound: new Map(), // id -> { gold,troops,count,last }
    ports: new Map(), // id -> { totalGold, times[], avgIntSec, lastIntSec, gpm }

    // streams
    feedIn: [], // {ts,type,name,amount}
    feedOut: [], // {ts,type,name,amount}
    rawMessages: [], // last ~100 raw DisplayMessageUpdate objects
  }

  function bump(map, key) {
    if (!map.has(key)) map.set(key, { gold: 0, troops: 0, count: 0, last: null })
    return map.get(key)
  }
  function bumpPorts(playerId, gold, t) {
    if (!S.ports.has(playerId))
      S.ports.set(playerId, { totalGold: 0, times: [], avgIntSec: 0, lastIntSec: 0, gpm: 0 })
    const p = S.ports.get(playerId)
    p.totalGold += gold
    p.times.push(t)
    if (p.times.length > 60) p.times.splice(0, p.times.length - 60)

    if (p.times.length >= 2) {
      const diffs = []
      for (let i = 1; i < p.times.length; i++) diffs.push((p.times[i] - p.times[i - 1]) / 1000)
      const sum = diffs.reduce((a, b) => a + b, 0)
      p.avgIntSec = Math.round(sum / diffs.length)
      p.lastIntSec = Math.round(diffs[diffs.length - 1])
      const minutes = sum / 60 || 0.0001
      p.gpm = Math.round(p.totalGold / (minutes || 0.0001))
    }
  }

  // ===== WORKER WRAPPER (from MARS) =====
  const OriginalWorker = window.Worker
  log("installing Worker wrapper")

  function onWorkerMessage(e) {
    const msg = e.data
    try {
      if (!msg || msg.type !== "game_update" || !msg.gameUpdate) return
      const { updates } = msg.gameUpdate
      log("got game_update")

      // Update player roster
      const players = updates && updates[GameUpdateType.Player]
      if (players && Array.isArray(players)) {
        playersById.clear()
        playersBySmallId.clear()
        playersByName.clear()
        for (const p of players) {
          if (!p) continue
          playersById.set(p.id, p)
          if (p.smallID != null) playersBySmallId.set(p.smallID, p)
          if (p.name) playersByName.set(String(p.name).toLowerCase(), p)
          if (p.displayName) playersByName.set(String(p.displayName).toLowerCase(), p)
        }

        // Find my player
        let my = null
        if (currentClientID) my = players.find((p) => p.clientID === currentClientID) || null
        if (!my) my = players.find((p) => p.isAlive) || null
        if (my) {
          mySmallID = my.smallID ?? null
          myTeam = my.team ?? null
          myAllies = new Set(Array.isArray(my.allies) ? my.allies : [])
        }
      }

      // Process DisplayEvent messages (donation messages!)
      const displayEvents = updates && updates[GameUpdateType.DisplayEvent]
      if (displayEvents && Array.isArray(displayEvents)) {
        for (const evt of displayEvents) {
          try {
            processDisplayMessage(evt)
          } catch (err) {
            log('Error processing display event:', err)
          }
        }
      }
    } catch (err) {
      log('Worker message error:', err)
    }
  }

  function processDisplayMessage(msg) {
    if (!msg || typeof msg.messageType !== 'number') return

    S.rawMessages.push(msg)
    if (S.rawMessages.length > 100) S.rawMessages.shift()

    if (S.paused) return

    const messageType = msg.messageType
    const playerId = msg.playerID // The player this message is FOR (usually me)
    const message = msg.message || ''

    log(`DisplayMessage: type=${messageType} player=${playerId} msg="${message}"`)

    // Only track if I'm involved
    if (playerId !== mySmallID && String(playerId) !== String(currentClientID)) {
      log('Not my message, ignoring')
      return
    }

    // Dedup by message content
    const dedupeKey = `${messageType}:${message}`
    if (S.seen.has(dedupeKey)) return
    S.seen.add(dedupeKey)
    if (S.seen.size > 5000) S.seen.clear()

    const now = Date.now()

    // Parse based on message type
    if (messageType === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
      // "Received X troops from PlayerName"
      const match = message.match(/Received\s+([\d,\.]+[KkMm]?)\s+troops from\s+(.+)$/i)
      if (match) {
        const amount = parseAmount(match[1])
        const fromName = match[2].trim()
        const fromPlayer = findPlayerByName(fromName)
        if (fromPlayer && amount > 0) {
          const r = bump(S.inbound, fromPlayer.id)
          r.troops += amount
          r.count++
          r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: "troops", name: fromName, amount })
          if (S.feedIn.length > 500) S.feedIn.shift()
          log(`✅ TRACKED RECEIVED TROOPS: ${amount} from ${fromName}`)
        }
      }
    } else if (messageType === MessageType.SENT_TROOPS_TO_PLAYER) {
      // "Sent X troops to PlayerName"
      const match = message.match(/Sent\s+([\d,\.]+[KkMm]?)\s+troops to\s+(.+)$/i)
      if (match) {
        const amount = parseAmount(match[1])
        const toName = match[2].trim()
        const toPlayer = findPlayerByName(toName)
        if (toPlayer && amount > 0) {
          const r = bump(S.outbound, toPlayer.id)
          r.troops += amount
          r.count++
          r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: "troops", name: toName, amount })
          if (S.feedOut.length > 500) S.feedOut.shift()
          log(`✅ TRACKED SENT TROOPS: ${amount} to ${toName}`)
        }
      }
    } else if (messageType === MessageType.RECEIVED_GOLD_FROM_TRADE) {
      // "Received X gold from trade with PlayerName"
      const match = message.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold from trade with\s+(.+)$/i)
      if (match) {
        const amount = msg.goldAmount ? Number(msg.goldAmount) : parseAmount(match[1])
        const fromName = match[2].trim()
        const fromPlayer = findPlayerByName(fromName)
        if (fromPlayer && amount > 0) {
          const r = bump(S.inbound, fromPlayer.id)
          r.gold += amount
          r.count++
          r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: "gold", name: fromName, amount })
          if (S.feedIn.length > 500) S.feedIn.shift()
          bumpPorts(fromPlayer.id, amount, now)
          log(`✅ TRACKED RECEIVED GOLD (TRADE): ${amount} from ${fromName}`)
        }
      }
    } else if (messageType === MessageType.RECEIVED_GOLD_FROM_PLAYER) {
      // "Received X gold from PlayerName"
      const match = message.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold from\s+(.+)$/i)
      if (match) {
        const amount = msg.goldAmount ? Number(msg.goldAmount) : parseAmount(match[1])
        const fromName = match[2].trim()
        const fromPlayer = findPlayerByName(fromName)
        if (fromPlayer && amount > 0) {
          const r = bump(S.inbound, fromPlayer.id)
          r.gold += amount
          r.count++
          r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: "gold", name: fromName, amount })
          if (S.feedIn.length > 500) S.feedIn.shift()
          log(`✅ TRACKED RECEIVED GOLD (DONATION): ${amount} from ${fromName}`)
        }
      }
    } else if (messageType === MessageType.SENT_GOLD_TO_PLAYER) {
      // "Sent X gold to PlayerName"
      const match = message.match(/Sent\s+([\d,\.]+[KkMm]?)\s+gold to\s+(.+)$/i)
      if (match) {
        const amount = msg.goldAmount ? Number(msg.goldAmount) : parseAmount(match[1])
        const toName = match[2].trim()
        const toPlayer = findPlayerByName(toName)
        if (toPlayer && amount > 0) {
          const r = bump(S.outbound, toPlayer.id)
          r.gold += amount
          r.count++
          r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: "gold", name: toName, amount })
          if (S.feedOut.length > 500) S.feedOut.shift()
          log(`✅ TRACKED SENT GOLD: ${amount} to ${toName}`)
        }
      }
    }
  }

  function parseAmount(str) {
    if (!str) return 0
    const cleaned = String(str).replace(/,/g, '')
    const match = cleaned.match(/([\d\.]+)([KkMm])?/)
    if (!match) return 0
    let value = parseFloat(match[1])
    if (match[2]) {
      const suffix = match[2].toUpperCase()
      if (suffix === 'K') value *= 1000
      else if (suffix === 'M') value *= 1000000
    }
    return Math.round(value)
  }

  function findPlayerByName(name) {
    if (!name) return null
    try {
      // Try exact match first
      let found = playersByName.get(String(name).toLowerCase())
      if (found) return { id: found.id, name: found.displayName || found.name || name }

      // Try fuzzy match
      for (const [, p] of playersById.entries()) {
        const pName = p.displayName || p.name || ''
        if (pName.toLowerCase() === name.toLowerCase()) {
          return { id: p.id, name: pName }
        }
      }
      return null
    } catch {
      return null
    }
  }

  function wrapWorker(worker) {
    if (worker.__hammerWrapped) return worker
    worker.__hammerWrapped = true

    const origPostMessage = worker.postMessage
    worker.postMessage = function patchedPostMessage(data, ...rest) {
      try {
        if (data && typeof data === "object" && data.type === "init") {
          if (data.clientID) {
            currentClientID = data.clientID
            log("Got clientID:", currentClientID)
          }
        }
      } catch {}
      return origPostMessage.call(this, data, ...rest)
    }

    worker.addEventListener("message", onWorkerMessage)
    log("Worker wrapped successfully")
    return worker
  }

  class WrappedWorker extends OriginalWorker {
    constructor(...args) {
      super(...args)
      wrapWorker(this)
    }
  }

  Object.defineProperty(window, "Worker", {
    configurable: true,
    writable: true,
    value: WrappedWorker,
  })
  console.log('[HAMMER] ✅ Worker wrapper installed')

  // ----- UI -----
  const ui = document.createElement("div")
  ui.id = "hammer-v3"
  Object.assign(ui.style, {
    position: "fixed",
    right: "14px",
    bottom: "14px",
    width: SIZES[S.sizeIdx].w + "px",
    height: SIZES[S.sizeIdx].h + "px",
    background: "#0b1220",
    color: "#e7eef5",
    font: "12px/1.35 Consolas,Menlo,monospace",
    border: "2px solid #86531f",
    borderRadius: "10px",
    zIndex: "2147483646",
    boxShadow: "0 10px 28px rgba(0,0,0,.55)",
    overflow: "hidden",
    userSelect: "none",
    resize: "both",
  })
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move">
      <div><b>HAMMER v3</b> <span style="opacity:.85">Worker Edition</span></div>
      <div class="btns" style="display:flex;gap:6px">
        <div id="hm-tabs" style="display:flex;gap:6px">
          ${["inbound", "outbound", "ports", "feed", "debug"]
            .map(
              (v) => `<button class="tab" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`
            )
            .join("")}
        </div>
        <button id="hm-size">Size ▽</button>
        <button id="hm-mini">▽</button>
        <button id="hm-pause">Pause</button>
        <button id="hm-reset" title="Clear all tallies & streams">Reset</button>
        <button id="hm-export">Export</button>
        <button id="hm-close">×</button>
      </div>
    </div>
    <div id="hm-body" style="height:${SIZES[S.sizeIdx].bodyH}px; overflow:auto; padding:10px">
      <style>
        #hammer-v3 .row{display:flex;justify-content:space-between;gap:10px}
        #hammer-v3 .plist{display:grid;grid-template-columns:1.4fr .6fr;gap:6px}
        #hammer-v3 .muted{color:#9bb0c8}
        #hammer-v3 .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-v3 .title{font-weight:700;margin:6px 0 4px}
        #hammer-v3 .box{padding:6px 8px;border:1px solid #2a3a55;border-radius:8px;background:#101a2a}
        #hammer-v3 .feed{font-feature-settings:"tnum";font-variant-numeric:tabular-nums; white-space:nowrap}
        #hammer-v3 .feed .line{display:flex;justify-content:space-between;gap:10px}
        #hammer-v3 .debug pre{white-space:pre-wrap; font: 11px/1.35 Consolas,Menlo,monospace; color:#d5e1ff; margin:0}
      </style>
      <div id="hm-content"></div>
    </div>
  `
  document.body.appendChild(ui)

  // add Tag Mates button
  try {
    const btns = ui.querySelector('.btns')
    if (btns && !ui.querySelector('#hm-tag')) {
      const tagBtn = document.createElement('button')
      tagBtn.id = 'hm-tag'
      tagBtn.title = 'Filter to tag mates'
      tagBtn.textContent = 'Tag Mates'
      const exportBtn = ui.querySelector('#hm-export')
      if (exportBtn && exportBtn.parentElement === btns) {
        btns.insertBefore(tagBtn, exportBtn)
      } else {
        btns.appendChild(tagBtn)
      }
    }
  } catch {}

  // drag
  ;(function drag() {
    const bar = ui.querySelector("#hm-head")
    let d = false,
      dx = 0,
      dy = 0
    bar.addEventListener("mousedown", (e) => {
      d = true
      dx = e.clientX - ui.offsetLeft
      dy = e.clientY - ui.offsetTop
      e.preventDefault()
    })
    addEventListener("mousemove", (e) => {
      if (!d) return
      ui.style.left = e.clientX - dx + "px"
      ui.style.top = e.clientY - dy + "px"
      ui.style.right = "auto"
      ui.style.bottom = "auto"
    })
    addEventListener("mouseup", () => (d = false))
  })()

  const bodyEl = ui.querySelector("#hm-body")
  const headEl = ui.querySelector("#hm-head")
  function applySize(nextIdx) {
    S.sizeIdx = (nextIdx + SIZES.length) % SIZES.length
    const s = SIZES[S.sizeIdx]
    ui.style.width = s.w + "px"
    ui.style.height = s.h + "px"
    bodyEl.style.height = s.bodyH + "px"
  }
  try {
    const ro = new ResizeObserver(() => {
      const h = Math.max(120, ui.clientHeight - headEl.offsetHeight - 12)
      bodyEl.style.height = h + "px"
    })
    ro.observe(ui)
  } catch {}
  function setMin(min) {
    S.minimized = min
    const tabs = ui.querySelector("#hm-tabs")
    if (min) {
      bodyEl.style.display = "none"
      tabs.style.display = "none"
      ui.style.width = "260px"
      ui.style.height = "44px"
      ui.style.background = "transparent"
      ui.style.border = "0"
      ui.style.boxShadow = "none"
      ui.querySelector("#hm-head").style.background = "#151f33"
      ui.querySelector("#hm-head").style.border = "1px solid #86531f"
    } else {
      ui.style.background = "#0b1220"
      ui.style.border = "2px solid #86531f"
      ui.style.boxShadow = "0 10px 28px rgba(0,0,0,.55)"
      bodyEl.style.display = "block"
      tabs.style.display = "flex"
      applySize(S.sizeIdx)
    }
    ui.querySelector("#hm-mini").textContent = min ? "▲" : "▽"
  }

  // controls
  ui.querySelector("#hm-close").onclick = () => {
    try { cleanup() } catch {}
    ui.remove()
  }
  ui.querySelector("#hm-size").onclick = () => applySize(S.sizeIdx + 1)
  ui.querySelector("#hm-mini").onclick = () => setMin(!S.minimized)
  ui.querySelector("#hm-pause").onclick = () => {
    S.paused = !S.paused
    ui.querySelector("#hm-pause").textContent = S.paused ? "Resume" : "Pause"
  }
  ui.querySelector("#hm-reset").onclick = () => {
    S.inbound.clear()
    S.outbound.clear()
    S.ports.clear()
    S.feedIn.length = 0
    S.feedOut.length = 0
    S.rawMessages.length = 0
    S.seen.clear()
    render()
  }
  const tagBtnRef = ui.querySelector('#hm-tag')
  if (tagBtnRef) tagBtnRef.onclick = () => {
    if (!S.filterTagMates && !S.myTag) {
      const t = prompt('Enter your tag (without brackets)')
      if (t && t.trim()) S.myTag = t.trim()
    }
    S.filterTagMates = !S.filterTagMates
    const b = ui.querySelector('#hm-tag')
    if (b) b.textContent = S.filterTagMates ? `Tag Mates${S.myTag ? ` [${S.myTag}]` : ''}` : 'Tag Mates'
    render()
  }
  ui.querySelector("#hm-export").onclick = () => {
    const obj = {
      exportedAt: new Date().toISOString(),
      myClientID: currentClientID,
      mySmallID: mySmallID,
      inbound: Object.fromEntries(S.inbound),
      outbound: Object.fromEntries(S.outbound),
      ports: Object.fromEntries(
        [...S.ports.entries()].map(([k, v]) => [
          k,
          {
            totalGold: v.totalGold,
            avgIntSec: v.avgIntSec,
            lastIntSec: v.lastIntSec,
            gpm: v.gpm,
            trades: v.times.length,
          },
        ])
      ),
      stream: {
        inbound: S.feedIn.map((x) => ({
          ts: x.ts.toISOString(),
          type: x.type,
          name: x.name,
          amount: x.amount,
        })),
        outbound: S.feedOut.map((x) => ({
          ts: x.ts.toISOString(),
          type: x.type,
          name: x.name,
          amount: x.amount,
        })),
      },
      rawMessagesSample: S.rawMessages.slice(-20),
    }
    const a = document.createElement("a")
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })
    )
    a.download = `hammer_v3_${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 800)
  }
  ui.querySelector("#hm-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab")
    if (!b) return
    S.view = b.getAttribute("data-v")
    render()
  })

  // tag helpers
  const tagOf = (name) => {
    if (!name) return null
    const m = String(name).match(/\[\s*([^\]]+?)\s*\]/)
    return m ? m[1].trim() : null
  }
  const isTagMate = (playerId) => {
    if (!S.filterTagMates || !S.myTag) return true
    const p = playersById.get(playerId)
    if (!p) return false
    const name = p.displayName || p.name || ''
    const t = tagOf(name)
    return t && t.toLowerCase() === S.myTag.toLowerCase()
  }

  // render pieces
  function rowsFromMap(map) {
    const arr = [...map.entries()]
      .filter(([id]) => isTagMate(id))
      .map(([id, v]) => {
        const p = playersById.get(id)
        const name = p ? (p.displayName || p.name || `#${id}`) : `#${id}`
        return {
          id,
          name,
          total: toNum(v.gold) + toNum(v.troops),
          gold: v.gold,
          troops: v.troops,
          count: v.count,
          last: v.last,
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 40)
    if (!arr.length) return `<span class="muted">none</span>`
    return arr
      .map(
        (r) => `
      <div class="row mono">
        <span>${esc(r.name)}</span>
        <span>${short(r.gold)}💰 ${short(r.troops)}⚔️ <span class="muted">(${r.count}×${
          r.last ? ", " + esc(fmtClock(r.last)) : ""
        })</span></span>
      </div>
    `
      )
      .join("")
  }
  function feedRows() {
    const lines = [
      ...S.feedIn.map((f) => ({ dir: "from", ...f })),
      ...S.feedOut.map((f) => ({ dir: "to", ...f })),
    ]
      .filter((e) => {
        // Filter by tag if enabled
        if (!S.filterTagMates || !S.myTag) return true
        const t = tagOf(e.name)
        return t && t.toLowerCase() === S.myTag.toLowerCase()
      })
      .sort((a, b) => b.ts - a.ts)
    if (!lines.length) return `<span class="muted">No events yet</span>`
    return lines
      .slice(0, 200)
      .map(
        (e) => `
      <div class="line"><span class="mono"><b>${short(e.amount)}</b> ${
          e.type === "gold" ? "💰" : "⚔️"
        } ${e.dir} ${esc(e.name)}</span><span class="muted">${esc(fmtClock(e.ts))}</span></div>
    `
      )
      .join("")
  }
  function portsRows() {
    const arr = [...S.ports.entries()]
      .filter(([id]) => isTagMate(id))
      .map(([id, p]) => {
        const player = playersById.get(id)
        const name = player ? (player.displayName || player.name || `#${id}`) : `#${id}`
        return {
          id,
          name,
          totalGold: p.totalGold,
          trades: p.times.length,
          avg: p.avgIntSec || 0,
          last: p.lastIntSec || 0,
          gpm: p.gpm || 0,
        }
      })
      .sort((a, b) => b.totalGold - a.totalGold)
      .slice(0, 40)
    if (!arr.length) return `<span class="muted">No port trades yet</span>`
    return arr
      .map((r) => {
        const flag =
          r.avg > 120 && r.gpm < 2000 ? ' <b style="color:#ff8b94">consider embargo</b>' : ""
        return `<div class="row mono"><span>${esc(r.name)}</span><span>${short(
          r.totalGold
        )}💰 • gpm ${short(r.gpm)} • avg ${r.avg}s • last ${r.last}s${flag}</span></div>`
      })
      .join("")
  }
  function debugPane() {
    const sample = S.rawMessages
      .slice(-20)
      .map((msg) => {
        return `Type: ${msg.messageType}, Player: ${msg.playerID}, Msg: "${msg.message}"`
      })
      .join("\n") || "No DisplayMessages captured yet.\n\nWaiting for game updates via Worker..."

    const status = `Worker Wrapper: ${window.Worker === WrappedWorker ? '✅ INSTALLED' : '❌ NOT INSTALLED'}
ClientID: ${currentClientID || 'unknown'}
MySmallID: ${mySmallID ?? 'unknown'}
Players tracked: ${playersById.size}
Messages seen: ${S.rawMessages.length}`

    return `<div class="debug">
      <div class="title">System Status</div>
      <pre>${esc(status)}</pre>
      <div class="title">Raw DisplayMessages (last 20)</div>
      <pre>${esc(sample)}</pre>
    </div>`
  }

  function render() {
    // tab highlight
    ui.querySelectorAll(".tab").forEach((b) => {
      const on = b.getAttribute("data-v") === S.view
      b.style.background = on ? "#253454" : "#0e1a2f"
      b.style.border = "1px solid #2a3a55"
      b.style.color = "#e7eef5"
      b.style.borderRadius = "10px"
      b.style.padding = "2px 8px"
    })

    let html = ""
    if (S.view === "inbound") {
      html = `<div class="title">Inbound → Me</div><div class="plist">${rowsFromMap(
        S.inbound
      )}</div>`
    } else if (S.view === "outbound") {
      html = `<div class="title">Outbound ← Me</div><div class="plist">${rowsFromMap(
        S.outbound
      )}</div>`
    } else if (S.view === "ports") {
      html = `<div class="title">Ports — received gold yield</div><div class="plist">${portsRows()}</div>
              <div class="box" style="margin-top:8px">Tip: high avg sec + low gpm => long routes; embargo or pick closer partners.</div>`
    } else if (S.view === "feed") {
      html = `<div class="title">Full stream (auto-scrolls)</div><div class="feed" id="hm-stream">${feedRows()}</div>`
    } else {
      html = debugPane()
    }
    ui.querySelector("#hm-content").innerHTML = html

    // autoscroll in Feed
    if (S.view === "feed") {
      const el = document.getElementById("hm-stream")
      if (el) bodyEl.scrollTop = 0
    }
  }

  // render tick
  const tickId = setInterval(() => {
    render()
  }, 500)

  render()

  function cleanup() {
    clearInterval(tickId)
  }

  // expose for debugging
  window.__HAMMER__ = {
    state: S,
    ui: { root: ui },
    cleanup,
    playersById,
    currentClientID,
    mySmallID,
  }

  console.log(
    "%c[HAMMER]%c v3.0 Worker Edition ready! 🔨",
    "color:#deb887;font-weight:bold",
    "color:inherit"
  )
  console.log('[HAMMER] Worker interception active - donations will be tracked automatically')
  console.log('[HAMMER] Switch to Debug tab to verify Worker wrapper is installed')
})()
