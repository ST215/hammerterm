/**
 * HammerView — Live tactical dashboard (restrained terminal aesthetic).
 *
 * Sections: identity · force monitor · donations received · attack-ratio
 * quick controls · treasury. No boot theater, no dispatch feed, no glow.
 */

import { useState, useEffect, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops, fmtSec } from "@shared/utils";
import { estimateMaxTroops } from "@shared/logic/city";
import { cityLevelSumByOwner } from "@content/hooks/worker-hook";
import { troopGrowthPerSec, timeToReach, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { Section, DataRow, PercentBar, PresetButton, Badge } from "@ui/components/ds";
import { asAttackRatioStart, asAttackRatioStop } from "@content/automation/attack-ratio";
import type { AttackRatioMode } from "@store/slices/attack-ratio";
import { useSortedEntries } from "./SummaryView";

// Force-monitor bands on troops/max capacity.
const CHARGING_MAX = 37;
const READY_MIN = 47;

const MODES: { id: AttackRatioMode; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "assist", label: "Assist" },
  { id: "breakeven", label: "Break-even" },
  { id: "peak", label: "Peak" },
];

const FLOOR_PRESETS = [0, 25, 42, 50, 60];
const CAP_PRESETS = [15, 20, 25, 30, 50, 75, 100];

