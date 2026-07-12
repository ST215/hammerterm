import { useCallback } from "react";
import { useStore } from "@store/index";
import { Section, StatCard, PresetButton } from "@ui/components/ds";
import { dTroops, short } from "@shared/utils";
import { OPTIMAL_REGEN_PCT } from "@shared/logic/troop-math";
import type { AttackRatioMode } from "@store/slices/attack-ratio";
import {
  asAttackRatioStart,
  asAttackRatioStop,
} from "@content/automation/attack-ratio";

const MODES: { id: AttackRatioMode; label: string; blurb: string }[] = [
  { id: "manual", label: "Manual", blurb: "Observe only — you drive the slider/T-Y; the governor just shows the numbers." },
  { id: "assist", label: "Assist", blurb: "Hold a constant % per attack, with floor + send cap protecting you." },
  { id: "breakeven", label: "Break-even", blurb: "Hold your army at a target % — spends the surplus, keeps your reserve." },
  { id: "peak", label: "Peak 42%", blurb: "Hold at the 42% regen peak — most troops produced/min for sustained slamming." },
];

const BASE_PRESETS = [2, 3, 5, 10, 15, 20];
const HOLD_PRESETS = [30, 42, 50, 60, 70];
const FLOOR_PRESETS = [0, 25, 42, 50, 60];
const CAP_PRESETS = [15, 20, 25, 30, 50, 75, 100];

export default function AttackRatioView() {
  const running = useStore((s) => s.attackRatioRunning);
  const mode = useStore((s) => s.attackRatioMode);
  const basePct = useStore((s) => s.attackRatioBasePct);
  const breakevenPct = useStore((s) => s.attackRatioBreakevenPct);
  const floorPct = useStore((s) => s.attackRatioFloorPct);
  const maxCap = useStore((s) => s.attackRatioMaxCap);
  const tel = useStore((s) => s.attackRatioTelemetry);

  const setMode = useStore((s) => s.setAttackRatioMode);
  const setBasePct = useStore((s) => s.setAttackRatioBasePct);
  const setBreakevenPct = useStore((s) => s.setAttackRatioBreakevenPct);
  const setFloorPct = useStore((s) => s.setAttackRatioFloorPct);
  const setMaxCap = useStore((s) => s.setAttackRatioMaxCap);

  const handleToggle = useCallback(() => {
    if (running) asAttackRatioStop();
    else asAttackRatioStart();
  }, [running]);

  const activeBlurb = MODES.find((m) => m.id === mode)?.blurb ?? "";
  const isManual = mode === "manual";

  // Telemetry (internal units → display units for the readout).
  const ratioLabel = tel && !isManual ? `${Math.round(tel.ratio * 100)}%` : isManual ? "Manual" : "—";
  const regenDisp = tel ? short(dTroops(tel.regenPerSec)) : "—";
  const troopPct = tel ? Math.round(tel.troopPct) : null;
  const slopeDisp = tel ? dTroops(tel.netSlope) : 0;
  const slopeArrow = slopeDisp > 0.5 ? "▲" : slopeDisp < -0.5 ? "▼" : "●";
  const slopeColor =
    slopeDisp > 0.5 ? "text-hammer-green" : slopeDisp < -0.5 ? "text-hammer-red" : "text-hammer-muted";
  const peakTroops = tel ? dTroops(tel.maxT * OPTIMAL_REGEN_PCT) : 0;
  const toPeak = tel ? dTroops(tel.maxT * OPTIMAL_REGEN_PCT - tel.troops) : 0;

  return (
    <div className="space-y-2">
      {/* Status + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${running ? "bg-hammer-green animate-pulse" : "bg-hammer-dim"}`}
          />
          <span className="text-xs text-hammer-text">
            {running
              ? isManual
                ? <>Watching — <span className="text-hammer-muted">you control the ratio</span></>
                : tel?.belowSetpoint
                  ? <>Governing — <span className="text-hammer-warn">below setpoint — minimum send</span></>
                  : <>Governing — <span className="text-hammer-green">{ratioLabel}</span></>
              : "Governor off"}
          </span>
        </div>
        <button
          onClick={handleToggle}
          className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${
            running
              ? "bg-hammer-red/20 text-hammer-red border border-hammer-red/50 hover:bg-hammer-red/30"
              : "bg-hammer-green/20 text-hammer-green border border-hammer-green/50 hover:bg-hammer-green/30"
          }`}
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>

      <div className="text-2xs text-hammer-dim">
        You pick where & when to attack — this only sets the slider so each attack commits the
        right amount. While on, the governor owns the ratio; on Stop (or Manual) it hands control
        back to your native slider. Nothing is sent to the server.
      </div>

      {/* Live telemetry */}
      <Section title="Live">
        <div className="grid grid-cols-2 gap-1">
          <StatCard label="Attack ratio" value={ratioLabel} color={isManual ? "text-hammer-muted" : "text-hammer-green"} />
          <StatCard label="Regen" value={`${regenDisp}/s`} color="text-hammer-blue" />
          <StatCard
            label="Troops"
            value={troopPct != null ? `${troopPct}% of max` : "—"}
            sub={tel ? `${short(dTroops(tel.troops))} / ${short(dTroops(tel.maxT))}` : undefined}
          />
          <StatCard
            label="Net trend"
            value={tel ? `${slopeArrow} ${short(Math.abs(slopeDisp))}/s` : "—"}
            color={slopeColor}
            sub={tel ? (toPeak > 0 ? `${short(toPeak)} to 42% peak` : `${short(peakTroops)} peak (over)`) : undefined}
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

      {/* Assist base ratio */}
      {mode === "assist" && (
        <Section title="Hold ratio at">
          <div className="flex flex-wrap gap-1">
            {BASE_PRESETS.map((p) => (
              <PresetButton key={p} label={`${p}%`} active={basePct === p} onClick={() => setBasePct(p)} />
            ))}
          </div>
          <div className="text-2xs text-hammer-dim mt-1">Every attack commits this % of your troops.</div>
        </Section>
      )}

      {/* Break-even target level */}
      {mode === "breakeven" && (
        <Section title="Hold army at">
          <div className="flex flex-wrap gap-1">
            {HOLD_PRESETS.map((p) => (
              <PresetButton key={p} label={`${p}%`} active={breakevenPct === p} onClick={() => setBreakevenPct(p)} />
            ))}
          </div>
          <div className="text-2xs text-hammer-dim mt-1">
            Keeps your army near this % of max — spends everything above it, eases off below it.
          </div>
        </Section>
      )}

      {/* Floor reserve */}
      {!isManual && (
        <Section title="Floor reserve">
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
            A hard, pre-emptive wall: as troops approach this % of max, the ratio auto-tightens
            toward 1% — so even rapid clicking can't drain you through it. Committed troops can't
            defend, so this is your defensive reserve.
          </div>
        </Section>
      )}

      {/* Send cap */}
      {!isManual && (
        <Section title="Send cap">
          <div className="flex flex-wrap gap-1">
            {CAP_PRESETS.map((p) => (
              <PresetButton key={p} label={`${p}%`} active={maxCap === p} onClick={() => setMaxCap(p)} />
            ))}
          </div>
          <div className="text-2xs text-hammer-dim mt-1">
            The most any single attack will ever commit — a hard ceiling, even in Auto. Stops over-sends.
          </div>
        </Section>
      )}
    </div>
  );
}
