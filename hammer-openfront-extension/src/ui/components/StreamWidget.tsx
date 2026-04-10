/**
 * StreamWidget — Floating stats overlay for streaming.
 *
 * Shows when the dashboard is in external window mode.
 * Draggable, compact, no sensitive controls.
 * Displays: my stats, my team stats, enemy team summary.
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
  const [hidden, setHidden] = useState(false);
  // Center-left: left edge, vertically centered
  const [pos, setPos] = useState(() => ({
    left: 16,
    top: Math.max(60, Math.round(window.innerHeight / 2 - 180)),
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

  // Team stats (non-reactive — recalculated when my stats change)
  const teamData = useMemo(() => {
    const pMap = useStore.getState().playersById;
    return getTeamStats(pMap, cityLevelSumByOwner);
  }, [me]); // recalc when my player updates

  if (hidden || !playerDataReady || !me) return null;

  const myName = me.displayName || me.name || "---";
  const troops = dTroops(me.troops);
  const gold = Number(me.gold ?? 0);
  const tiles = me.tilesOwned ?? 0;
  const maxT = estimateMaxTroops(tiles, me.smallID ?? 0, cityLevelSumByOwner);
  const rawTroops = Number(me.troops || 0);
  const pctOfMax = maxT > 0 ? (rawTroops / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(rawTroops, maxT) : 0;
  const displayGrowth = dTroops(Math.round(growthSec));
  const atPeak = pctOfMax >= (OPTIMAL_REGEN_PCT * 100 - 5) && pctOfMax <= (OPTIMAL_REGEN_PCT * 100 + 5);

  const myTeamStats = myTeam != null ? teamData.get(myTeam) : null;

  // Enemy teams sorted by total troops (top 3)
  const enemyTeams = useMemo(() => {
    const enemies: TeamStats[] = [];
    for (const [team, stats] of teamData) {
      if (team === myTeam) continue;
      if (stats.alive === 0) continue;
      enemies.push(stats);
    }
    return enemies.sort((a, b) => b.troops - a.troops).slice(0, 3);
  }, [teamData, myTeam]);

  return (
    <div
      className="fixed font-mono"
      style={{
        left: pos.left,
        top: pos.top,
        width: 280,
        background: "linear-gradient(135deg, rgba(11, 18, 32, 0.96), rgba(22, 34, 54, 0.92))",
        backdropFilter: "blur(12px)",
        borderRadius: 10,
        border: "1px solid rgba(123, 184, 255, 0.12)",
        padding: "10px 14px",
        boxShadow: "0 6px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
        zIndex: 2147483647,
      }}
    >
      {/* Header — draggable */}
      <div
        className="flex items-center justify-between mb-2 select-none"
        style={{ cursor: "move" }}
        onMouseDown={onMouseDown}
      >
        <div>
          <div
            className="text-sm font-bold"
            style={{ color: "var(--color-hammer-green)", animation: "glow-text 3s ease-in-out infinite" }}
          >
            {myName}
          </div>
          <div className="text-2xs text-hammer-dim">
            Team {String(myTeam ?? "---")} {"\u00B7"} {comma(tiles)} tiles
          </div>
        </div>
        <button
          onClick={() => setHidden(true)}
          className="text-2xs text-hammer-dim hover:text-hammer-red cursor-pointer bg-transparent border-none font-mono"
        >
          X
        </button>
      </div>

      {/* My stats */}
      <div className="mb-2">
        {/* Troop bar */}
        <div className="flex items-center justify-between text-2xs mb-0.5">
          <span className="text-hammer-muted">FORCE</span>
          <span className="text-hammer-text font-bold">{comma(troops)}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
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
            {atPeak ? "PEAK" : `${Math.round(pctOfMax)}%`}
          </span>
          <span className="text-hammer-green">+{short(displayGrowth)}/s</span>
        </div>

        {/* Gold */}
        <div className="flex items-center justify-between text-2xs mt-1">
          <span className="text-hammer-muted">GOLD</span>
          <span className="text-hammer-gold font-bold">{comma(gold)}</span>
        </div>
      </div>

      {/* My team stats */}
      {myTeamStats && (
        <>
          <div className="h-px mb-1.5" style={{ background: "rgba(127, 242, 163, 0.15)" }} />
          <div className="text-2xs text-hammer-green font-bold mb-1 tracking-wider">
            MY TEAM
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-2xs mb-1.5">
            <div className="flex justify-between">
              <span className="text-hammer-dim">Players</span>
              <span className="text-hammer-text">{myTeamStats.alive}/{myTeamStats.players}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-dim">Troops</span>
              <span className="text-hammer-blue">{short(dTroops(myTeamStats.troops))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-dim">Gold</span>
              <span className="text-hammer-gold">{short(myTeamStats.gold)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-dim">Cities</span>
              <span className="text-hammer-purple">{myTeamStats.cityLevels}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-dim">Territory</span>
              <span className="text-hammer-text">{short(myTeamStats.tiles)}</span>
            </div>
          </div>
        </>
      )}

      {/* Enemy teams (top 3) */}
      {enemyTeams.length > 0 && (
        <>
          <div className="h-px mb-1.5" style={{ background: "rgba(255, 107, 107, 0.15)" }} />
          <div className="text-2xs text-hammer-red font-bold mb-1 tracking-wider">
            HOSTILE FORCES
          </div>
          {enemyTeams.map((et) => (
            <div key={String(et.team)} className="flex items-center justify-between text-2xs mb-0.5">
              <span className="text-hammer-dim">{String(et.team)}</span>
              <div className="flex gap-2">
                <span className="text-hammer-text">{et.alive}p</span>
                <span className="text-hammer-blue">{short(dTroops(et.troops))}t</span>
                <span className="text-hammer-gold">{short(et.gold)}g</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