function fmtAgo(d: Date | null): string {
  if (!d) return "";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export default function HammerView() {
  const me = useMyPlayer();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const hasSignal = playerDataReady && !!me;

  // Attack-ratio slice
  const running = useStore((s) => s.attackRatioRunning);
  const mode = useStore((s) => s.attackRatioMode);
  const floorPct = useStore((s) => s.attackRatioFloorPct);
  const maxCap = useStore((s) => s.attackRatioMaxCap);
  const tel = useStore((s) => s.attackRatioTelemetry);
  const setMode = useStore((s) => s.setAttackRatioMode);
  const setFloorPct = useStore((s) => s.setAttackRatioFloorPct);
  const setMaxCap = useStore((s) => s.setAttackRatioMaxCap);

  // Donations received
  const inbound = useStore((s) => s.inbound);
  const sortedInbound = useSortedEntries(inbound);

  // ── Force sampling (1s → 6-sample rolling window) for trend arrow ──
  const rawTroops = Number(me?.troops || 0);
  const troopsRef = useRef(rawTroops);
  troopsRef.current = rawTroops;
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    // Reset the window when the player identity changes (match reset / new
    // match) — otherwise stale samples show a false ▼/▲ arrow for ~6s.
    setSamples([]);
    const id = setInterval(() => {
      setSamples((prev) => [...prev.slice(-5), troopsRef.current]);
    }, 1000);
    return () => clearInterval(id);
  }, [me?.smallID, playerDataReady]);

  if (!hasSignal) {
    return (
      <div className="relative font-mono select-none" style={{ minHeight: 320 }}>
        <div className="text-2xs text-hammer-dim">awaiting match data…</div>
      </div>
    );
  }

  const myName = me!.displayName || me!.name || "";
  const myTeam = me!.team ?? "";
  const tiles = me!.tilesOwned ?? 0;
  const gold = Number(me!.gold ?? 0);
  const maxT = estimateMaxTroops(tiles, me!.smallID ?? 0, cityLevelSumByOwner);
  const troopPct = maxT > 0 ? (rawTroops / maxT) * 100 : 0;
  const growthSec = maxT > 0 ? troopGrowthPerSec(rawTroops, maxT) : 0;

  // Band
  let band: string, bandColor: string, barColor: string;
  if (troopPct < CHARGING_MAX) {
    band = "CHARGING"; bandColor = "text-hammer-warn"; barColor = "bg-hammer-warn";
  } else if (troopPct <= READY_MIN) {
    band = "PEAK REGEN"; bandColor = "text-hammer-green"; barColor = "bg-hammer-green";
  } else {
    band = "READY"; bandColor = "text-hammer-blue"; barColor = "bg-hammer-blue";
  }

  // Trend arrow from rolling window (oldest → newest)
  const trend = samples.length >= 2 ? samples[samples.length - 1] - samples[0] : 0;
  const arrow = trend > 0.5 ? "▲" : trend < -0.5 ? "▼" : "●";
  const arrowColor = trend > 0.5 ? "text-hammer-green" : trend < -0.5 ? "text-hammer-red" : "text-hammer-muted";

  // Time to 42% regen peak (only meaningful while below it)
  const peakTroops = maxT * OPTIMAL_REGEN_PCT;
  const secsToPeak = rawTroops < peakTroops ? timeToReach(rawTroops, peakTroops, maxT) : 0;

  // Donation totals (mirror SummaryView's sum pattern)
  let inGold = 0, inTroops = 0;
  for (const [, rec] of inbound) { inGold += rec.gold; inTroops += rec.troops; }
  const topSupporters = sortedInbound.slice(0, 3);

  // Attack-ratio live badge
  const ratioLabel = tel?.belowSetpoint ? "min" : tel ? `${Math.round(tel.ratio * 100)}%` : "—";
  const isManual = mode === "manual";

  return (
    <div className="relative font-mono select-none" style={{ minHeight: 320 }}>
      {/* ── Identity ── */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-hammer-green truncate mr-2">{myName}</span>
        <span className="text-2xs text-hammer-muted shrink-0">
          Team {String(myTeam)} {"·"} {comma(tiles)} territories
        </span>
      </div>

      {/* ── Force monitor ── */}
      <Section title="Force Monitor">
        <div className="flex items-center justify-between text-2xs mb-0_5">
          <span className={`font-bold ${bandColor}`}>
            <span className={`mr-1 ${arrowColor}`}>{arrow}</span>{band}
          </span>
          <span className="text-hammer-text font-bold">
            {comma(dTroops(rawTroops))}
            <span className="text-hammer-dim font-normal ml-1">/ {short(dTroops(maxT))}</span>
          </span>
        </div>
        <PercentBar value={rawTroops} max={maxT || 1} color={barColor} />
        <div className="flex items-center justify-between text-2xs mt-0_5">
          <span className="text-hammer-dim">{Math.round(troopPct)}% of max</span>
          <span className="flex gap-2">
            <span className="text-hammer-green font-bold">+{short(dTroops(Math.round(growthSec)))}/s</span>
            <span className="text-hammer-muted">
              {rawTroops >= peakTroops
                ? "at peak"
                : secsToPeak === Infinity
                  ? "—"
                  : `${fmtSec(secsToPeak)} to peak`}
            </span>
          </span>
        </div>
      </Section>

      {/* ── Donations received ── */}
      <Section title="Donations Received" count={sortedInbound.length}>
        <DataRow
          left={<span className="text-hammer-muted uppercase tracking-wider">Total received</span>}
          right={
            <>
              {inGold > 0 && <span className="text-hammer-gold" title={comma(inGold)}>{short(inGold)}g</span>}
              {inTroops > 0 && <span className="text-hammer-green" title={comma(inTroops)}>{short(inTroops)}t</span>}
              {inGold === 0 && inTroops === 0 && <span className="text-hammer-dim">none</span>}
            </>
          }
        />
        {topSupporters.map((e) => (
          <div key={e.name} className="mt-0_5">
            <DataRow
              left={<span className="text-hammer-text truncate">{e.name}</span>}
              sub={e.last ? <span className="text-hammer-dim">{fmtAgo(e.last)}</span> : undefined}
              right={
                <>
                  {e.gold > 0 && <span className="text-hammer-gold" title={comma(e.gold)}>{short(e.gold)}g</span>}
                  {e.troops > 0 && <span className="text-hammer-green" title={comma(e.troops)}>{short(e.troops)}t</span>}
                </>
              }
            />
          </div>
        ))}
      </Section>

      {/* ── Attack-ratio quick controls ── */}
      <Section title="Attack Ratio">
        <div className="flex items-center justify-between mb-1_5">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${running ? "bg-hammer-green animate-pulse" : "bg-hammer-dim"}`} />
            {running && !isManual && (
              <Badge label={ratioLabel} color={tel?.belowSetpoint ? "warn" : "green"} />
            )}
            {running && isManual && <span className="text-2xs text-hammer-muted">watching</span>}
            {!running && <span className="text-2xs text-hammer-dim">off</span>}
          </div>
          <button
            onClick={() => (running ? asAttackRatioStop() : asAttackRatioStart())}
            className={`px-3 py-0_5 text-2xs font-medium rounded cursor-pointer transition-colors ${
              running
                ? "bg-hammer-red/20 text-hammer-red border border-hammer-red/50 hover:bg-hammer-red/30"
                : "bg-hammer-green/20 text-hammer-green border border-hammer-green/50 hover:bg-hammer-green/30"
            }`}
          >
            {running ? "Stop" : "Start"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <PresetButton key={m.id} label={m.label} active={mode === m.id} onClick={() => setMode(m.id)} />
          ))}
        </div>
        {!isManual && (
          <>
            <div className="text-2xs text-hammer-dim mt-1_5 mb-0_5">Floor reserve</div>
            <div className="flex flex-wrap gap-1">
              {FLOOR_PRESETS.map((p) => (
                <PresetButton key={p} label={p === 0 ? "Off" : `${p}%`} active={floorPct === p} onClick={() => setFloorPct(p)} />
              ))}
            </div>
            <div className="text-2xs text-hammer-dim mt-1_5 mb-0_5">Send cap</div>
            <div className="flex flex-wrap gap-1">
              {CAP_PRESETS.map((p) => (
                <PresetButton key={p} label={`${p}%`} active={maxCap === p} onClick={() => setMaxCap(p)} />
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── Treasury ── */}
      <Section title="Treasury">
        <DataRow
          left={<span className="text-hammer-muted uppercase tracking-wider">Gold</span>}
          right={<span className="text-hammer-gold font-bold">{comma(gold)}</span>}
        />
      </Section>
    </div>
  );
}
