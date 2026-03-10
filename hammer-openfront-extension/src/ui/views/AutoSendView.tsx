/**
 * AutoSendView — Unified view for Auto Troops and Auto Gold.
 *
 * Both views share 95% of their layout and logic. This component
 * parameterizes the differences via a ResourceConfig.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, comma, fmtSec, fmtDuration } from "@shared/utils";
import { CountdownTimer } from "@ui/components/CountdownTimer";
import { TargetTag } from "@ui/components/TargetTag";

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
// Main component
// ---------------------------------------------------------------------------

export default function AutoSendView({ config }: { config: ResourceConfig }) {
  const running = useStore(config.selectRunning);
  const targets = useStore(config.selectTargets);
  const ratio = useStore(config.selectRatio);
  const threshold = useStore(config.selectThreshold);
  const cooldownSec = useStore(config.selectCooldownSec);
  const log = useStore(config.selectLog);
  const nextSend = useStore(config.selectNextSend);
  const allTeamMode = useStore(config.selectAllTeamMode);
  const allAlliesMode = useStore(config.selectAllAlliesMode);

  const setRatio = useStore(config.selectSetRatio);
  const setThreshold = useStore(config.selectSetThreshold);
  const setCooldown = useStore(config.selectSetCooldown);
  const toggleAllTeam = useStore(config.selectToggleAllTeam);
  const toggleAllAllies = useStore(config.selectToggleAllAllies);
  const addTarget = useStore(config.selectAddTarget);
  const removeTarget = useStore(config.selectRemoveTarget);

  const me = useMyPlayer();
  const teammates = useTeammates();
  const allies = useAllies();

  const myAmount = config.getMyAmount(me);
  const [customRatio, setCustomRatio] = useState("");
  const [customCooldown, setCustomCooldown] = useState(String(cooldownSec));
  const [customThreshold, setCustomThreshold] = useState(String(threshold));

  // Gain rate tracking
  const prevRef = useRef({ value: myAmount, ts: Date.now() });
  const [gainRate, setGainRate] = useState(0);
  useEffect(() => {
    const prev = prevRef.current;
    const dt = (Date.now() - prev.ts) / 1000;
    if (dt > 0.8) {
      setGainRate(Math.round((myAmount - prev.value) / dt));
      prevRef.current = { value: myAmount, ts: Date.now() };
    }
  }, [myAmount]);

  // Live preview calculation
  const sendAmount = Math.floor(myAmount * (ratio / 100));
  const activeTargetCount = allTeamMode
    ? teammates.length + (allAlliesMode ? allies.length : 0)
    : allAlliesMode
      ? allies.length + targets.length
      : targets.length;
  const perTarget = activeTargetCount > 0 ? Math.floor(sendAmount / activeTargetCount) : 0;
  const remaining = myAmount - sendAmount;

  const belowThreshold =
    config.thresholdMode === "pct"
      ? (remaining / (myAmount || 1)) * 100 < threshold
      : remaining < threshold;

  // Resolve active targets from stable LOCAL_KEYS sources
  const resolvedTargets = useMemo(() => {
    const result: Array<{ id: string; name: string; tag: "TM" | "AL" }> = [];
    const tmIds = new Set(teammates.map((t) => t.id));
    if (allTeamMode || allAlliesMode) {
      if (allTeamMode) {
        for (const p of teammates) {
          result.push({ id: p.id, name: p.displayName || p.name || "?", tag: "TM" });
        }
      }
      if (allAlliesMode) {
        for (const p of allies) {
          if (!result.some((r) => r.id === p.id)) {
            result.push({ id: p.id, name: p.displayName || p.name || "?", tag: "AL" });
          }
        }
      }
    }
    for (const t of targets) {
      if (!result.some((r) => r.id === t.id)) {
        result.push({ id: t.id, name: t.name, tag: t.type || (tmIds.has(t.id) ? "TM" : "AL") });
      }
    }
    return result;
  }, [allTeamMode, allAlliesMode, teammates, allies, targets]);

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

  const recentLog = log.slice(0, 10);

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

  // -- Threshold display logic --
  const thresholdStatusLabel = config.thresholdMode === "pct" ? "Threshold" : "Min Keep";
  const thresholdStatusValue =
    config.thresholdMode === "pct" ? `${threshold}%` : short(threshold);
  const afterSendLabel = config.thresholdMode === "pct" ? "After Send" : "vs Threshold";
  const afterSendValue =
    config.thresholdMode === "pct"
      ? `${myAmount > 0 ? Math.round((remaining / myAmount) * 100) : 0}% of max`
      : threshold > 0
        ? `${Math.round((remaining / threshold) * 100)}%`
        : "no min";

  // Recharge bar width
  const rechargeWidth =
    config.thresholdMode === "pct"
      ? Math.min(100, belowThreshold ? ((myAmount - sendAmount) / ((myAmount * threshold) / 100 || 1)) * 100 : 100)
      : Math.min(100, belowThreshold ? (remaining / (threshold || 1)) * 100 : 100);

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Status Header */}
      <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                running ? "bg-hammer-green animate-pulse" : "bg-hammer-red"
              }`}
            />
            <span className={`text-sm font-bold ${running ? "text-hammer-green" : "text-hammer-red"}`}>
              {running ? "RUNNING" : "STOPPED"}
            </span>
            {running && belowThreshold && (
              <span className="text-sm font-bold text-hammer-warn animate-pulse">RECHARGING</span>
            )}
          </div>
          <span className="text-2xs text-hammer-muted">CD: {cooldownSec}s</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-hammer-muted text-2xs">Ratio</span>
            <span className="text-hammer-blue font-bold">{ratio}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-hammer-muted text-2xs">{thresholdStatusLabel}</span>
            <span className="text-hammer-gold font-bold">{thresholdStatusValue}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-hammer-muted text-2xs">{config.label}</span>
            <span className={`font-bold text-${config.accentColor}`}>{short(myAmount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-hammer-muted text-2xs">Rate</span>
            <span className={`font-bold ${gainRate >= 0 ? "text-hammer-green" : "text-hammer-red"}`}>
              {gainRate >= 0 ? "+" : ""}{short(Math.abs(gainRate))}/s
            </span>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <Section title="Live Preview">
        <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="flex justify-between">
              <span className="text-hammer-muted">Send Amount</span>
              <span className="text-hammer-gold font-bold">{comma(sendAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-muted">Per Target</span>
              <span className="text-hammer-blue font-bold">
                {comma(perTarget)} <span className="text-hammer-muted text-2xs">({activeTargetCount})</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-muted">Remaining</span>
              <span className={`font-bold ${belowThreshold ? "text-hammer-red" : "text-hammer-green"}`}>
                {comma(remaining)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-muted">{afterSendLabel}</span>
              <span className={`font-bold ${belowThreshold ? "text-hammer-red" : "text-hammer-dim"}`}>
                {afterSendValue}
              </span>
            </div>
          </div>
          {belowThreshold && myAmount > 0 && (
            <div className="mt-1 text-2xs text-hammer-red bg-hammer-red/10 rounded px-1 py-0_5">
              Below threshold — send will be skipped
            </div>
          )}

          {/* Recharge Bar */}
          {running && (
            <div className="mt-1">
              <div className="flex items-center justify-between text-2xs mb-0_5">
                <span className="text-hammer-muted">Send Ready</span>
                <span className={belowThreshold ? "text-hammer-warn font-bold" : "text-hammer-green"}>
                  {belowThreshold ? "Recharging..." : "Ready"}
                </span>
              </div>
              <div className="w-full bg-hammer-bg rounded h-1_5 overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${belowThreshold ? "bg-hammer-gold" : "bg-hammer-green"}`}
                  style={{ width: `${rechargeWidth}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Section>

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
                <div className="flex flex-wrap gap-0_5">
                  {availablePlayers.map((p) => (
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

      {/* Controls */}
      <Section title="Controls">
        <div className="flex gap-1">
          <button
            onClick={() => (running ? config.stop() : config.start())}
            className={`flex-1 py-1 rounded text-xs font-bold border transition-colors cursor-pointer ${
              running
                ? "bg-hammer-red/20 border-hammer-red text-hammer-red hover:bg-hammer-red/30"
                : "bg-hammer-green/20 border-hammer-green text-hammer-green hover:bg-hammer-green/30"
            }`}
          >
            {running ? "STOP" : "START"}
          </button>
        </div>
      </Section>

      {/* Activity */}
      <Section title="Activity">
        <div className="mb-1">
          <div className="text-2xs text-hammer-muted mb-0_5">Countdowns</div>
          {running && resolvedTargets.length > 0 ? (
            <div className="flex flex-col gap-0_5">
              {resolvedTargets.map((rt) => {
                const ns = nextSend[rt.id];
                return (
                  <div
                    key={rt.id}
                    className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border text-2xs"
                  >
                    <span className="text-hammer-text truncate mr-2">
                      <span className={rt.tag === "TM" ? "text-hammer-blue" : "text-hammer-green"}>
                        [{rt.tag}]
                      </span>{" "}
                      {rt.name}
                    </span>
                    <span className={`text-${config.accentColor} text-xs font-bold shrink-0 mr-1`}>
                      {short(perTarget)}{config.unit}
                    </span>
                    {ns ? (
                      <CountdownTimer nextSend={ns} cooldownSec={cooldownSec} accentColor={config.accentColor} />
                    ) : (
                      <span className="text-2xs text-hammer-dim min-w-20">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-2xs text-hammer-dim">
              {running ? "Waiting for first cycle..." : "Idle"}
            </div>
          )}
        </div>

        {/* Recent Log */}
        <div>
          <div className="text-2xs text-hammer-muted mb-0_5">Recent Log</div>
          {recentLog.length > 0 ? (
            <div className="flex flex-col gap-0_5">
              {recentLog.map((entry, i) => (
                <div
                  key={`${entry.ts}-${i}`}
                  className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border text-2xs"
                >
                  <div className="flex items-center gap-1 truncate mr-2">
                    <span className="text-hammer-muted">{fmtDuration(Date.now() - entry.ts)}</span>
                    <span className="text-hammer-text truncate">{entry.target}</span>
                  </div>
                  <span className={`text-${config.accentColor} shrink-0`}>
                    {short(entry.amount)}{config.unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-2xs text-hammer-dim">
              {running ? "Waiting for first send..." : "No activity yet."}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
