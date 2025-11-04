// =====================
// HAMMER — ME STREAM v2.2 (messages-only; safe single-file; debug viewer)
// Tabs: Inbound | Outbound | Ports | Feed | Debug
// Controls: Size ▽ | Minimize ▽ | Pause | Reset | Export | ×
// =====================
;(() => {
  // ----- hard reset any prior instance -----
  if (window.__HAMMER_ME__?.ui?.root) {
    try {
      window.__HAMMER_ME__.obs?.disconnect()
    } catch {}
    try {
      window.__HAMMER_ME__.ui.root.remove()
    } catch {}
    try {
      clearInterval(window.__HAMMER_ME__.tickId)
    } catch {}
    delete window.__HAMMER_ME__
  }

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
  const parseHuman = (txt) => {
    const m = String(txt || "")
      .replace(/[, ]/g, "")
      .match(/^([\d.]+)([kKmM])?$/)
    if (!m) return NaN
    let n = Number(m[1])
    if (m[2]) n *= m[2].toLowerCase() === "m" ? 1_000_000 : 1_000
    return Math.round(n)
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

    // de-dup of raw lines
    seen: new Set(),

    // aggregations keyed by player name (string as printed)
    inbound: new Map(), // name -> { gold,troops,count,last }
    outbound: new Map(), // name -> { gold,troops,count,last }
    ports: new Map(), // name -> { totalGold, times[], avgIntSec, lastIntSec, gpm }

    // streams
    feedIn: [], // {ts,type,name,amount,text}
    feedOut: [], // {ts,type,name,amount,text}
    rawLines: [], // last ~400 raw lines, newest last
  }

  function bump(map, key) {
    if (!map.has(key)) map.set(key, { gold: 0, troops: 0, count: 0, last: null })
    return map.get(key)
  }
  function bumpPorts(name, gold, t) {
    if (!S.ports.has(name))
      S.ports.set(name, { totalGold: 0, times: [], avgIntSec: 0, lastIntSec: 0, gpm: 0 })
    const p = S.ports.get(name)
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

  // ----- UI -----
  const ui = document.createElement("div")
  ui.id = "hammer-me"
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
    zIndex: "999999",
    boxShadow: "0 10px 28px rgba(0,0,0,.55)",
    overflow: "hidden",
    userSelect: "none",
    resize: "both",
  })
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move">
      <div><b>HAMMER</b> <span style="opacity:.85">ME Stream</span></div>
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
        #hammer-me .row{display:flex;justify-content:space-between;gap:10px}
        #hammer-me .plist{display:grid;grid-template-columns:1.4fr .6fr;gap:6px}
        #hammer-me .muted{color:#9bb0c8}
        #hammer-me .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-me .title{font-weight:700;margin:6px 0 4px}
        #hammer-me .box{padding:6px 8px;border:1px solid #2a3a55;border-radius:8px;background:#101a2a}
        #hammer-me .feed{font-feature-settings:"tnum";font-variant-numeric:tabular-nums; white-space:nowrap}
        #hammer-me .feed .line{display:flex;justify-content:space-between;gap:10px}
        #hammer-me .debug pre{white-space:pre-wrap; font: 11px/1.35 Consolas,Menlo,monospace; color:#d5e1ff; margin:0}
      </style>
      <div id="hm-content"></div>
    </div>
  `
  document.body.appendChild(ui)

  // add Tag Mates button programmatically (avoids touching template)
  try {
    const btns = ui.querySelector('.btns')
    if (btns && !ui.querySelector('#hm-tag')) {
      const tagBtn = document.createElement('button')
      tagBtn.id = 'hm-tag'
      tagBtn.title = 'Filter to tag mates'
      tagBtn.textContent = 'Tag Mates'
      // insert before Export button if present, else append
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
  // keep body height synced when user resizes
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
    try {
      obs.disconnect()
    } catch {}
    clearInterval(tickId)
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
    S.rawLines.length = 0
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
          text: x.text,
        })),
        outbound: S.feedOut.map((x) => ({
          ts: x.ts.toISOString(),
          type: x.type,
          name: x.name,
          amount: x.amount,
          text: x.text,
        })),
      },
      rawSample: S.rawLines.slice(-80),
    }
    const a = document.createElement("a")
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })
    )
    a.download = `hammer_me_stream_${new Date().toISOString().replace(/[:.]/g, "-")}.json`
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
  const isTagMate = (name) => {
    if (!S.filterTagMates || !S.myTag) return true
    const t = tagOf(name)
    return t && t.toLowerCase() === S.myTag.toLowerCase()
  }

  // render pieces
  function rowsFromMap(map) {
    const arr = [...map.entries()].filter(([name]) => isTagMate(name))
      .map(([name, v]) => ({
        name,
        total: toNum(v.gold) + toNum(v.troops),
        gold: v.gold,
        troops: v.troops,
        count: v.count,
        last: v.last,
      }))
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
    ].filter((e) => isTagMate(e.name)).sort((a, b) => b.ts - a.ts)
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
    const arr = [...S.ports.entries()].filter(([name]) => isTagMate(name))
      .map(([name, p]) => ({
        name,
        totalGold: p.totalGold,
        trades: p.times.length,
        avg: p.avgIntSec || 0,
        last: p.lastIntSec || 0,
        gpm: p.gpm || 0,
      }))
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
    const sample =
      S.rawLines
        .slice(-80)
        .map((s) => "• " + s)
        .join("\n") ||
      "No lines captured yet.\nIf you see zero lines after sending/receiving, the game may render messages on a canvas (not as DOM text)."
    return `<div class="debug"><div class="title">Raw message lines (tail)</div><pre>${esc(
      sample
    )}</pre></div>`
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

  // ----- message parser -----
  function recordRaw(text) {
    if (!text) return
    // split into lines and keep tail small
    const lines = String(text)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
    for (const ln of lines) {
      S.rawLines.push(ln)
      if (S.rawLines.length > 400) S.rawLines.splice(0, S.rawLines.length - 400)
    }
  }

  function handleLine(line) {
    if (!line) return
    const key = "L:" + line
    if (S.seen.has(key)) return
    S.seen.add(key)
    if (S.seen.size > 8000) S.seen.clear() // bounded

    if (S.paused) return

    let m

    // Inbound troops
    m = /^Received\s+([\d.,kKmM]+)\s+troops\s+from\s+(.+)$/.exec(line)
    if (m) {
      const amt = parseHuman(m[1])
      const name = m[2].trim()
      const r = bump(S.inbound, name)
      r.troops += amt
      r.count++
      r.last = nowDate()
      S.feedIn.push({ ts: nowDate(), type: "troops", name, amount: amt, text: line })
      if (S.feedIn.length > 500) S.feedIn.splice(0, S.feedIn.length - 500)
      return
    }

    // Outbound troops
    m = /^Sent\s+([\d.,kKmM]+)\s+troops\s+to\s+(.+)$/.exec(line)
    if (m) {
      const amt = parseHuman(m[1])
      const name = m[2].trim()
      const r = bump(S.outbound, name)
      r.troops += amt
      r.count++
      r.last = nowDate()
      S.feedOut.push({ ts: nowDate(), type: "troops", name, amount: amt, text: line })
      if (S.feedOut.length > 500) S.feedOut.splice(0, S.feedOut.length - 500)
      return
    }

    // Inbound gold (port trade)
    m = /^Received\s+([\d.,kKmM]+)\s+gold\s+from\s+trade\s+with\s+(.+)$/.exec(line)
    if (m) {
      const amt = parseHuman(m[1])
      const name = m[2].trim()
      const r = bump(S.inbound, name)
      r.gold += amt
      r.count++
      r.last = nowDate()
      S.feedIn.push({ ts: nowDate(), type: "gold", subtype: "trade", name, amount: amt, text: line })
      if (S.feedIn.length > 500) S.feedIn.splice(0, S.feedIn.length - 500)
      bumpPorts(name, amt, nowDate())
      return
    }

    // Outbound gold (if your client shows it)
    m = /^Sent\s+([\d.,kKmM]+)\s+gold\s+to\s+(.+)$/.exec(line)
    if (m) {
      const amt = parseHuman(m[1])
      const name = m[2].trim()
      const r = bump(S.outbound, name)
      r.gold += amt
      r.count++
      r.last = nowDate()
      S.feedOut.push({ ts: nowDate(), type: "gold", subtype: "sent", name, amount: amt, text: line })
      if (S.feedOut.length > 500) S.feedOut.splice(0, S.feedOut.length - 500)
      return
    }
  }

  const obs = new MutationObserver((mutList) => {
    try {
      // gather a small tail of changed text
      const chunks = []
      for (const mut of mutList) {
        for (const n of mut.addedNodes || []) {
          if (n.nodeType === 3) {
            const t = n.textContent.trim()
            if (t) chunks.push(t)
          } else if (n.nodeType === 1) {
            const t = n.textContent
            if (t) chunks.push(t.trim())
          }
        }
        if (mut.target && mut.target.nodeType === 1 && mut.target.textContent) {
          chunks.push(mut.target.textContent.trim())
        }
      }
      const tail = chunks
        .join("\n")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-30)
      if (tail.length) recordRaw(tail.join("\n"))
      tail.forEach(handleLine)
    } catch (e) {
      // keep running even if a node is weird
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })

  // render tick (for autoscroll; cheap)
  const tickId = setInterval(() => {
    render()
  }, 500)

  render()

  // expose for future tweaks
  window.__HAMMER_ME__ = { state: S, ui: { root: ui }, obs, tickId }

  console.log(
    "%c[HAMMER]%c ME Stream v2.2 ready (messages-only).",
    "color:#deb887;font-weight:bold",
    "color:inherit"
  )
})()
