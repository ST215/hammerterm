/**
 * HammerView — Boot sequence + live stats dashboard.
 *
 * Phase 1: Military-themed terminal boot animation (CSS typewriter, ~3s)
 * Phase 2: Live stats dashboard (stream-friendly, no sensitive controls)
 *
 * Designed for screen shares — no automation features exposed.
 */

import { useState, useEffect } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { version as pkgVersion } from "../../../package.json";

const BOOT_LINES = [
  `> HAMMER TERMINAL v${pkgVersion}`,
  "> LOADING KERNEL..............OK",
  "> SCANNING FREQUENCIES........OK",
  "> TACTICAL ARRAY ONLINE.......OK",
  "> COMMS RELAY INITIALIZED.....OK",
  "> THREAT MATRIX CALIBRATED....OK",
  "> SIGNAL ENCRYPTION ACTIVE....OK",
];

const LINE_DELAY_MS = 180;
const BOOT_DURATION_MS = BOOT_LINES.length * LINE_DELAY_MS + 800;

export default function HammerView() {
  const [bootDone, setBootDone] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);

  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);

  // Boot sequence: reveal lines one at a time
  useEffect(() => {
    setVisibleLines(0);
    setBootDone(false);

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < BOOT_LINES.length; i++) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), (i + 1) * LINE_DELAY_MS));
    }
    timers.push(setTimeout(() => setBootDone(true), BOOT_DURATION_MS));

    return () => timers.forEach(clearTimeout);
  }, []); // Runs once on mount

  const myName = me?.displayName || me?.name || "---";
  const myTeam = me?.team ?? "---";
  const troops = dTroops(me?.troops);
  const gold = Number(me?.gold ?? 0);
  const tiles = me?.tilesOwned ?? 0;
  const maxT = me ? estimateMaxTroops(tiles, me.smallID ?? 0, cityLevelSumByOwner) : 0;
  const pctOfMax = maxT > 0 ? (Number(me?.troops || 0) / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(Number(me?.troops || 0), maxT) : 0;
  const displayGrowth = dTroops(Math.round(growthSec));
  const atPeak = pctOfMax >= (OPTIMAL_REGEN_PCT * 100 - 5) && pctOfMax <= (OPTIMAL_REGEN_PCT * 100 + 5);

  const handleGoExternal = () => {
    setDisplayMode("window");
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  };

  return (
    <div className="relative overflow-hidden" style={{ minHeight: 300 }}>
      {/* Scanline overlay — sweeps once after boot */}
      {visibleLines >= BOOT_LINES.length && !bootDone && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            height: 2,
            background: "linear-gradient(90deg, transparent, rgba(127, 242, 163, 0.6), transparent)",
            animation: "scanline 1.5s ease-out forwards",
            zIndex: 10,
          }}
        />
      )}

      {/* Phase 1: Boot sequence */}
      <div className="font-mono" style={{ minHeight: bootDone ? 0 : 200 }}>
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className="text-2xs overflow-hidden whitespace-nowrap"
            style={{
              color: line.endsWith("OK") ? "var(--color-hammer-green)" : "var(--color-hammer-muted)",
              animation: `typewriter 0.6s steps(${line.length}, end) forwards`,
              maxWidth: 0,
            }}
          >
            {line}
          </div>
        ))}

        {/* Separator + OPERATIONAL */}
        {visibleLines >= BOOT_LINES.length && (
          <>
            <div
              className="text-2xs text-hammer-border mt-0.5 animate-fade-in"
              style={{ letterSpacing: -1 }}
            >
              {"━".repeat(46)}
            </div>
            <div
              className="text-xs font-bold mt-1 animate-fade-in"
              style={{
                color: "var(--color-hammer-green)",
                animation: "glow-text 2s ease-in-out infinite",
              }}
            >
              ALL SYSTEMS OPERATIONAL
            </div>
          </>
        )}
      </div>

      {/* Phase 2: Live stats dashboard (after boot) */}
      {bootDone && (
        <div className="mt-4 animate-fade-in">
          {/* Player identity */}
          <div className="mb-3">
            <div
              className="text-xl font-bold"
              style={{
                color: "var(--color-hammer-green)",
                animation: "glow-text 3s ease-in-out infinite",
              }}
            >
              {playerDataReady ? myName : "AWAITING SIGNAL..."}
            </div>
            {playerDataReady && (
              <div className="text-2xs text-hammer-muted mt-0.5">
                Team {String(myTeam)} {"\u00B7"} {comma(tiles)} territories
              </div>
            )}
          </div>

          {playerDataReady && (
            <>
              {/* Troop capacity bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-2xs mb-0.5">
                  <span className="text-hammer-muted">FORCE STRENGTH</span>
                  <span className="text-hammer-text font-bold">
                    {comma(troops)}
                    <span className="text-hammer-dim font-normal ml-1">/ {short(dTroops(maxT))}</span>
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
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
                  <span className="text-hammer-green">
                    +{short(displayGrowth)}/s
                  </span>
                </div>
              </div>

              {/* Gold */}
              <div className="flex items-center justify-between text-2xs mb-3">
                <span className="text-hammer-muted">TREASURY</span>
                <span className="text-hammer-gold font-bold">{comma(gold)} gold</span>
              </div>

              {/* Separator */}
              <div className="border-t border-hammer-border-subtle mb-3" />

              {/* Go External button (overlay mode only) */}
              {displayMode === "overlay" && (
                <button
                  onClick={handleGoExternal}
                  className="w-full px-3 py-1.5 text-xs font-bold font-mono border border-hammer-green/30 bg-hammer-green/5 text-hammer-green rounded cursor-pointer hover:bg-hammer-green/15 transition-colors"
                >
                  OPEN COMMAND CENTER
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
