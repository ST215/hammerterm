import { useState, useCallback, useEffect, useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, comma, fmtSec, fmtDuration } from "@shared/utils";
import type { AutoGoldTarget, AutoGoldLogEntry } from "@store/slices/auto-gold";

const RATIO_PRESETS = [5, 10, 15, 20, 25, 33, 50, 75, 100];
const THRESHOLD_PRESETS = [0, 1000, 5000, 10000, 50000];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-xs text-hammer-muted uppercase tracking-wider mb-1 border-b border-hammer-border pb-0_5">
        {title}
      </div>
      {children}
    </div>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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

function TargetTag({
  target,
  onRemove,
}: {
  target: AutoGoldTarget;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-0_5 bg-hammer-surface border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text">
      {target.name}
      <button
        onClick={onRemove}
        className="text-hammer-red hover:text-red-400 cursor-pointer ml-0_5"
        title="Remove target"
      >
        x
      </button>
    </span>
  );
}

function CountdownTimer({ nextSend }: { nextSend: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.ceil((nextSend - now) / 1000));
  return (
    <span className="text-hammer-blue text-2xs font-mono">
      {remaining > 0 ? fmtSec(remaining) : "Ready"}
    </span>
  );
}

export default function AutoGoldView() {
  const running = useStore((s) => s.asGoldRunning);
  const targets = useStore((s) => s.asGoldTargets);
  const ratio = useStore((s) => s.asGoldRatio);
  const threshold = useStore((s) => s.asGoldThreshold);
  const cooldownSec = useStore((s) => s.asGoldCooldownSec);
  const log = useStore((s) => s.asGoldLog);
  const lastSend = useStore((s) => s.asGoldLastSend);
  const nextSend = useStore((s) => s.asGoldNextSend);
  const allTeamMode = useStore((s) => s.asGoldAllTeamMode);
  const allAlliesMode = useStore((s) => s.asGoldAllAlliesMode);

  const setRunning = useStore((s) => s.setAsGoldRunning);
  const setRatio = useStore((s) => s.setAsGoldRatio);
  const setThreshold = useStore((s) => s.setAsGoldThreshold);
  const setCooldown = useStore((s) => s.setAsGoldCooldown);
  const toggleAllTeam = useStore((s) => s.toggleAsGoldAllTeamMode);
  const toggleAllAllies = useStore((s) => s.toggleAsGoldAllAlliesMode);
  const addTarget = useStore((s) => s.addAsGoldTarget);
  const removeTarget = useStore((s) => s.removeAsGoldTarget);

  const me = useMyPlayer();
  const teammates = useTeammates();
  const allies = useAllies();

  const myGold = Number(me?.gold ?? 0);
  const [customRatio, setCustomRatio] = useState("");
  const [customCooldown, setCustomCooldown] = useState(String(cooldownSec));
  const [customThreshold, setCustomThreshold] = useState(String(threshold));

  // Live preview calculation
  const sendAmount = Math.floor(myGold * (ratio / 100));
  const activeTargetCount = allTeamMode
    ? teammates.length + (allAlliesMode ? allies.length : 0)
    : allAlliesMode
      ? allies.length + targets.length
      : targets.length;
  const perTarget = activeTargetCount > 0 ? Math.floor(sendAmount / activeTargetCount) : 0;
  const remaining = myGold - sendAmount;
  const belowThreshold = remaining < threshold;

  // Available players for manual target picker
  const targetIds = useMemo(
    () => new Set(targets.map((t) => t.id)),
    [targets],
  );

  const availablePlayers = useMemo(() => {
    if (allTeamMode && allAlliesMode) return [];
    const pool = [
      ...(allTeamMode ? [] : teammates),
      ...(allAlliesMode ? [] : allies),
    ];
    return pool.filter((p) => !targetIds.has(p.id));
  }, [teammates, allies, allTeamMode, allAlliesMode, targetIds]);

  const recentLog = log.slice(0, 10);

  const handleCooldownChange = useCallback(
    (val: string) => {
      setCustomCooldown(val);
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 10 && n <= 60) {
        setCooldown(n);
      }
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
    if (!isNaN(n) && n >= 0) {
      setThreshold(n);
    }
  }, [customThreshold, setThreshold]);

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Status Header */}
      <div className="flex items-center justify-between bg-hammer-surface rounded p-2 border border-hammer-border">
        <div className="flex items-center gap-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              running
                ? "bg-hammer-green animate-pulse"
                : "bg-hammer-red"
            }`}
          />
          <span
            className={`text-xs font-bold ${
              running ? "text-hammer-green" : "text-hammer-red"
            }`}
          >
            {running ? "RUNNING" : "STOPPED"}
          </span>
        </div>
        <div className="flex gap-2 text-2xs text-hammer-muted">
          <span>Ratio: {ratio}%</span>
          <span>Min: {short(threshold)}</span>
          <span>CD: {cooldownSec}s</span>
        </div>
      </div>

      {/* Live Preview */}
      <Section title="Live Preview">
        <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
          <div className="grid grid-cols-2 gap-1 text-2xs">
            <div className="flex justify-between">
              <span className="text-hammer-muted">Current Gold</span>
              <span className="text-hammer-gold">{comma(myGold)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-muted">Amount to Send</span>
              <span className="text-hammer-gold">{comma(sendAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-muted">Per Target</span>
              <span className="text-hammer-blue">
                {comma(perTarget)} ({activeTargetCount} targets)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-hammer-muted">Remaining</span>
              <span
                className={
                  belowThreshold ? "text-hammer-red" : "text-hammer-green"
                }
              >
                {comma(remaining)}
              </span>
            </div>
          </div>
          {belowThreshold && myGold > 0 && (
            <div className="mt-1 text-2xs text-hammer-red bg-hammer-red/10 rounded px-1 py-0_5">
              Below threshold -- send will be skipped
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
              <PresetButton
                key={r}
                label={`${r}%`}
                active={ratio === r}
                onClick={() => setRatio(r)}
              />
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

        {/* Threshold (gold amount, not percentage) */}
        <div className="mb-2">
          <div className="text-2xs text-hammer-muted mb-0_5">
            Threshold (min gold to keep)
          </div>
          <div className="flex flex-wrap gap-0_5">
            {THRESHOLD_PRESETS.map((t) => (
              <PresetButton
                key={t}
                label={t === 0 ? "0" : short(t)}
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
              onKeyDown={(e) =>
                e.key === "Enter" && handleCustomThresholdSubmit()
              }
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
        </div>

        {/* Cooldown */}
        <div>
          <div className="text-2xs text-hammer-muted mb-0_5">
            Cooldown (seconds)
          </div>
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
        {/* Group Mode Toggles */}
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

        {/* Manual Targets */}
        {!allTeamMode || !allAlliesMode ? (
          <div>
            {targets.length > 0 && (
              <div className="flex flex-wrap gap-0_5 mb-1">
                {targets.map((t) => (
                  <TargetTag
                    key={t.id}
                    target={t}
                    onRemove={() => removeTarget(t.id)}
                  />
                ))}
              </div>
            )}

            {availablePlayers.length > 0 && (
              <div>
                <div className="text-2xs text-hammer-muted mb-0_5">
                  Add Target
                </div>
                <div className="flex flex-wrap gap-0_5">
                  {availablePlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        addTarget(
                          p.id,
                          p.displayName || p.name || "Unknown",
                        )
                      }
                      className="px-1 py-0_5 rounded text-2xs bg-hammer-bg border border-hammer-border text-hammer-text hover:border-hammer-gold hover:text-hammer-gold transition-colors cursor-pointer"
                    >
                      + {p.displayName || p.name || "Unknown"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {targets.length === 0 && availablePlayers.length === 0 && !allTeamMode && !allAlliesMode && (
              <div className="text-2xs text-hammer-muted">
                No players available to add as targets.
              </div>
            )}
          </div>
        ) : (
          <div className="text-2xs text-hammer-muted">
            Sending to all teammates and allies.
          </div>
        )}
      </Section>

      {/* Controls */}
      <Section title="Controls">
        <div className="flex gap-1">
          <button
            onClick={() => setRunning(!running)}
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
        {/* Per-target countdowns */}
        {Object.keys(nextSend).length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-muted mb-0_5">Countdowns</div>
            <div className="flex flex-col gap-0_5">
              {Object.entries(nextSend).map(([targetId, ns]) => {
                const target = targets.find((t) => t.id === targetId);
                const targetName = target?.name ?? targetId;
                return (
                  <div
                    key={targetId}
                    className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border text-2xs"
                  >
                    <span className="text-hammer-text truncate mr-2">
                      {targetName}
                    </span>
                    <CountdownTimer nextSend={ns} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Log */}
        {recentLog.length > 0 ? (
          <div>
            <div className="text-2xs text-hammer-muted mb-0_5">Recent Log</div>
            <div className="flex flex-col gap-0_5">
              {recentLog.map((entry, i) => (
                <div
                  key={`${entry.ts}-${i}`}
                  className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border text-2xs"
                >
                  <div className="flex items-center gap-1 truncate mr-2">
                    <span className="text-hammer-muted">
                      {fmtDuration(Date.now() - entry.ts)}
                    </span>
                    <span className="text-hammer-text truncate">
                      {entry.target}
                    </span>
                  </div>
                  <span className="text-hammer-gold shrink-0">
                    {short(entry.amount)}g
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-2xs text-hammer-muted">
            No activity yet. Start the auto-sender to begin.
          </div>
        )}
      </Section>
    </div>
  );
}
