import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, comma, fmtSec, fmtDuration, dTroops } from "@shared/utils";
import { asTroopsStart, asTroopsStop } from "@content/automation/auto-troops";
import type { AutoTroopsLogEntry, AutoTroopsTarget } from "@store/slices/auto-troops";

const RATIO_PRESETS = [5, 10, 15, 20, 25, 33, 50, 75, 100];
const THRESHOLD_PRESETS = [0, 25, 50, 75];

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
  target: AutoTroopsTarget;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-0_5 bg-hammer-surface border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text">
      {target.type && (
        <span className={target.type === "TM" ? "text-hammer-blue" : "text-hammer-green"}>
          [{target.type}]
        </span>
      )}
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

function CountdownTimer({ nextSend, cooldownSec }: { nextSend: number; cooldownSec: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.ceil((nextSend - now) / 1000));
  const elapsed = cooldownSec - remaining;
  const pct = cooldownSec > 0 ? Math.min(100, (elapsed / cooldownSec) * 100) : 100;

  return (
    <div className="flex items-center gap-1 min-w-20">
      <div className="flex-1 bg-hammer-bg rounded h-1 overflow-hidden">
        <div
          className="h-full bg-hammer-blue rounded"
          style={{ width: `${pct}%`, transition: "width 0.25s linear" }}
        />
      </div>
      <span className={`text-2xs font-mono shrink-0 ${remaining > 0 ? "text-hammer-blue" : "text-hammer-green"}`}>
        {remaining > 0 ? fmtSec(remaining) : "Ready"}
      </span>
    </div>
  );
}

export default function AutoTroopsView() {
  const running = useStore((s) => s.asTroopsRunning);
  const targets = useStore((s) => s.asTroopsTargets);
  const playersById = useStore((s) => s.playersById);
  const ratio = useStore((s) => s.asTroopsRatio);
  const threshold = useStore((s) => s.asTroopsThreshold);
  const cooldownSec = useStore((s) => s.asTroopsCooldownSec);
  const log = useStore((s) => s.asTroopsLog);
  const lastSend = useStore((s) => s.asTroopsLastSend);
  const nextSend = useStore((s) => s.asTroopsNextSend);
  const allTeamMode = useStore((s) => s.asTroopsAllTeamMode);
  const allAlliesMode = useStore((s) => s.asTroopsAllAlliesMode);

  const setRatio = useStore((s) => s.setAsTroopsRatio);
  const setThreshold = useStore((s) => s.setAsTroopsThreshold);
  const setCooldown = useStore((s) => s.setAsTroopsCooldown);
  const toggleAllTeam = useStore((s) => s.toggleAsTroopsAllTeamMode);
  const toggleAllAllies = useStore((s) => s.toggleAsTroopsAllAlliesMode);
  const addTarget = useStore((s) => s.addAsTroopsTarget);
  const removeTarget = useStore((s) => s.removeAsTroopsTarget);

  const me = useMyPlayer();
  const teammates = useTeammates();
  const allies = useAllies();

  const myTroops = dTroops(me?.troops);
  const [customRatio, setCustomRatio] = useState("");
  const [customCooldown, setCustomCooldown] = useState(String(cooldownSec));

  // Gain rate tracking
  const prevRef = useRef({ value: myTroops, ts: Date.now() });
  const [gainRate, setGainRate] = useState(0);
  useEffect(() => {
    const prev = prevRef.current;
    const dt = (Date.now() - prev.ts) / 1000;
    if (dt > 0.8) {
      setGainRate(Math.round((myTroops - prev.value) / dt));
      prevRef.current = { value: myTroops, ts: Date.now() };
    }
  }, [myTroops]);

  // Live preview calculation
  const sendAmount = Math.floor(myTroops * (ratio / 100));
  const activeTargetCount = allTeamMode
    ? teammates.length + (allAlliesMode ? allies.length : 0)
    : allAlliesMode
      ? allies.length + targets.length
      : targets.length;
  const perTarget = activeTargetCount > 0 ? Math.floor(sendAmount / activeTargetCount) : 0;
  const remaining = myTroops - sendAmount;
  const belowThreshold = (remaining / (myTroops || 1)) * 100 < threshold;

  // Resolve active targets from stable LOCAL_KEYS sources (not from nextSend which blinks)
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

  // Available players for manual target picker (exclude already-added targets)
  const targetIds = useMemo(
    () => new Set(targets.map((t) => t.id)),
    [targets],
  );

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
            <span className="text-hammer-muted text-2xs">Threshold</span>
            <span className="text-hammer-gold font-bold">{threshold}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-hammer-muted text-2xs">Troops</span>
            <span className="text-hammer-text font-bold">{short(myTroops)}</span>
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
              <span className="text-hammer-muted">After Send</span>
              <span className={`font-bold ${belowThreshold ? "text-hammer-red" : "text-hammer-dim"}`}>
                {myTroops > 0 ? `${Math.round((remaining / myTroops) * 100)}%` : "0%"} of max
              </span>
            </div>
          </div>
          {belowThreshold && myTroops > 0 && (
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
                  style={{ width: `${Math.min(100, belowThreshold ? ((myTroops - sendAmount) / (myTroops * threshold / 100 || 1)) * 100 : 100)}%` }}
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

        {/* Threshold */}
        <div className="mb-2">
          <div className="text-2xs text-hammer-muted mb-0_5">
            Threshold (min troops %)
          </div>
          <div className="flex flex-wrap gap-0_5">
            {THRESHOLD_PRESETS.map((t) => (
              <PresetButton
                key={t}
                label={`${t}%`}
                active={threshold === t}
                onClick={() => setThreshold(t)}
              />
            ))}
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

        {/* Manual Targets (when not in full group mode) */}
        {!allTeamMode || !allAlliesMode ? (
          <div>
            {/* Current Targets */}
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

            {/* Add Targets */}
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
                          p.playerType,
                        )
                      }
                      className="px-1 py-0_5 rounded text-2xs bg-hammer-bg border border-hammer-border text-hammer-text hover:border-hammer-green hover:text-hammer-green transition-colors cursor-pointer"
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
              <div className="text-2xs text-hammer-muted">
                No players available to add as targets.
              </div>
            )}
          </div>
        ) : (
          <div className="text-2xs text-hammer-muted">
            Sending to {allTeamMode ? `${teammates.length} teammate${teammates.length !== 1 ? "s" : ""}` : ""}{allTeamMode && allAlliesMode ? " + " : ""}{allAlliesMode ? `${allies.length} ${allies.length !== 1 ? "allies" : "ally"}` : ""}.
          </div>
        )}
      </Section>

      {/* Controls */}
      <Section title="Controls">
        <div className="flex gap-1">
          <button
            onClick={() => running ? asTroopsStop() : asTroopsStart()}
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

      {/* Activity — uses resolvedTargets (stable, from LOCAL_KEYS) instead of nextSend keys */}
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
                      <span className={rt.tag === "TM" ? "text-hammer-blue" : "text-hammer-green"}>[{rt.tag}]</span>{" "}
                      {rt.name}
                    </span>
                    <span className="text-hammer-green text-xs font-bold shrink-0 mr-1">{short(perTarget)}t</span>
                    {ns ? (
                      <CountdownTimer nextSend={ns} cooldownSec={cooldownSec} />
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
                    <span className="text-hammer-muted">
                      {fmtDuration(Date.now() - entry.ts)}
                    </span>
                    <span className="text-hammer-text truncate">
                      {entry.target}
                    </span>
                  </div>
                  <span className="text-hammer-green shrink-0">
                    {short(entry.amount)}t
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
