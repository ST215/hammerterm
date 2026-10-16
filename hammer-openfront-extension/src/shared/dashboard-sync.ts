/**
 * dashboard-sync.ts — which store keys flow between the external window and
 * the game tab, and how a game-tab snapshot is applied in the window.
 * (Shared so tests exercise the real rules, not a hand copy.)
 */

// Keys the user edits in this window. Edits push to the game tab immediately
// (sync-local); see WINDOW_ONLY_KEYS below for which of them also flow back.
export const LOCAL_KEYS = new Set([
  // UI navigation / presentation
  "view", "paused", "sizeIdx", "inGameView", "externalOpen",
  // Comms selections (user picks targets in dashboard)
  "commsTargets", "commsGroupMode", "commsOthersExpanded",
  "commsPendingQC", "commsRecentSent", "allianceCommsExpanded",
  "commsPaceMs", "commsPaceHuman", "commsActiveBatch",
  // Reciprocate config
  "reciprocateMode", "reciprocateAutoPct", "reciprocateNotifyDuration",
  "reciprocateEnabled", "reciprocateOnGold", "reciprocateOnTroops",
  "reciprocatePopupsEnabled", "palantirMinPct", "palantirMaxPct", "popupScale",
  "thankEnabled", "thankMode",
  // Auto-troops config
  "asTroopsRunning", "asTroopsTargets", "asTroopsRatio",
  "asTroopsThreshold", "asTroopsCooldownSec",
  "asTroopsAllTeamMode", "asTroopsAllAlliesMode",
  // Auto-gold config
  "asGoldRunning", "asGoldTargets", "asGoldRatio",
  "asGoldThreshold", "asGoldCooldownSec",
  "asGoldAllTeamMode", "asGoldAllAlliesMode",
  // Attack-ratio governor config (telemetry stays out — it flows content→dashboard)
  "attackRatioRunning", "attackRatioMode", "attackRatioBasePct",
  "attackRatioBreakevenPct", "attackRatioFloorPct", "attackRatioMaxCap",
  // Activity feed toggles
  "screenPopupsEnabled", "donationAlertsEnabled", "growthHudEnabled",
  "toastInboundTroops", "toastInboundGold", "toastOutboundTroops", "toastOutboundGold",
  "toastScale", "statusToastScale",
  // Notification positions
  "reciprocatePosition", "donationPosition", "statusPosition", "growthPosition",
  // CIA user preferences
  "ciaWindowMs", "ciaFeedFilter",
  // Broadcast config
  "broadcastEnabled", "broadcastEmojiIndex", "broadcastSequence",
  "broadcastUseSequence",
  // Recorder (only the toggle — count & events come from content script snapshots)
  "recorderOn",
]);

// Window-local presentation & in-progress selections: never adopted from the
// game tab. Every OTHER LOCAL_KEY is a setting/toggle the GAME TAB owns: it's
// adopted from snapshots (so this window opens showing your real settings and
// reflects changes made in the overlay or by hotkey) unless you edited it here
// within TOUCH_GUARD_MS — so an in-flight snapshot can't revert your click.
export const WINDOW_ONLY_KEYS = new Set([
  "view", "paused", "sizeIdx", "inGameView", "externalOpen",
  "commsTargets", "commsGroupMode", "commsOthersExpanded",
  "commsPendingQC", "commsRecentSent", "allianceCommsExpanded", "commsActiveBatch",
]);
export const TOUCH_GUARD_MS = 2000;

// Sending toggles and their per-match targets reset with every match (the game
// page reloads). An edit to one of these that was in flight across the
// match-end reload belongs to the OLD match — never replay it into the next.
export const MATCH_SCOPED_KEYS = new Set([
  "asTroopsRunning", "asTroopsTargets", "asGoldRunning", "asGoldTargets",
  "broadcastEnabled", "reciprocateMode", "recorderOn",
]);

/**
 * The part of a game-tab snapshot the external window should adopt: drop
 * functions and WINDOW_ONLY_KEYS, and skip settings the user edited here
 * within TOUCH_GUARD_MS (a snapshot built before that edit landed would
 * otherwise revert it).
 */
export function filterSnapshotPatch(
  data: Record<string, any>,
  touchedAt: Map<string, number>,
  now: number,
): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === "function" || WINDOW_ONLY_KEYS.has(key)) continue;
    if (LOCAL_KEYS.has(key) && now - (touchedAt.get(key) ?? 0) < TOUCH_GUARD_MS) continue;
    patch[key] = val;
  }
  return patch;
}
