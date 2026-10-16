import { useCallback } from "react";
import { useStore } from "@store/index";
import { Section, StatCard, PresetButton } from "@ui/components/ds";
import { dTroops, short } from "@shared/utils";
import type { AttackRatioMode, AttackRatioTelemetry } from "@store/slices/attack-ratio";
import { asAttackRatioStart, asAttackRatioStop } from "@content/automation/attack-ratio";

const MODES: { id: AttackRatioMode; label: string; blurb: string }[] = [
  {
    id: "peak",
    label: "Peak 42%",
    blurb:
      "Each attack sends only what's above 42% of your max — the level where troops regrow fastest. At or below 42%, attacks are held until you regen.",
  },
  {
    id: "breakeven",
    label: "Hold %",
    blurb: "Same as Peak, but you pick the level to hold. Attacks send only what's above it.",
  },
  {
    id: "assist",
    label: "Fixed %",
    blurb: "Each attack sends a fixed % of your troops, and never drops you below the floor.",
  },
  {
    id: "manual",
    label: "Watch",
    blurb: "Shows the numbers only. Your attacks and slider are untouched.",
  },
];

const HOLD_PRESETS = [30, 42, 50, 60, 70];
const CAP_PRESETS = [25, 50, 75, 100];
const FIXED_PRESETS = [5, 10, 20, 30, 50];
const FLOOR_PRESETS = [0, 25, 42, 50];

/** One plain-language line for where the governor is right now. */
export function governorStatusLine(
  running: boolean,
  tel: AttackRatioTelemetry | null,
): { text: string; tone: "on" | "warn" | "dim" } {
  if (!running) return { text: "Governor off", tone: "dim" };
  if (!tel) return { text: "Waiting for a match…", tone: "dim" };
  switch (tel.state) {
    case "watch":
      return { text: "Watching — your attacks are untouched", tone: "dim" };
    case "paused":
      return { text: "Paused — spawn phase", tone: "dim" };
    case "standby":
      return {
        text: `Standby — engages when troops reach ${Math.round(tel.armPct)}% (now ${Math.round(tel.troopPct)}%)`,
        tone: "dim",
      };
    case "holding":
      return {
        text: `Holding — nothing above ${Math.round(tel.armPct)}% to send${tel.held ? ` · ${tel.held} held` : ""}`,
        tone: "warn",
      };
    case "governing":
      return { text: `Governing — next attack sends ${short(dTroops(tel.allowed))}`, tone: "on" };
    default:
      return { text: "Governor off", tone: "dim" };
  }
}

