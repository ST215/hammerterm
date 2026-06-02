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
  { id: "fixed", label: "Fixed %", blurb: "Hold a constant ratio — locked, never drifts." },
  { id: "breakeven", label: "Break-even", blurb: "Spend exactly your regen income — stockpile stays flat." },
  { id: "peak", label: "Peak 42%", blurb: "Park at the 42% regen power-band for max troop throughput." },
];

const FIXED_PRESETS = [2, 3, 5, 10, 15, 20, 25];
const FLOOR_PRESETS = [0, 25, 42, 50, 60];
const CAP_PRESETS = [25, 50, 75, 100];

export default function AttackRatioView() {
  const running = useStore((s) => s.attackRatioRunning);
  const mode = useStore((s) => s.attackRatioMode);
  const fixedPct = useStore((s) => s.attackRatioFixedPct);
  const floorPct = useStore((s) => s.attackRatioFloorPct);
  const maxCap = useStore((s) => s.attackRatioMaxCap);
  const tel = useStore((s) => s.attackRatioTelemetry);

  const setMode = useStore((s) => s.setAttackRatioMode);
  const setFixedPct = useStore((s) => s.setAttackRatioFixedPct);
  const setFloorPct = useStore((s) => s.setAttackRatioFloorPct);
  const setMaxCap = useStore((s) => s.setAttackRatioMaxCap);

  const handleToggle = useCallback(() => {
    if (running) asAttackRatioStop();
    else asAttackRatioStart();
  }, [running]);

  const activeBlurb = MODES.find((m) => m.id === mode)?.blurb ?? "";

  // Telemetry (internal units → display units for the readout).
  const ratioPct = tel ? Math.round(tel.ratio * 100) : null;
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
              ? <>Governing ratio{ratioPct != null ? <> — <span className="text-hammer-green">{ratioPct}%</span></> : null}</>
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
        You still pick where & when to attack — this only tunes the slider so each
        attack commits the right amount. No data is sent to the server.
      </div>

      {/* Live telemetry */}
      <Section title="Live">
        <div className="grid grid-cols-2 gap-1">
          <StatCard label="Attack ratio" value={ratioPct != null ? `${ratioPct}%` : "—"} color="text-hammer-green" />
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

      {/* Fixed % (only relevant in fixed mode) */}
      {mode === "fixed" && (
        <Section title="Fixed ratio">
          <div className="flex flex-wrap gap-1">
            {FIXED_PRESETS.map((p) => (
              <PresetButton key={p} label={`${p}%`} active={fixedPct === p} onClick={() => setFixedPct(p)} />
            ))}
          </div>
        </Section>
      )}

      {/* Floor reserve */}
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
          Below this % of max troops, the ratio is pinned low so a counter can't catch you empty.
        </div>
      </Section>

      {/* Max cap */}
      <Section title="Max ratio cap">
        <div className="flex flex-wrap gap-1">
          {CAP_PRESETS.map((p) => (
            <PresetButton key={p} label={`${p}%`} active={maxCap === p} onClick={() => setMaxCap(p)} />
          ))}
        </div>
      </Section>
    </div>
  );
}
