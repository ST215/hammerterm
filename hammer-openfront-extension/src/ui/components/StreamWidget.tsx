/**
 * StreamWidget — Floating tactical display for streaming.
 *
 * Shown on the game page when dashboard is in external window mode.
 * Draggable, minimizable, with back-to-overlay control.
 * Shows: my stats, team stats, enemy intel, growth indicator.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { getTeamStats, type TeamStats } from "@shared/logic/player-helpers";

export default function StreamWidget() {
  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const myTeam = useStore((s) => s.myTeam);
  const setDisplayMode = useStore((s) => s.setDisplayMode);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState(() => ({
    left: 16,
    top: Math.max(60, Math.round(window.innerHeight / 2 - 220)),
  }));
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      dragOffset.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
      e.preventDefault();
    },
    [pos.left, pos.top],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ left: e.clientX - dragOffset.current.x, top: e.clientY - dragOffset.current.y });
    };
    const onMouseUp = () => { dragging.current = false; };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const teamData = useMemo(() => {
    const pMap = useStore.getState().playersById;
    return getTeamStats(pMap, cityLevelSumByOwner);
  }, [me]);

  const handleBackToOverlay = useCallback(() => {
    setDisplayMode("overlay");
    chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" });
  }, [setDisplayMode]);

  if (!playerDataReady || !me) return null;

  const myName = me.displayName || me.name || "---";
  const troops = dTroops(me.troops);
  const gold = Number(me.gold ?? 0);
  const tiles = me.tilesOwned ?? 0;
  const maxT = estimateMaxTroops(tiles, me.smallID ?? 0, cityLevelSumByOwner);
  const rawTroops = Number(me.troops || 0);
  const pctOfMax = maxT > 0 ? (rawTroops / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(rawTroops, maxT) : 0;
  const displayGrowth = dTroops(Math.round(growthSec));
  const optPct = OPTIMAL_REGEN_PCT * 100;
  const atPeak = pctOfMax >= optPct - 5 && pctOfMax <= optPct + 5;
  const abovePeak = pctOfMax > optPct + 5;

  const myTeamStats = myTeam != null ? teamData.get(myTeam) : null;

  const enemyTeams = useMemo(() => {
    const enemies: TeamStats[] = [];
    for (const [team, stats] of teamData) {
      if (team === myTeam) continue;
      if (stats.alive === 0) continue;
      enemies.push(stats);
    }
    return enemies.sort((a, b) => b.troops - a.troops).slice(0, 4);
  }, [teamData, myTeam]);

  // Growth status badge
  const growthBadge = atPeak
    ? { label: "PEAK", color: "#7ff2a3", bg: "rgba(127,242,163,0.15)" }
    : abovePeak
      ? { label: `${Math.round(pctOfMax)}%`, color: "#7bb8ff", bg: "rgba(123,184,255,0.12)" }
      : { label: `${Math.round(pctOfMax)}%`, color: "#f0a040", bg: "rgba(240,160,64,0.12)" };

  return (
    <div
      className="fixed font-mono"
      style={{
        left: pos.left,
        top: pos.top,
        width: minimized ? 220 : 340,
        background: "linear-gradient(135deg, rgba(11, 18, 32, 0.97), rgba(22, 34, 54, 0.94))",
        backdropFilter: "blur(14px)",
        borderRadius: 10,
        border: "1px solid rgba(123, 184, 255, 0.12)",
        padding: minimized ? "6px 12px" : "12px 16px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
        zIndex: 2147483647,
        transition: "width 0.2s ease",
      }}
    >
      {/* Header — always visible, draggable */}
      <div
        className="flex items-center justify-between select-none"
        style={{ cursor: "move" }}
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold"
            style={{ color: "var(--color-hammer-green)", animation: "glow-text 3s ease-in-out infinite" }}
          >
            {myName}
          </span>
          {/* Growth badge — always visible, even when minimized */}
          <span
            className="text-2xs font-bold px-1.5 py-px rounded"
            style={{ color: growthBadge.color, background: growthBadge.bg }}
          >
            {growthBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized((m) => !m)}
            className="text-2xs text-hammer-dim hover:text-hammer-text cursor-pointer bg-transparent border-none font-mono"
            title={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? "\u25B2" : "\u25BC"}
          </button>
          <button
            onClick={handleBackToOverlay}
            className="text-2xs text-hammer-dim hover:text-hammer-green cursor-pointer bg-transparent border-none font-mono"
            title="Back to overlay mode"
          >
            \u2612
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {!minimized && (
        <div className="mt-2">
          {/* Team + territory */}
          <div className="text-2xs text-hammer-dim mb-2">
            Team {String(myTeam ?? "---")} {"\u00B7"} {comma(tiles)} tiles
          </div>

          {/* My stats */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-2xs mb-0.5">
              <span className="text-hammer-muted">FORCE</span>
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
                {atPeak ? "PEAK REGEN" : abovePeak ? "READY" : "CHARGING"}
              </span>
              <span className="text-hammer-green font-bold">+{short(displayGrowth)}/s</span>
            </div>

            <div className="flex items-center justify-between text-2xs mt-1">
              <span className="text-hammer-muted">GOLD</span>
              <span className="text-hammer-gold font-bold">{comma(gold)}</span>
            </div>
          </div>

          {/* My team stats */}
          {myTeamStats && (
            <>
              <div className="h-px mb-2" style={{ background: "rgba(127, 242, 163, 0.12)" }} />
              <div className="text-2xs text-hammer-green font-bold mb-1.5 tracking-wider">MY TEAM</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs mb-2">
                <div className="flex justify-between">
                  <span className="text-hammer-dim">Players</span>
                  <span className="text-hammer-text font-bold">{myTeamStats.alive}<span className="text-hammer-dim font-normal">/{myTeamStats.players}</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hammer-dim">Troops</span>
                  <span className="text-hammer-blue font-bold">{short(dTroops(myTeamStats.troops))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hammer-dim">Gold</span>
                  <span className="text-hammer-gold font-bold">{short(myTeamStats.gold)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hammer-dim">Cities</span>
                  <span className="text-hammer-purple font-bold">{myTeamStats.cityLevels}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-hammer-dim">Territory</span>
                  <span className="text-hammer-text font-bold">{comma(myTeamStats.tiles)} tiles</span>
                </div>
              </div>
            </>
          )}

          {/* Enemy teams */}
          {enemyTeams.length > 0 && (
            <>
              <div className="h-px mb-2" style={{ background: "rgba(255, 107, 107, 0.12)" }} />
              <div className="text-2xs text-hammer-red font-bold mb-1.5 tracking-wider">HOSTILE FORCES</div>
              <div className="space-y-1">
                {enemyTeams.map((et) => (
                  <div key={String(et.team)} className="flex items-center justify-between text-2xs">
                    <span className="text-hammer-dim font-bold">{String(et.team)}</span>
                    <div className="flex gap-3">
                      <span className="text-hammer-text">{et.alive}<span className="text-hammer-dim">p</span></span>
                      <span className="text-hammer-blue">{short(dTroops(et.troops))}<span className="text-hammer-dim">t</span></span>
                      <span className="text-hammer-gold">{short(et.gold)}<span className="text-hammer-dim">g</span></span>
                      <span className="text-hammer-muted">{short(et.tiles)}<span className="text-hammer-dim">ti</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
