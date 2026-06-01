/**
 * DisguisedCard — the default in-game view.
 *
 * A plain, non-covert "match analytics" card. No boot animation, no themed
 * feed — just a title that reads like an innocuous stats tracker plus a few
 * live numbers, and three controls:
 *
 *   [ reveal ]  → expand into the full Hammer terminal inline (revealInGame)
 *   [ launch ]  → open the external second-monitor window (background-driven)
 *   [ hide ]    → remove the overlay from the page (reopen via extension icon)
 *
 * Shown only when inGameView === "disguised". The full dashboard lives in
 * HammerView (the "Hammer" tab) behind the reveal gate.
 */

import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { comma, dTroops } from "@shared/utils";

export default function DisguisedCard() {
  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const isReplay = useStore((s) => s.isReplay);
  const playerCount = useStore((s) => s.playerSummary.count);
  const revealInGame = useStore((s) => s.revealInGame);
  const hideInGame = useStore((s) => s.hideInGame);

  const hasSignal = playerDataReady && !!me;
  // In a replay we may have no "my player" (watching someone else's match);
  // data still flows globally for analytics, so show that instead of "awaiting".
  const replayAnalytics = isReplay && !me;
  const tiles = me?.tilesOwned ?? 0;
  const troops = dTroops(me?.troops);
  const gold = Number(me?.gold ?? 0);

  const handleLaunch = () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  };

  return (
    <div className="p-3 font-mono select-none" style={{ minWidth: 220 }}>
      {/* Innocuous title */}
      <div className="text-sm font-bold text-hammer-green">Hammer Terminal</div>
      <div className="text-2xs text-hammer-dim mb-3">match analytics · work in progress</div>

      {/* A few innocuous live stats */}
      {hasSignal ? (
        <div className="space-y-1 text-2xs mb-3">
          <Row label="Territories" value={comma(tiles)} />
          <Row label="Force" value={comma(troops)} />
          <Row label="Treasury" value={`${comma(gold)} gold`} />
        </div>
      ) : replayAnalytics ? (
        <div className="space-y-1 text-2xs mb-3">
          <Row label="Mode" value="replay" />
          <Row label="Players" value={comma(playerCount)} />
          <div className="text-hammer-dim">ingesting global analytics…</div>
        </div>
      ) : (
        <div className="text-2xs text-hammer-dim mb-3">awaiting match data…</div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button onClick={revealInGame} className={btn} title="Show controls">
          reveal
        </button>
        <button onClick={handleLaunch} className={btn} title="Open in external window">
          launch{"→"}
        </button>
        <button onClick={hideInGame} className={btnDim} title="Hide overlay (reopen from the extension icon)">
          {"−"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-hammer-muted uppercase tracking-wider">{label}</span>
      <span className="text-hammer-text font-bold">{value}</span>
    </div>
  );
}

const btn =
  "flex-1 px-2 py-1 text-2xs font-mono border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-green hover:border-hammer-green/40 rounded cursor-pointer transition-colors text-center";
const btnDim =
  "px-2 py-1 text-2xs font-mono border border-hammer-border bg-hammer-surface text-hammer-dim hover:text-hammer-red hover:border-hammer-red/40 rounded cursor-pointer transition-colors";