export default function AttackRatioView() {
  const running = useStore((s) => s.attackRatioRunning);
  const mode = useStore((s) => s.attackRatioMode);
  const fixedPct = useStore((s) => s.attackRatioBasePct);
  const holdPct = useStore((s) => s.attackRatioBreakevenPct);
  const floorPct = useStore((s) => s.attackRatioFloorPct);
  const capPct = useStore((s) => s.attackRatioMaxCap);
  const tel = useStore((s) => s.attackRatioTelemetry);

  const setMode = useStore((s) => s.setAttackRatioMode);
  const setFixedPct = useStore((s) => s.setAttackRatioBasePct);
  const setHoldPct = useStore((s) => s.setAttackRatioBreakevenPct);
  const setFloorPct = useStore((s) => s.setAttackRatioFloorPct);
  const setCapPct = useStore((s) => s.setAttackRatioMaxCap);

  const handleToggle = useCallback(() => {
    if (running) asAttackRatioStop();
    else asAttackRatioStart();
  }, [running]);

  const status = governorStatusLine(running, tel);
  const toneClass =
    status.tone === "on" ? "text-hammer-green" : status.tone === "warn" ? "text-hammer-warn" : "text-hammer-muted";
  const activeBlurb = MODES.find((m) => m.id === mode)?.blurb ?? "";
  const slope = tel ? dTroops(tel.netSlope) : 0;
  const slopeArrow = slope > 0.5 ? "▲" : slope < -0.5 ? "▼" : "●";

  return (
    <div className="space-y-2">
      {/* Status + toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${running ? "bg-hammer-green animate-pulse" : "bg-hammer-dim"}`}
          />
          <span className={`text-xs truncate ${toneClass}`}>{status.text}</span>
        </div>
        <button
          onClick={handleToggle}
          title="Alt+G toggles from anywhere in the game"
          className={`shrink-0 px-3 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${
            running
              ? "bg-hammer-red/20 text-hammer-red border border-hammer-red/50 hover:bg-hammer-red/30"
              : "bg-hammer-green/20 text-hammer-green border border-hammer-green/50 hover:bg-hammer-green/30"
          }`}
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>

      <div className="text-2xs text-hammer-dim">
        You still pick where and when to attack — this decides how many troops each attack
        takes. It reads your true max troops from the game (cities included), and counts
        troops already sent but not yet deducted, so rapid clicking can't overspend. Each
        match it stays in standby until your troops first reach the target, so early expansion
        is left alone. <span className="text-hammer-muted">Alt+G</span> toggles it mid-fight.
      </div>

      {/* Live telemetry */}
      <Section title="Live">
        <div className="grid grid-cols-2 gap-1">
          <StatCard
            label="Troops"
            value={tel ? `${Math.round(tel.troopPct)}% of max` : "—"}
            sub={tel ? `${short(dTroops(tel.troops))} / ${short(dTroops(tel.maxTroops))}` : undefined}
          />
          <StatCard
            label="Regen"
            value={tel ? `+${short(dTroops(tel.regenPerSec))}/s` : "—"}
            color="text-hammer-blue"
            sub={tel ? `${slopeArrow} net ${short(Math.abs(slope))}/s` : undefined}
          />
          <StatCard
            label="Next attack"
            value={tel && running && tel.state === "governing" ? short(dTroops(tel.allowed)) : "—"}
            color="text-hammer-green"
            sub={tel && tel.pending > 0 ? `${short(dTroops(tel.pending))} in flight` : undefined}
          />
          <StatCard
            label="This match"
            value={tel ? `${tel.held} held` : "—"}
            sub={tel ? `${tel.trimmed} trimmed` : undefined}
          />
        </div>
      </Section>

      {/* Mode */}
      <Section title="Mode">
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <PresetButton key={m.id} label={m.label} active={mode === m.id} onClick={() => setMode(m.id)} />
          ))}
        </div>
        <div className="text-2xs text-hammer-dim mt-1">{activeBlurb}</div>
      </Section>

      {mode === "breakeven" && (
        <Section title="Hold troops at">
          <div className="flex flex-wrap gap-1">
            {HOLD_PRESETS.map((p) => (
              <PresetButton key={p} label={`${p}%`} active={holdPct === p} onClick={() => setHoldPct(p)} />
            ))}
          </div>
        </Section>
      )}

      {(mode === "peak" || mode === "breakeven") && (
        <Section title="Max per attack">
          <div className="flex flex-wrap gap-1">
            {CAP_PRESETS.map((p) => (
              <PresetButton key={p} label={`${p}%`} active={capPct === p} onClick={() => setCapPct(p)} />
            ))}
          </div>
          <div className="text-2xs text-hammer-dim mt-1">
            No single attack takes more than this % of your current troops — lower it to split a
            big surplus across several attacks.
          </div>
        </Section>
      )}

      {mode === "assist" && (
        <>
          <Section title="Each attack sends">
            <div className="flex flex-wrap gap-1">
              {FIXED_PRESETS.map((p) => (
                <PresetButton key={p} label={`${p}%`} active={fixedPct === p} onClick={() => setFixedPct(p)} />
              ))}
            </div>
          </Section>
          <Section title="Never drop below">
            <div className="flex flex-wrap gap-1">
              {FLOOR_PRESETS.map((p) => (
                <PresetButton
                  key={p}
                  label={p === 0 ? "Off" : `${p}%`}
                  active={floorPct === p}
                  onClick={() => setFloorPct(p)}
                />
              ))}
            </div>
            <div className="text-2xs text-hammer-dim mt-1">
              % of your max troops kept home as a defensive reserve.
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
