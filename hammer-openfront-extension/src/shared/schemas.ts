import { z } from "zod";

/**
 * Persisted user settings — survives game-tab refresh and tool close/reopen.
 *
 * Deliberately CONFIG ONLY: ratios, thresholds, targets, modes, positions,
 * sizes. We do NOT persist live "running/enabled" automation toggles that SEND
 * (asTroopsRunning, asGoldRunning, reciprocateEnabled, broadcastEnabled,
 * recorderOn) or presentation state (inGameView, externalOpen) — those reset
 * to safe defaults on every fresh load so automation never silently resumes
 * and the overlay always reopens as the disguised analytics card.
 *
 * PERSIST_KEYS is derived from this schema's shape, so the schema is the single
 * source of truth for what gets saved/hydrated. All keys are optional/defaulted
 * so partial or legacy stored blobs still parse.
 */
export const PersistedStateSchema = z.object({
  // Reciprocate config — VALUES only. reciprocateMode is deliberately NOT
  // persisted: it's a live automation toggle (auto/palantir = sending), and
  // persisting it would auto-resume sending on a refresh/new match. It resets
  // to "manual" every match (see resetReciprocate). The pct/range values below
  // are remembered so re-enabling auto is one click.
  reciprocateAutoPct: z.number().default(50),
  reciprocateOnTroops: z.boolean().default(true),
  reciprocateOnGold: z.boolean().default(true),
  reciprocatePopupsEnabled: z.boolean().default(true),
  reciprocateNotifyDuration: z.number().default(10),
  palantirMinPct: z.number().default(25),
  palantirMaxPct: z.number().default(75),
  popupScale: z.number().default(1),
  // Thank-you sends (config) — independent of send-back, works in all modes.
  thankEnabled: z.boolean().default(false),
  thankMode: z.enum(["emoji", "quickchat"]).default("emoji"),
  // Auto-troops config
  asTroopsTargets: z.array(z.any()).default([]),
  asTroopsRatio: z.number().default(20),
  asTroopsThreshold: z.number().default(50),
  asTroopsCooldownSec: z.number().default(10),
  asTroopsAllTeamMode: z.boolean().default(false),
  asTroopsAllAlliesMode: z.boolean().default(false),
  // Auto-gold config
  asGoldTargets: z.array(z.any()).default([]),
  asGoldRatio: z.number().default(25),
  asGoldThreshold: z.number().default(50),
  asGoldCooldownSec: z.number().default(10),
  asGoldAllTeamMode: z.boolean().default(false),
  asGoldAllAlliesMode: z.boolean().default(false),
  // Broadcast config
  broadcastEmojiIndex: z.number().default(0),
  broadcastSequence: z.array(z.number()).default([]),
  broadcastUseSequence: z.boolean().default(false),
  // Activity feed / notification preferences
  screenPopupsEnabled: z.boolean().default(false),
  donationAlertsEnabled: z.boolean().default(true),
  // Comms pacing: average gap between multi-target sends + humanize toggle.
  commsPaceMs: z.number().min(100).max(60000).default(5000).catch(5000),
  commsPaceHuman: z.boolean().default(true),
  // Attack governor — persisted INCLUDING its on/off flag: it sends nothing to
  // the server (it only shapes the player's own attacks), re-arms in standby
  // each match, and the game page reloads at the end of every match, so a
  // session-only flag silently switched it off between matches.
  attackRatioRunning: z.boolean().default(false),
  attackRatioMode: z.enum(["manual", "assist", "breakeven", "peak"]).default("peak").catch("peak"),
  attackRatioBasePct: z.number().default(5),
  attackRatioBreakevenPct: z.number().default(50),
  attackRatioFloorPct: z.number().default(42),
  attackRatioMaxCap: z.number().default(75),
  toastInboundTroops: z.boolean().default(true),
  toastInboundGold: z.boolean().default(true),
  toastOutboundTroops: z.boolean().default(true),
  toastOutboundGold: z.boolean().default(true),
  toastScale: z.number().default(1),
  statusToastScale: z.number().default(1),
  reciprocatePosition: z.string().default("center-right"),
  donationPosition: z.string().default("center-right"),
  statusPosition: z.string().default("center"),
  growthPosition: z.string().default("bottom-left"),
  growthHudEnabled: z.boolean().default(true),
  // CIA preferences
  ciaWindowMs: z.number().default(60000),
  ciaFeedFilter: z.enum(["all", "gold", "troops", "large"]).default("all"),
  // Panel
  sizeIdx: z.number().default(1),
});

export type PersistedState = z.infer<typeof PersistedStateSchema>;

/** The exact store keys that are saved/hydrated. Derived from the schema. */
export const PERSIST_KEYS = Object.keys(PersistedStateSchema.shape) as Array<
  keyof PersistedState
>;

export const DisplayEventSchema = z.object({
  messageType: z.number(),
  playerID: z.number().optional(),
  params: z.record(z.unknown()).optional(),
  goldAmount: z.number().optional(),
});

export type DisplayEvent = z.infer<typeof DisplayEventSchema>;
