/**
 * AutoSendView — Unified view for Auto Troops and Auto Gold.
 *
 * Both views share 95% of their layout and logic. This component
 * parameterizes the differences via a ResourceConfig.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useMyPlayerStructural, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, comma } from "@shared/utils";
import { troopGrowthPerSec, timeToReach, palantirTroopAmount, OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import { PALANTIR_RATIO } from "@store/slices/auto-troops";
import { TargetTag } from "@ui/components/TargetTag";
import { record } from "../../recorder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Target {
  id: string;
  name: string;
  type?: "TM" | "AL";
}

interface LogEntry {
  ts: number;
  target: string;
  amount: number;
}

export interface ResourceConfig {
  /** Display label: "Troops" | "Gold" */
  label: string;
  /** Unit suffix for amounts: "t" | "g" */
  unit: string;
  /** Accent color token: "hammer-blue" | "hammer-gold" */
  accentColor: string;
  /** How to read the player's current resource amount */
  getMyAmount: (me: any) => number;
  /** For pct threshold mode: compute resource maximum (e.g. max troops) */
  getMaxAmount?: (me: any) => number;

  // -- Threshold model --
  /** "pct" = percentage of max (troops), "abs" = absolute amount (gold) */
  thresholdMode: "pct" | "abs";
  thresholdPresets: readonly number[];
  thresholdLabel: string;
  /** Format a threshold preset for display */
  fmtThresholdPreset: (val: number) => string;

  // -- Store selectors (keyed by resource) --
  selectRunning: (s: any) => boolean;
  selectTargets: (s: any) => Target[];
  selectRatio: (s: any) => number;
  selectThreshold: (s: any) => number;
  selectCooldownSec: (s: any) => number;
  selectLog: (s: any) => LogEntry[];
  selectNextSend: (s: any) => Record<string, number>;
  selectAllTeamMode: (s: any) => boolean;
  selectAllAlliesMode: (s: any) => boolean;

  // -- Store actions --
  selectSetRatio: (s: any) => (ratio: number) => void;
  selectSetThreshold: (s: any) => (threshold: number) => void;
  selectSetCooldown: (s: any) => (sec: number) => void;
  selectToggleAllTeam: (s: any) => () => void;
  selectToggleAllAllies: (s: any) => () => void;
  selectAddTarget: (s: any) => (id: string, name: string, type?: "TM" | "AL") => void;
  selectRemoveTarget: (s: any) => (id: string) => void;

  // -- Start / Stop --
  start: () => void;
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

const RATIO_PRESETS = [5, 10, 15, 20, 25, 33, 50, 75, 100];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-xs text-hammer-muted uppercase tracking-wider mb-1 border-b border-hammer-border pb-0_5">
        {title}
      </div>
      {children}
    </div>
  );
}

