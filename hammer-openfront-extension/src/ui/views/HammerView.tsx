/**
 * HammerView — Boot sequence + immersive idle + live tactical dashboard.
 *
 * Phase 1: Terminal boot animation
 * Phase 2: MARS command feed — themed war dispatches while awaiting signal
 * Phase 3: Live stats dashboard (stream-friendly)
 */

import { useState, useEffect, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { version as pkgVersion } from "../../../package.json";

// ---------------------------------------------------------------------------
// Boot lines
// ---------------------------------------------------------------------------

const BOOT_LINES = [
  `HAMMER TERMINAL v${pkgVersion}`,
  "LOADING KERNEL..............OK",
  "SCANNING FREQUENCIES........OK",
  "TACTICAL ARRAY ONLINE.......OK",
  "COMMS RELAY INITIALIZED.....OK",
  "THREAT MATRIX CALIBRATED....OK",
  "SIGNAL ENCRYPTION ACTIVE....OK",
  "INTELLIGENCE CORE READY.....OK",
];

const LINE_DELAY = 160;
const BOOT_TOTAL = BOOT_LINES.length * LINE_DELAY + 600;

// ---------------------------------------------------------------------------
// War dispatches — themed messages for the idle feed
// ---------------------------------------------------------------------------

const DISPATCHES = [
  "[MARS] FORWARD OPERATING BASE ESTABLISHED",
  "[MARS] RECON DIVISION MAPPING COASTAL ROUTES",
  "[MARS] GOLD RESERVES SECURED AT NORTHERN VAULT",
  "[MARS] NAVAL FLEET ASSEMBLED --- AWAITING ORDERS",
  "[MARS] TROOP REINFORCEMENTS EN ROUTE TO FRONT LINE",
  "[MARS] ALLIED SUPPLY CHAIN CONFIRMED OPERATIONAL",
  "[MARS] THREAT ASSESSMENT: EASTERN BORDER CONTESTED",
  "[MARS] DIPLOMATIC CHANNEL OPEN --- ALLIANCES FORMING",
  "[MARS] TERRITORIAL EXPANSION: PHASE 2 AUTHORIZED",
  "[MARS] ARTILLERY COORDINATES LOCKED --- STANDING BY",
  "[MARS] RESOURCE PIPELINE ONLINE --- GOLD FLOWING",
  "[MARS] COUNTER-INTELLIGENCE SWEEP COMPLETE",
  "[MARS] WARSHIP PRODUCTION ACCELERATED",
  "[MARS] FRONTLINE COMMANDERS REPORT: ALL CLEAR",
  "[MARS] STRATEGIC RESERVE DEPLOYED TO SECTOR 7",
  "[MARS] INTERCEPTED TRANSMISSION --- DECODING",
  "[MARS] EMBARGO PROTOCOLS ENGAGED ON HOSTILE TRADE",
  "[MARS] LONG-RANGE RECON: NEW TERRITORY IDENTIFIED",
  "[MARS] FIELD MEDICS DISPATCHED TO ALLIED FORCES",
  "[MARS] COMMAND OVERRIDE: MAXIMIZE TROOP OUTPUT",
  "[MARS] NAVAL BLOCKADE ESTABLISHED --- CHOKEPOINT HELD",
  "[MARS] INTELLIGENCE REPORT: ENEMY STRENGTH DECLINING",
  "[MARS] ALLIED VICTORY CONFIRMED IN WESTERN THEATRE",
  "[MARS] REINFORCEMENT WAVE INCOMING --- 30 SECONDS",
  "[MARS] GOLD SHIPMENT INTERCEPTED --- REROUTING",
  "[MARS] FORWARD SCOUTS REPORT: UNDEFENDED COASTLINE",
  "[MARS] ORBITAL SCAN COMPLETE --- MAP UPDATED",
  "[MARS] SIEGE ENGINES ASSEMBLED --- TARGET ACQUIRED",
  "[MARS] COMMUNICATIONS ENCRYPTED --- CHANNEL SECURE",
  "[MARS] DOMINION EXPANDING --- RESISTANCE CRUMBLING",
];

function randomDispatch(exclude: string): string {
  let msg: string;
  do { msg = DISPATCHES[Math.floor(Math.random() * DISPATCHES.length)]; } while (msg === exclude);
  return msg;
}

// ---------------------------------------------------------------------------
// Idle feed hook
// ---------------------------------------------------------------------------

interface FeedLine {
  id: number;
  ts: string;
  text: string;
}

function useDispatchFeed(active: boolean): FeedLine[] {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const counter = useRef(0);
  const lastMsg = useRef("");

  useEffect(() => {
    if (!active) { setLines([]); return; }

    // Seed 3 initial lines
    const seed: FeedLine[] = [];
    for (let i = 0; i < 3; i++) {
      const msg = randomDispatch(lastMsg.current);
      lastMsg.current = msg;
      seed.push({ id: counter.current++, ts: fmtTime(), text: msg });
    }
    setLines(seed);

    // Add a new line every 2.5s
    const id = setInterval(() => {
      const msg = randomDispatch(lastMsg.current);
      lastMsg.current = msg;
      setLines((prev) => [...prev.slice(-14), { id: counter.current++, ts: fmtTime(), text: msg }]);
    }, 2500);

    return () => clearInterval(id);
  }, [active]);

  return lines;
}

function fmtTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function pad2(n: number): string { return n < 10 ? "0" + n : String(n); }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HammerView() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [bootDone, setBootDone] = useState(false);

  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const externalOpen = useStore((s) => s.externalOpen);
  const setExternalOpen = useStore((s) => s.setExternalOpen);
  const tabsRevealed = useStore((s) => s.tabsRevealed);
  const setTabsRevealed = useStore((s) => s.setTabsRevealed);

  const hasSignal = playerDataReady && !!me;
  const showIdle = bootDone && !hasSignal;
  const showDashboard = bootDone && hasSignal;
  const feedLines = useDispatchFeed(showIdle);

  // Boot animation
  useEffect(() => {
    setVisibleLines(0);
    setBootDone(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < BOOT_LINES.length; i++) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), (i + 1) * LINE_DELAY));
    }
    timers.push(setTimeout(() => setBootDone(true), BOOT_TOTAL));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Stats
  const myName = me?.displayName || me?.name || "";
  const myTeam = me?.team ?? "";
  const troops = dTroops(me?.troops);
  const gold = Number(me?.gold ?? 0);
  const tiles = me?.tilesOwned ?? 0;
  const maxT = me ? estimateMaxTroops(tiles, me.smallID ?? 0, cityLevelSumByOwner) : 0;
  const rawTroops = Number(me?.troops || 0);
  const pctOfMax = maxT > 0 ? (rawTroops / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(rawTroops, maxT) : 0;
  const displayGrowth = dTroops(Math.round(growthSec));
  const atPeak = pctOfMax >= (OPTIMAL_REGEN_PCT * 100 - 5) && pctOfMax <= (OPTIMAL_REGEN_PCT * 100 + 5);

  // Reveal the in-browser tabs (still hidden behind a click for stream paranoia)
  const handleRevealTabs = () => setTabsRevealed(true);

  // Open in a separate browser window (popup has its own gate)
  const handleLaunchExternal = () => {
    setExternalOpen(true);
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  };

  return (
    <div className="relative font-mono select-none" style={{ minHeight: 320 }}>

      {/* ── BOOT SEQUENCE ── */}
      <div>
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className="text-2xs overflow-hidden whitespace-nowrap"
            style={{
              color: i === 0 ? "var(--color-hammer-green)" : "var(--color-hammer-muted)",
              fontWeight: i === 0 ? 600 : 400,
              animation: `typewriter 0.5s steps(${line.length}, end) forwards`,
              maxWidth: 0,
            }}
          >
            {"> "}{line}
          </div>
        ))}

        {visibleLines >= BOOT_LINES.length && (
          <>
            <div className="text-hammer-border-subtle text-2xs mt-0.5 animate-fade-in" style={{ letterSpacing: -1 }}>
              {"━".repeat(48)}
            </div>
            <div
              className="text-sm font-bold mt-1 animate-fade-in"
              style={{ color: "var(--color-hammer-green)", animation: "glow-text 2s ease-in-out infinite" }}
            >
              {hasSignal ? "ALL SYSTEMS OPERATIONAL" : "AWAITING SIGNAL..."}
            </div>
          </>
        )}
      </div>

      {/* ── IDLE: War dispatch feed ── */}
      {showIdle && (
        <div className="mt-3 animate-fade-in">
          {/* MARS header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(127,242,163,0.3), transparent)" }} />
            <span className="text-2xs text-hammer-green font-bold tracking-widest">MARS COMMAND FEED</span>
            <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, rgba(127,242,163,0.3), transparent)" }} />
          </div>

          {/* Dispatch lines */}
          <div
            className="overflow-hidden rounded"
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(127, 242, 163, 0.08)",
              padding: "6px 10px",
            }}
          >
            {feedLines.map((line) => (
              <div
                key={line.id}
                className="text-2xs py-px animate-fade-in flex gap-2"
              >
                <span className="text-hammer-dim shrink-0">{line.ts}</span>
                <span style={{
                  color: line.text.includes("VICTORY") || line.text.includes("DOMINION")
                    ? "var(--color-hammer-green)"
                    : line.text.includes("THREAT") || line.text.includes("ENEMY") || line.text.includes("INTERCEPTED")
                      ? "var(--color-hammer-warn)"
                      : line.text.includes("GOLD") || line.text.includes("RESOURCE")
                        ? "var(--color-hammer-gold)"
                        : line.text.includes("NAVAL") || line.text.includes("WARSHIP") || line.text.includes("FLEET")
                          ? "var(--color-hammer-blue)"
                          : "var(--color-hammer-text)",
                }}>
                  {line.text}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom status line */}
          <div className="flex items-center justify-between text-2xs mt-2">
            <span className="text-hammer-dim">Scanning for active game session...</span>
            <span className="text-hammer-green" style={{ animation: "glow-text 1.5s ease-in-out infinite" }}>
              STANDBY
            </span>
          </div>
        </div>
      )}

      {/* ── LIVE DASHBOARD ── */}
      {showDashboard && (
        <div className="mt-3 animate-fade-in">
          {/* Player identity */}
          <div className="mb-3">
            <div
              className="text-xl font-bold"
              style={{ color: "var(--color-hammer-green)", animation: "glow-text 3s ease-in-out infinite" }}
            >
              {myName}
            </div>
            <div className="text-2xs text-hammer-muted mt-0.5">
              Team {String(myTeam)} {"\u00B7"} {comma(tiles)} territories
            </div>
          </div>

          {/* Troop capacity */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-2xs mb-0.5">
              <span className="text-hammer-muted uppercase tracking-wider">Force Strength</span>
              <span className="text-hammer-text font-bold">
                {comma(troops)}
                <span className="text-hammer-dim font-normal ml-1">/ {short(dTroops(maxT))}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, pctOfMax)}%`,
                  background: atPeak
                    ? "linear-gradient(90deg, #7ff2a3, #4ecdc4)"
                    : pctOfMax > 50
                      ? "linear-gradient(90deg, #7bb8ff, #7ff2a3)"
                      : "linear-gradient(90deg, #f0a040, #ffcf5d)",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-2xs mt-0.5">
              <span className={atPeak ? "text-hammer-green font-bold" : "text-hammer-dim"}>
                {atPeak ? "PEAK REGEN" : `${Math.round(pctOfMax)}% capacity`}
              </span>
              <span className="text-hammer-green font-bold">+{short(displayGrowth)}/s</span>
            </div>
          </div>

          {/* Gold */}
          <div className="flex items-center justify-between text-2xs mb-3">
            <span className="text-hammer-muted uppercase tracking-wider">Treasury</span>
            <span className="text-hammer-gold font-bold">{comma(gold)} gold</span>
          </div>

          <div className="border-t border-hammer-border-subtle mb-3" />

          {/* Inconspicuous control bar — looks like a status footer.
              Two equal-width buttons: reveal in-browser controls, launch external. */}
          <div className="flex items-center justify-between gap-2 text-2xs">
            {!tabsRevealed ? (
              <button
                onClick={handleRevealTabs}
                className="flex-1 px-2 py-1 text-2xs font-mono border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-green hover:border-hammer-green/40 rounded cursor-pointer transition-colors"
                title="Show controls"
              >
                _
              </button>
            ) : (
              <span className="flex-1 text-2xs text-hammer-dim text-center">
                {">"} controls visible
              </span>
            )}
            {!externalOpen ? (
              <button
                onClick={handleLaunchExternal}
                className="flex-1 px-2 py-1 text-2xs font-mono border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-blue hover:border-hammer-blue/40 rounded cursor-pointer transition-colors"
                title="Launch in external window"
              >
                {"->"}
              </button>
            ) : (
              <span className="flex-1 text-2xs text-hammer-dim text-center">
                {">"} external open
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
