/**
 * StreamWidget — Minimal floating stats overlay for streaming.
 *
 * Shown on the game page when the dashboard is in external window mode.
 * Draggable, compact, no sensitive controls. Stream-friendly.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";

export default function StreamWidget() {
  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const [hidden, setHidden] = useState(false);
  const [pos, setPos] = useState({ left: 20, top: 60 });
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

  if (hidden || !playerDataReady || !me) return null;

  const myName = me.displayName || me.name || "---";
  const myTeam = me.team ?? "---";
  const troops = dTroops(me.troops);
  const gold = Number(me.gold ?? 0);
  const tiles = me.tilesOwned ?? 0;
  const maxT = estimateMaxTroops(tiles, me.smallID ?? 0, cityLevelSumByOwner);
  const rawTroops = Number(me.troops || 0);
  const pctOfMax = maxT > 0 ? (rawTroops / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(rawTroops, maxT) : 0;
  const displayGrowth = dTroops(Math.round(growthSec));
  const atPeak = pctOfMax >= (OPTIMAL_REGEN_PCT * 100 - 5) && pctOfMax <= (OPTIMAL_REGEN_PCT * 100 + 5);

  return (
    <div
      className="fixed font-mono"
      style={{
        left: pos.left,
        top: pos.top,
        width: 240,
        background: "linear-gradient(135deg, rgba(11, 18, 32, 0.95), rgba(22, 34, 54, 0.90))",
        backdropFilter: "blur(10px)",
        borderRadius: 8,
        border: "1px solid rgba(123, 184, 255, 0.15)",
        padding: "10px 14px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        zIndex: 2147483647,
      }}
    >
      {/* Header — draggable */}
      <div
        className="flex items-center justify-between mb-1.5 select-none"
        style={{ cursor: "move" }}
        onMouseDown={onMouseDown}
      >
        <span
          className="text-sm font-bold"
          style={{ color: "var(--color-hammer-green)", animation: "glow-text 3s ease-in-out infinite" }}
        >
          {myName}
        </span>
        <button
          onClick={() => setHidden(true)}
          className="text-2xs text-hammer-dim hover:text-hammer-red cursor-pointer bg-transparent border-none font-mono"
        >
          X
        </button>
      </div>

      {/* Team + territory */}
      <div className="text-2xs text-hammer-muted mb-1.5">
        Team {String(myTeam)} {"\u00B7"} {comma(tiles)} territories
      </div>

      {/* Troop bar */}
      <div className="mb-1">
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
      </div>

      {/* Gold */}
      <div className="flex items-center justify-between text-2xs">
        <span className="text-hammer-muted">TREASURY</span>
        <span className="text-hammer-gold font-bold">{comma(gold)}</span>
      </div>
    </div>
  );
}
