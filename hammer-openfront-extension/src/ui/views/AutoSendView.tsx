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

const RATIO_PRESETS = [5, 10, 15, 20, 25, 33, 42, 50, 75, 100];

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

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-1_5 py-0_5 rounded text-2xs border transition-colors cursor-pointer ${
        active
          ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
          : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text hover:border-hammer-text"
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
  // Subscribe to volatile data HERE (not in parent) to isolate re-renders
  const log = useStore(config.selectLog);
  const nextSend = useStore(config.selectNextSend);

  // Render tracking for diagnostics
  const spRenders = useRef(0);
  spRenders.current++;
  record("render", "StatusPanel", { n: spRenders.current, label: config.label });
  const myAmount = config.getMyAmount(me);
  const maxAmount = config.getMaxAmount ? config.getMaxAmount(me) : 0;

  const { perTarget, totalSent, kept, effectivePct } = simulateSends(
    myAmount, ratio, activeTargetCount, config.thresholdMode, threshold, maxAmount,
  );

  const belowThreshold =
    config.thresholdMode === "pct"
      ? maxAmount > 0 && (myAmount / maxAmount) * 100 < threshold
      : myAmount < threshold;

  const rechargeTarget =
    config.thresholdMode === "pct"
      ? (threshold / 100) * maxAmount
      : threshold;

  // Countdown to next send cycle
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  const nextSendMs = useMemo(() => {
    const times = Object.values(nextSend);
    if (times.length === 0) return 0;
    return Math.max(0, Math.min(...times) - now);
  }, [nextSend, now]);

  // Session totals from log
  const sessionTotal = useMemo(() => {
    return log.reduce((sum, e) => sum + e.amount, 0);
  }, [log]);

  const pctOfMax = maxAmount > 0 ? (myAmount / maxAmount) * 100 : 0;

  return (
    <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
      {/* Row 1: state indicator + start/stop */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              running ? "bg-hammer-green animate-pulse" : "bg-hammer-red"
            }`}
          />
          <span className={`text-sm font-bold ${running ? "text-hammer-green" : "text-hammer-red"}`}>
            {running ? "RUNNING" : "STOPPED"}
          </span>
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

      {/* Stats grid */}
      {running && (
        <div className="mt-2 space-y-1_5">
          {belowThreshold ? (
            /* --- RECHARGING --- */
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-hammer-warn font-bold">RECHARGING</span>
                {config.thresholdMode === "pct" && maxAmount > 0 && (
                  <span className="text-hammer-muted">
                    {Math.round(pctOfMax)}% / {threshold}% of max
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1_5">
                <span className={`text-lg font-bold text-${config.accentColor}`}>
                  {short(myAmount)}
                </span>
                <span className="text-hammer-muted text-xs">/</span>
                <span className="text-lg font-bold text-hammer-text">
                  {short(rechargeTarget)}
                </span>
                <span className="text-xs text-hammer-muted">{config.unit}</span>
              </div>
              {rechargeTarget > 0 && (
                <div className="text-2xs text-hammer-muted mt-0_5">
                  Need {short(Math.max(0, rechargeTarget - myAmount))} more {config.unit} to resume sending
                </div>
              )}
            </div>
          ) : activeTargetCount > 0 ? (
            /* --- READY with targets --- */
            <div>
              <div className="flex items-center gap-2 text-xs mb-1_5">
                <span className="text-hammer-green font-bold">READY</span>
                {nextSendMs > 0 && (
                  <span className="text-hammer-muted">
                    next in {Math.ceil(nextSendMs / 1000)}s
                  </span>
                )}
              </div>

              {/* Main breakdown */}
              <div className="space-y-0_5 text-xs">
                <div className="flex justify-between">
                  <span className="text-hammer-muted">Have</span>
                  <span className={`font-bold text-${config.accentColor}`}>
                    {comma(myAmount)} {config.unit}
                    {config.thresholdMode === "pct" && maxAmount > 0 && (
                      <span className="text-hammer-muted font-normal ml-1">
                        ({Math.round(pctOfMax)}%)
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-hammer-muted">
                    Send {perTarget.length < activeTargetCount ? `${perTarget.length}/${activeTargetCount}` : perTarget.length} target{perTarget.length !== 1 ? "s" : ""}
                  </span>
                  <span className="font-bold text-hammer-green">
                    -{comma(totalSent)} {config.unit}
                    <span className="text-hammer-muted font-normal ml-1">
                      ({Math.round(effectivePct)}%)
                    </span>
                  </span>
                </div>

                {/* Per-target range when multiple */}
                {perTarget.length > 1 && (
                  <div className="flex justify-between text-2xs">
                    <span className="text-hammer-dim">Per target</span>
                    <span className="text-hammer-dim">
                      {short(perTarget[perTarget.length - 1])} ~ {short(perTarget[0])} {config.unit} each
                    </span>
                  </div>
                )}

                <div className="border-t border-hammer-border my-0_5" />

                <div className="flex justify-between">
                  <span className="text-hammer-muted">Keep</span>
                  <span className="font-bold text-hammer-text">
                    {comma(kept)} {config.unit}
                    {config.thresholdMode === "pct" && maxAmount > 0 && (
                      <span className="text-hammer-muted font-normal ml-1">
                        ({Math.round((kept / maxAmount) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Compounding note */}
              {perTarget.length > 1 && (
                <div className="text-2xs text-hammer-dim mt-1 italic">
                  {ratio}% of remaining to each target = {Math.round(effectivePct)}% total
                </div>
              )}
            </div>
          ) : (
            /* --- READY but no targets --- */
            <div className="text-xs">
              <span className="text-hammer-green font-bold">READY</span>
              <span className="text-hammer-muted ml-2">-- no targets configured</span>
            </div>
          )}

          {/* Session stats (only when we have log data) */}
          {log.length > 0 && (
            <div className="border-t border-hammer-border pt-1">
              <div className="flex justify-between text-2xs">
                <span className="text-hammer-dim">Session</span>
                <span className="text-hammer-muted">
                  {comma(sessionTotal)} {config.unit} sent across {log.length} send{log.length !== 1 ? "s" : ""}
                </span>
              </div>
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
        {/* Send Ratio */}
        <div className="mb-2">
          <div className="text-2xs text-hammer-muted mb-0_5">Send Ratio</div>
          <div className="flex flex-wrap gap-0_5">
            {RATIO_PRESETS.map((r) => (
              <PresetButton key={r} label={`${r}%`} active={ratio === r} onClick={() => setRatio(r)} />
            ))}
          </div>
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
        </div>

        {/* Threshold */}
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
                  if (config.thresholdMode === "abs") setCustomThreshold(String(t));
                }}
              />
            ))}
          </div>
          {config.thresholdMode === "abs" && (
            <div className="flex items-center gap-0_5 mt-1">
              <input
                type="number"
                value={customThreshold}
                onChange={(e) => setCustomThreshold(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomThresholdSubmit()}
                placeholder="Custom amount"
                min={0}
                className="w-20 bg-hammer-bg border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text outline-none focus:border-hammer-green"
              />
              <button
                onClick={handleCustomThresholdSubmit}
                className="px-1 py-0_5 rounded text-2xs bg-hammer-surface border border-hammer-border text-hammer-muted hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
              >
                Set
              </button>
            </div>
          )}
        </div>

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
