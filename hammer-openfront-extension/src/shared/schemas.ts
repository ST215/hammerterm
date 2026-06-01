import { z } from "zod";

/**
 * Persisted user settings — survives game-tab refresh and tool close/reopen.
 *
 * Deliberately CONFIG ONLY: ratios, thresholds, targets, modes, positions,
 * sizes. We do NOT persist live "running/enabled" automation toggles
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
  // Reciprocate config
  reciprocateMode: z.enum(["manual", "auto", "palantir"]).default("manual"),
  reciprocateAutoPct: z.number().default(50),
  reciprocateOnTroops: z.boolean().default(true),
  reciprocateOnGold: z.boolean().default(true),
  reciprocatePopupsEnabled: z.boolean().default(true),
  reciprocateNotifyDuration: z.number().default(10),
  palantirMinPct: z.number().default(25),
  palantirMaxPct: z.number().default(75),
  popupScale: z.number().default(1),
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
  popupsEnabled: z.boolean().default(true),
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
