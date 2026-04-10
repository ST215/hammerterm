/**
 * HammerView — Boot sequence + live tactical dashboard.
 *
 * Phase 1: Terminal boot animation with typewriter lines
 * Phase 2: Dynamic idle effect while awaiting game signal
 * Phase 3: Live stats dashboard (stream-friendly, no sensitive controls)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { version as pkgVersion } from "../../../package.json";

// ---------------------------------------------------------------------------
// Boot sequence lines
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

const LINE_DELAY_MS = 160;
const BOOT_TOTAL_MS = BOOT_LINES.length * LINE_DELAY_MS + 600;

// ---------------------------------------------------------------------------
// Matrix rain characters (for idle effect)
// ---------------------------------------------------------------------------

const MATRIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*<>{}[]|/\\";
const COLUMNS = 40;
const ROWS = 12;

function randomChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

/** Generates a grid of random characters that shifts over time. */
function useMatrixGrid(active: boolean): string[][] {
  const [grid, setGrid] = useState<string[][]>(() =>
    Array.from({ length: ROWS }, () =>
      Array.from({ length: COLUMNS }, () => randomChar()),
    ),
  );
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      frameRef.current++;
      setGrid((prev) => {
        const next = prev.map((row) => [...row]);
        // Mutate ~15% of cells per frame for a flowing effect
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLUMNS; c++) {
            if (Math.random() < 0.15) {
              next[r][c] = randomChar();
            }
          }
        }
        return next;
      });
    }, 120); // ~8fps — smooth enough, no perf hit
    return () => clearInterval(id);
  }, [active]);

  return grid;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HammerView() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [bootDone, setBootDone] = useState(false);

  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);

  const hasSignal = playerDataReady && !!me;
  const showIdle = bootDone && !hasSignal;
  const showDashboard = bootDone && hasSignal;
  const matrixGrid = useMatrixGrid(showIdle);

  // Boot: reveal lines one at a time
  useEffect(() => {
    setVisibleLines(0);
    setBootDone(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < BOOT_LINES.length; i++) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), (i + 1) * LINE_DELAY_MS));
    }
    timers.push(setTimeout(() => setBootDone(true), BOOT_TOTAL_MS));
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

  const handleGoExternal = () => {
    setDisplayMode("window");
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  };

  return (
    <div className="relative font-mono select-none" style={{ minHeight: 320 }}>
      {/* ── BOOT SEQUENCE ── */}
      <div style={{ minHeight: bootDone && hasSignal ? 0 : undefined }}>
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

      {/* ── IDLE: Matrix rain effect while waiting for game signal ── */}
      {showIdle && (
        <div className="mt-3 animate-fade-in">
          <div
            className="overflow-hidden rounded"
            style={{
              background: "rgba(0,0,0,0.3)",
              padding: "8px 6px",
              lineHeight: "14px",
              fontSize: 11,
              letterSpacing: "2px",
            }}
          >
            {matrixGrid.map((row, r) => (
              <div key={r} className="whitespace-nowrap" style={{ height: 14 }}>
                {row.map((ch, c) => {
                  // Create depth: bright leading edge, dim trail
                  const brightness = Math.random();
                  const color = brightness > 0.92
                    ? "rgba(127, 242, 163, 0.9)"  // bright green
                    : brightness > 0.7
                      ? "rgba(127, 242, 163, 0.4)" // medium
                      : brightness > 0.4
                        ? "rgba(127, 242, 163, 0.15)" // dim
                        : "rgba(127, 242, 163, 0.05)"; // ghost
                  return (
                    <span key={c} style={{ color }}>{ch}</span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="text-2xs text-hammer-dim mt-2 text-center animate-fade-in">
            Scanning for active game session...
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

          {/* Go External */}
          {displayMode === "overlay" && (
            <button
              onClick={handleGoExternal}
              className="w-full px-3 py-2 text-xs font-bold font-mono border border-hammer-green/30 bg-hammer-green/5 text-hammer-green rounded cursor-pointer hover:bg-hammer-green/15 transition-colors"
            >
              OPEN COMMAND CENTER
            </button>
          )}
        </div>
      )}
    </div>
  );
}
