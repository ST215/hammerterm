import AutoSendView, { type ResourceConfig } from "./AutoSendView";
import { asTroopsStart, asTroopsStop } from "@content/automation/auto-troops";
import { dTroops } from "@shared/utils";

const TROOPS_CONFIG: ResourceConfig = {
  label: "Troops",
  unit: "t",
  accentColor: "hammer-blue",
  getMyAmount: (me) => dTroops(me?.troops),
  thresholdMode: "pct",
  thresholdPresets: [0, 25, 50, 75],
  thresholdLabel: "Threshold (min troops %)",
  fmtThresholdPreset: (val) => `${val}%`,
  selectRunning: (s) => s.asTroopsRunning,
  selectTargets: (s) => s.asTroopsTargets,
  selectRatio: (s) => s.asTroopsRatio,
  selectThreshold: (s) => s.asTroopsThreshold,
  selectCooldownSec: (s) => s.asTroopsCooldownSec,
  selectLog: (s) => s.asTroopsLog,
  selectNextSend: (s) => s.asTroopsNextSend,
  selectAllTeamMode: (s) => s.asTroopsAllTeamMode,
  selectAllAlliesMode: (s) => s.asTroopsAllAlliesMode,
  selectSetRatio: (s) => s.setAsTroopsRatio,
  selectSetThreshold: (s) => s.setAsTroopsThreshold,
  selectSetCooldown: (s) => s.setAsTroopsCooldown,
  selectToggleAllTeam: (s) => s.toggleAsTroopsAllTeamMode,
  selectToggleAllAllies: (s) => s.toggleAsTroopsAllAlliesMode,
  selectAddTarget: (s) => s.addAsTroopsTarget,
  selectRemoveTarget: (s) => s.removeAsTroopsTarget,
  start: asTroopsStart,
  stop: asTroopsStop,
};

export default function AutoTroopsView() {
  return <AutoSendView config={TROOPS_CONFIG} />;
}
