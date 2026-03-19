/**
 * AutoSendView — Unified view for Auto Troops and Auto Gold.
 *
 * Both views share 95% of their layout and logic. This component
 * parameterizes the differences via a ResourceConfig.
 */

import { useState, useCallback, useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, comma } from "@shared/utils";
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
  const maxAmount = config.getMaxAmount ? config.getMaxAmount(me) : 0;
  const [customRatio, setCustomRatio] = useState("");
  const [customCooldown, setCustomCooldown] = useState(String(cooldownSec));
  const [customThreshold, setCustomThreshold] = useState(String(threshold));
  const [targetSearch, setTargetSearch] = useState("");

  // Send preview
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
      ? maxAmount > 0 && (myAmount / maxAmount) * 100 < threshold
      : remaining < threshold;

  // Recharge progress
  const rechargeTarget =
    config.thresholdMode === "pct"
      ? (threshold / 100) * maxAmount
      : sendAmount > 0
        ? threshold / (1 - ratio / 100)
        : threshold;

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
      {/* Status + Controls — merged */}
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

        {/* Row 2: ready / recharging detail */}
        {running && (
          <div className="mt-1_5">
            {belowThreshold ? (
              <>
                <div className="flex items-center justify-between text-xs mb-0_5">
                  <span className="text-hammer-warn font-bold">RECHARGING</span>
                  <span className="text-hammer-muted">
                    {short(myAmount)} / {short(rechargeTarget)} {config.unit}
                  </span>
                </div>
                <div className="w-full bg-hammer-bg rounded h-1_5 overflow-hidden">
                  <div
                    className="h-full rounded bg-hammer-gold transition-all"
                    style={{ width: `${rechargeTarget > 0 ? Math.min(100, (myAmount / rechargeTarget) * 100) : 0}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="text-xs">
                <span className="text-hammer-green font-bold">READY</span>
                {activeTargetCount > 0 ? (
                  <span className="text-hammer-muted ml-2">
                    → <span className={`text-${config.accentColor} font-bold`}>{short(perTarget)} {config.unit}</span>
                    {" "}× {activeTargetCount} target{activeTargetCount !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-hammer-muted ml-2">— no targets configured</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
