import AutoSendView, { type ResourceConfig } from "./AutoSendView";
import { asGoldStart, asGoldStop } from "@content/automation/auto-gold";
import { short } from "@shared/utils";

const GOLD_CONFIG: ResourceConfig = {
  label: "Gold",
  unit: "g",
  accentColor: "hammer-gold",
  getMyAmount: (me) => Number(me?.gold ?? 0),
  thresholdMode: "abs",
  thresholdPresets: [0, 1000, 5000, 10000, 50000],
  thresholdLabel: "Threshold (min gold to keep)",
  fmtThresholdPreset: (val) => (val === 0 ? "0" : short(val)),
  selectRunning: (s) => s.asGoldRunning,
  selectTargets: (s) => s.asGoldTargets,
  selectRatio: (s) => s.asGoldRatio,
  selectThreshold: (s) => s.asGoldThreshold,
  selectCooldownSec: (s) => s.asGoldCooldownSec,
  selectLog: (s) => s.asGoldLog,
  selectNextSend: (s) => s.asGoldNextSend,
  selectAllTeamMode: (s) => s.asGoldAllTeamMode,
  selectAllAlliesMode: (s) => s.asGoldAllAlliesMode,
  selectSetRatio: (s) => s.setAsGoldRatio,
  selectSetThreshold: (s) => s.setAsGoldThreshold,
  selectSetCooldown: (s) => s.setAsGoldCooldown,
  selectToggleAllTeam: (s) => s.toggleAsGoldAllTeamMode,
  selectToggleAllAllies: (s) => s.toggleAsGoldAllAlliesMode,
  selectAddTarget: (s) => s.addAsGoldTarget,
  selectRemoveTarget: (s) => s.removeAsGoldTarget,
  start: asGoldStart,
  stop: asGoldStop,
};

export default function AutoGoldView() {
  return <AutoSendView config={GOLD_CONFIG} />;
}