function PresetButton({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent?: "green" | "purple" }) {
  const a = accent || "green";
  const activeCls = a === "purple"
    ? "bg-hammer-purple/20 border-hammer-purple text-hammer-purple"
    : "bg-hammer-green/20 border-hammer-green text-hammer-green";
  return (
    <button
      onClick={onClick}
      className={`px-1_5 py-0_5 rounded text-2xs border transition-colors cursor-pointer ${
        active ? activeCls : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text hover:border-hammer-text"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// simulateSends — Mirrors the sequential send logic from auto-troops.ts
// and auto-gold.ts. Each target gets ratio% of REMAINING, not of original.
// ---------------------------------------------------------------------------

function simulateSends(
  amount: number,
  ratio: number,
  targetCount: number,
  thresholdMode: "pct" | "abs",
  threshold: number,
  maxAmount: number,
): { perTarget: number[]; totalSent: number; kept: number; effectivePct: number } {
  const perTarget: number[] = [];
  let remaining = amount;

  if (ratio === PALANTIR_RATIO) {
    // Palantir: send surplus above 42% floor, split evenly
    const perT = palantirTroopAmount(amount, maxAmount, targetCount);
    if (perT > 0) {
      for (let i = 0; i < targetCount; i++) perTarget.push(perT);
      remaining -= perT * targetCount;
    }
  } else {
    for (let i = 0; i < targetCount; i++) {
      const toSend = Math.max(1, Math.floor(remaining * (ratio / 100)));
      if (toSend <= 0) break;

      if (thresholdMode === "pct") {
        const remainingPct = maxAmount > 0 ? ((remaining - toSend) / maxAmount) * 100 : 0;
        if (remainingPct < threshold) break;
      } else {
        if (remaining - toSend < threshold) break;
      }

      perTarget.push(toSend);
      remaining -= toSend;
    }
  }

  const totalSent = perTarget.reduce((sum, v) => sum + v, 0);
  const effectivePct = amount > 0 ? (totalSent / amount) * 100 : 0;
  return { perTarget, totalSent, kept: amount - totalSent, effectivePct };
}

// ---------------------------------------------------------------------------
// StatusPanel — isolated component for stats-dependent display.
// Uses useMyPlayer() (with volatile stats) internally so re-renders from
// troops/gold ticking DON'T cascade to the parent's target picker.
// ---------------------------------------------------------------------------

function StatusPanel({
  config,
  running,
  ratio,
  threshold,
  cooldownSec,
  activeTargetCount,
}: {
  config: ResourceConfig;
  running: boolean;
  ratio: number;
  threshold: number;
  cooldownSec: number;
  activeTargetCount: number;
}) {
  const me = useMyPlayer();
  const log = useStore(config.selectLog);
  const nextSend = useStore(config.selectNextSend);

  const spRenders = useRef(0);
  spRenders.current++;
  record("render", "StatusPanel", { n: spRenders.current, label: config.label });

  const myAmount = config.getMyAmount(me);
  const maxAmount = config.getMaxAmount ? config.getMaxAmount(me) : 0;
  const pctOfMax = maxAmount > 0 ? (myAmount / maxAmount) * 100 : 0;
  const isPalantir = ratio === PALANTIR_RATIO;

  const { perTarget, totalSent, kept } = simulateSends(
    myAmount, ratio, activeTargetCount, config.thresholdMode, threshold, maxAmount,
  );

  // Growth rate (troops only — gold has fixed generation)
  const growthSec = config.thresholdMode === "pct" && maxAmount > 0
    ? troopGrowthPerSec(myAmount, maxAmount)
    : 0;

  // Time to reach send threshold (or Palantir floor)
  const sendTarget = isPalantir
    ? maxAmount * OPTIMAL_REGEN_PCT
    : config.thresholdMode === "pct" ? (threshold / 100) * maxAmount : threshold;
  const belowSendPoint = isPalantir
    ? myAmount < sendTarget
    : config.thresholdMode === "pct"
      ? maxAmount > 0 && pctOfMax < threshold
      : myAmount < threshold;
  const timeToSend = belowSendPoint && growthSec > 0
    ? timeToReach(myAmount, sendTarget, maxAmount)
    : 0;

  // Countdown to next cooldown expiry
  const nextSendMs = useMemo(() => {
    const times = Object.values(nextSend);
    if (times.length === 0) return 0;
    return Math.max(0, Math.min(...times) - Date.now());
  }, [nextSend]);

  const sessionTotal = useMemo(() => log.reduce((sum, e) => sum + e.amount, 0), [log]);

  return (
    <div className="bg-hammer-surface rounded p-2 border border-hammer-border" style={{ minHeight: 90 }}>
      {/* Row 1: state + start/stop — always present */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${running ? "bg-hammer-green animate-pulse" : "bg-hammer-red"}`} />
          <span className={`text-sm font-bold ${running ? "text-hammer-green" : "text-hammer-red"}`}>
            {running ? "RUNNING" : "STOPPED"}
          </span>
          {running && isPalantir && (
            <span className="text-2xs text-hammer-purple font-bold">[PALANTIR]</span>
          )}
        </div>
        <button
          onClick={() => (running ? config.stop() : config.start())}
          className={`px-2 py-0_5 rounded text-xs font-bold border transition-colors cursor-pointer ${
            running
              ? "bg-hammer-red/20 border-hammer-red text-hammer-red hover:bg-hammer-red/30"
              : "bg-hammer-green/20 border-hammer-green text-hammer-green hover:bg-hammer-green/30"
          }`}
        >
          {running ? "STOP" : "START"}
        </button>
      </div>

      {/* Rows 2-4: stable layout — always present when running, no conditional mount/unmount */}
      {running && (
        <div className="mt-1 space-y-0_5 text-2xs">
          {/* Growth line */}
          {growthSec > 0 ? (
            <div className="flex justify-between">
              <span className="text-hammer-muted">Growth</span>
              <span className="text-hammer-text">
                <span className="text-hammer-green font-bold">+{short(Math.round(growthSec))}</span>/sec
                {belowSendPoint && timeToSend > 0 && (
                  <span className="text-hammer-warn ml-2">
                    {Math.round(pctOfMax)}% → {isPalantir ? "42" : threshold}% in {timeToSend.toFixed(0)}s
                  </span>
                )}
                {!belowSendPoint && (
                  <span className="text-hammer-dim ml-2">{Math.round(pctOfMax)}% of max</span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-hammer-muted">Have</span>
              <span className={`font-bold text-${config.accentColor}`}>{comma(myAmount)} {config.unit}</span>
            </div>
          )}

          {/* Send line */}
          <div className="flex justify-between">
            <span className="text-hammer-muted">
              {activeTargetCount > 0
                ? `Send ${activeTargetCount} target${activeTargetCount !== 1 ? "s" : ""}`
                : "No targets"}
            </span>
            {totalSent > 0 ? (
              <span className="text-hammer-green font-bold">
                -{short(totalSent)} {config.unit}
                {perTarget.length > 1 && (
                  <span className="text-hammer-dim font-normal ml-1">
                    ({short(perTarget[perTarget.length - 1])}~{short(perTarget[0])} each)
                  </span>
                )}
              </span>
            ) : belowSendPoint ? (
              <span className="text-hammer-warn">recharging</span>
            ) : (
              <span className="text-hammer-dim">—</span>
            )}
          </div>

          {/* Keep line */}
          {totalSent > 0 && (
            <div className="flex justify-between">
              <span className="text-hammer-muted">Keep</span>
              <span className="text-hammer-text font-bold">
                {short(kept)} {config.unit}
                {maxAmount > 0 && <span className="text-hammer-dim font-normal ml-1">({Math.round(kept / maxAmount * 100)}%)</span>}
              </span>
            </div>
          )}

          {/* Session line */}
          {log.length > 0 && (
            <div className="flex justify-between border-t border-hammer-border-subtle pt-0_5 mt-0_5">
              <span className="text-hammer-dim">Session</span>
              <span className="text-hammer-muted">{comma(sessionTotal)} {config.unit} · {log.length} send{log.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AutoSendView({ config }: { config: ResourceConfig }) {
  // Render tracking for diagnostics
  const asvRenders = useRef(0);
  asvRenders.current++;
  record("render", "AutoSendView", { n: asvRenders.current, label: config.label });

  const running = useStore(config.selectRunning);
  const targets = useStore(config.selectTargets);
  const ratio = useStore(config.selectRatio);
  const threshold = useStore(config.selectThreshold);
  const cooldownSec = useStore(config.selectCooldownSec);
  const allTeamMode = useStore(config.selectAllTeamMode);
  const allAlliesMode = useStore(config.selectAllAlliesMode);

  // log and nextSend are volatile (update every 800ms tick) — subscribed
  // inside StatusPanel to isolate re-renders from the target picker.

  const setRatio = useStore(config.selectSetRatio);
  const setThreshold = useStore(config.selectSetThreshold);
  const setCooldown = useStore(config.selectSetCooldown);
  const toggleAllTeam = useStore(config.selectToggleAllTeam);
  const toggleAllAllies = useStore(config.selectToggleAllAllies);
  const addTarget = useStore(config.selectAddTarget);
  const removeTarget = useStore(config.selectRemoveTarget);

  // Structural-only — does NOT re-render on troops/gold ticking
  const teammates = useTeammates();
  const allies = useAllies();

  const [customRatio, setCustomRatio] = useState("");
  const [customCooldown, setCustomCooldown] = useState(String(cooldownSec));
  const [customThreshold, setCustomThreshold] = useState(String(threshold));
  const [targetSearch, setTargetSearch] = useState("");

  const activeTargetCount = allTeamMode
    ? teammates.length + (allAlliesMode ? allies.length : 0)
    : allAlliesMode
      ? allies.length + targets.length
      : targets.length;

  // Available players for manual target picker
  const targetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);
  const availablePlayers = useMemo(() => {
    if (allTeamMode && allAlliesMode) return [];
    const pool = [
      ...(allTeamMode ? [] : teammates.map((p) => ({ ...p, playerType: "TM" as const }))),
      ...(allAlliesMode ? [] : allies.map((p) => ({ ...p, playerType: "AL" as const }))),
    ];
    return pool.filter((p) => !targetIds.has(p.id));
  }, [teammates, allies, allTeamMode, allAlliesMode, targetIds]);

  const filteredAvailable = useMemo(() => {
    if (!targetSearch) return availablePlayers;
    const q = targetSearch.toLowerCase();
    return availablePlayers.filter((p) =>
      (p.displayName || p.name || "").toLowerCase().includes(q)
    );
  }, [availablePlayers, targetSearch]);

  const handleCooldownChange = useCallback(
    (val: string) => {
      setCustomCooldown(val);
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 10 && n <= 60) setCooldown(n);
    },
    [setCooldown],
  );

  const handleCustomRatioSubmit = useCallback(() => {
    const n = parseInt(customRatio, 10);
    if (!isNaN(n) && n >= 1 && n <= 100) {
      setRatio(n);
      setCustomRatio("");
    }
  }, [customRatio, setRatio]);

  const handleCustomThresholdSubmit = useCallback(() => {
    const n = parseInt(customThreshold, 10);
    if (!isNaN(n) && n >= 0) setThreshold(n);
  }, [customThreshold, setThreshold]);

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Status + Controls — isolated to prevent stats blink cascading to targets */}
      <StatusPanel
        config={config}
        running={running}
        ratio={ratio}
        threshold={threshold}
        cooldownSec={cooldownSec}
        activeTargetCount={activeTargetCount}
      />

      {/* Settings */}
      <Section title="Settings">
        {/* Send Mode */}
        <div className="mb-2">
          <div className="text-2xs text-hammer-muted mb-0_5">Send Mode</div>
          <div className="flex flex-wrap gap-0_5">
            {RATIO_PRESETS.map((r) => (
              <PresetButton key={r} label={`${r}%`} active={ratio === r} onClick={() => setRatio(r)} />
            ))}
            {config.thresholdMode === "pct" && (
              <PresetButton
                label="Palantir"
                active={ratio === PALANTIR_RATIO}
                onClick={() => setRatio(PALANTIR_RATIO)}
                accent="purple"
              />
            )}
          </div>
          {ratio !== PALANTIR_RATIO && (
            <div className="flex items-center gap-0_5 mt-1">
              <input
                type="number"
                value={customRatio}
                onChange={(e) => setCustomRatio(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomRatioSubmit()}
                placeholder="Custom %"
                min={1}
                max={100}
                className="w-16 bg-hammer-bg border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text outline-none focus:border-hammer-green"
              />
              <button
                onClick={handleCustomRatioSubmit}
                className="px-1 py-0_5 rounded text-2xs bg-hammer-surface border border-hammer-border text-hammer-muted hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
              >
                Set
              </button>
            </div>
          )}
          {ratio === PALANTIR_RATIO && (
            <div className="text-2xs text-hammer-purple mt-1 border border-hammer-purple/20 bg-hammer-purple/5 rounded p-1_5">
              Palantir sends everything above 42% (peak regen). Oscillates 57% {"\u2192"} 42% {"\u2192"} 57% every 10s. No threshold or ratio needed.
            </div>
          )}
        </div>

        {/* Threshold — hidden when Palantir is active (it manages its own floor) */}
        {ratio !== PALANTIR_RATIO && (
          <div className="mb-2">
            <div className="text-2xs text-hammer-muted mb-0_5">{config.thresholdLabel}</div>
            <div className="flex flex-wrap gap-0_5">
              {config.thresholdPresets.map((t) => (
                <PresetButton
                  key={t}
                  label={config.fmtThresholdPreset(t)}
                  active={threshold === t}
                  onClick={() => {
                    setThreshold(t);
                    setCustomThreshold(String(t));
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-0_5 mt-1">
              <input
                type="number"
                value={customThreshold}
                onChange={(e) => setCustomThreshold(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomThresholdSubmit()}
                placeholder={config.thresholdMode === "pct" ? "Custom %" : "Custom amount"}
                min={0}
                max={config.thresholdMode === "pct" ? 99 : undefined}
                className="w-20 bg-hammer-bg border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text outline-none focus:border-hammer-green"
              />
              <button
                onClick={handleCustomThresholdSubmit}
                className="px-1 py-0_5 rounded text-2xs bg-hammer-surface border border-hammer-border text-hammer-muted hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
              >
                Set
              </button>
            </div>
          </div>
        )}

        {/* Cooldown */}
        <div>
          <div className="text-2xs text-hammer-muted mb-0_5">Cooldown (seconds)</div>
          <input
            type="number"
            value={customCooldown}
            onChange={(e) => handleCooldownChange(e.target.value)}
            min={10}
            max={60}
            className="w-16 bg-hammer-bg border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text outline-none focus:border-hammer-green"
          />
        </div>
      </Section>

      {/* Targets */}
      <Section title="Targets">
        <div className="flex gap-1 mb-1">
          <button
            onClick={toggleAllTeam}
            className={`flex-1 px-1 py-0_5 rounded text-2xs border transition-colors cursor-pointer ${
              allTeamMode
                ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
                : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text"
            }`}
          >
            All Team
          </button>
          <button
            onClick={toggleAllAllies}
            className={`flex-1 px-1 py-0_5 rounded text-2xs border transition-colors cursor-pointer ${
              allAlliesMode
                ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
                : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text"
            }`}
          >
            All Allies
          </button>
        </div>

        {!allTeamMode || !allAlliesMode ? (
          <div>
            {targets.length > 0 && (
              <div className="flex flex-wrap gap-0_5 mb-1">
                {targets.map((t) => (
                  <TargetTag key={t.id} target={t} onRemove={() => removeTarget(t.id)} />
                ))}
              </div>
            )}

            {availablePlayers.length > 0 && (
              <div>
                <div className="text-2xs text-hammer-muted mb-0_5">Add Target</div>
                <input
                  type="text"
                  placeholder="Search players..."
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  className="w-full bg-hammer-bg border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text outline-none focus:border-hammer-green mb-0_5"
                />
                <div className="flex flex-wrap gap-0_5">
                  {filteredAvailable.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addTarget(p.id, p.displayName || p.name || "Unknown", p.playerType)}
                      className={`px-1 py-0_5 rounded text-2xs bg-hammer-bg border border-hammer-border text-hammer-text hover:border-${config.accentColor} hover:text-${config.accentColor} transition-colors cursor-pointer`}
                    >
                      <span className={p.playerType === "TM" ? "text-hammer-blue" : "text-hammer-green"}>
                        [{p.playerType}]
                      </span>{" "}
                      + {p.displayName || p.name || "Unknown"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {targets.length === 0 && availablePlayers.length === 0 && !allTeamMode && !allAlliesMode && (
              <div className="text-2xs text-hammer-muted">No players available to add as targets.</div>
            )}
          </div>
        ) : (
          <div className="text-2xs text-hammer-muted">
            Sending to{" "}
            {allTeamMode ? `${teammates.length} teammate${teammates.length !== 1 ? "s" : ""}` : ""}
            {allTeamMode && allAlliesMode ? " + " : ""}
            {allAlliesMode ? `${allies.length} ${allies.length !== 1 ? "allies" : "ally"}` : ""}.
          </div>
        )}
      </Section>

    </div>
  );
}
