/**
 * GrowthHUD — Persistent on-screen overlay showing troop growth rate
 * and optimal send status. Visible during gameplay even in external
 * window mode. Designed for streaming.
 *
 * Positioned at center-right alongside other notifications.
 * Renders only when auto-troops is running.
 */

import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { dTroops, short } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { PALANTIR_RATIO } from "@store/slices/auto-troops";

export default function GrowthHUD() {
  const running = useStore((s) => s.asTroopsRunning);
  const ratio = useStore((s) => s.asTroopsRatio);
  const me = useMyPlayer();

  if (!running || !me) return null;

  const troops = Number(me.troops || 0);
  const maxT = estimateMaxTroops(me.tilesOwned ?? 0, me.smallID ?? 0, cityLevelSumByOwner);
  const pctOfMax = maxT > 0 ? (troops / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(troops, maxT) : 0;
  const displayGrowth = dTroops(Math.round(growthSec));
  const isPalantir = ratio === PALANTIR_RATIO;

  // Peak regen indicator
  const optimalPct = OPTIMAL_REGEN_PCT * 100;
  const atPeak = pctOfMax >= optimalPct - 5 && pctOfMax <= optimalPct + 5;
  const aboveOptimal = pctOfMax > optimalPct + 5;

  // Status label
  let statusLabel: string;
  let statusColor: string;
  if (atPeak) {
    statusLabel = "PEAK REGEN";
    statusColor = "text-hammer-green";
  } else if (aboveOptimal) {
    statusLabel = "READY";
    statusColor = "text-hammer-blue";
  } else {
    statusLabel = "CHARGING";
    statusColor = "text-hammer-warn";
  }

  return (
    <div
      className="fixed font-mono pointer-events-none"
      style={{
        bottom: 80,
        right: 16,
        background: "linear-gradient(135deg, rgba(11, 18, 32, 0.95), rgba(22, 34, 54, 0.90))",
        backdropFilter: "blur(8px)",
        borderRadius: 8,
        border: "1px solid rgba(123, 184, 255, 0.15)",
        padding: "8px 14px",
        minWidth: 180,
        boxShadow: "0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        zIndex: 2147483647,
      }}
    >
      {/* Growth rate */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xs text-hammer-muted uppercase tracking-wider">Growth</span>
        <span className="text-sm text-hammer-green font-bold">
          +{short(displayGrowth)}/s
        </span>
      </div>

      {/* Capacity bar */}
      <div className="mt-1 mb-0.5">
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, pctOfMax)}%`,
              background: atPeak
                ? "linear-gradient(90deg, #7ff2a3, #4ecdc4)"
                : aboveOptimal
                  ? "linear-gradient(90deg, #7bb8ff, #7ff2a3)"
                  : "linear-gradient(90deg, #f0a040, #ffcf5d)",
            }}
          />
        </div>
      </div>

      {/* Status + percentage */}
      <div className="flex items-center justify-between">
        <span className={`text-2xs font-bold ${statusColor}`}>
          {isPalantir && <span className="text-hammer-purple mr-1">P</span>}
          {statusLabel}
        </span>
        <span className="text-2xs text-hammer-dim">
          {Math.round(pctOfMax)}%
        </span>
      </div>
    </div>
  );
}
