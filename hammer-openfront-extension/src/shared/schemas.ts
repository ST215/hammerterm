import { z } from "zod";

export const PersistedStateSchema = z.object({
  reciprocateEnabled: z.boolean().default(false),
  reciprocateOnTroops: z.boolean().default(true),
  reciprocateOnGold: z.boolean().default(true),
  reciprocateMode: z.enum(["manual", "auto"]).default("manual"),
  reciprocatePercent: z.number().min(1).max(100).default(50),
  reciprocateNotifyDuration: z.number().default(10),
  asTroopsEnabled: z.boolean().default(false),
  asTroopsRatio: z.number().min(1).max(100).default(20),
  asTroopsThreshold: z.number().default(50),
  asTroopsCooldown: z.number().default(10),
  asGoldEnabled: z.boolean().default(false),
  asGoldRatio: z.number().min(1).max(100).default(25),
  asGoldCooldown: z.number().default(10),
  ciaEnabled: z.boolean().default(true),
  logLevel: z.number().default(0),
  panelSize: z.number().default(1),
  panelVisible: z.boolean().default(true),
});

export type PersistedState = z.infer<typeof PersistedStateSchema>;

export const DisplayEventSchema = z.object({
  messageType: z.number(),
  playerID: z.number().optional(),
  params: z.record(z.unknown()).optional(),
  goldAmount: z.number().optional(),
});

export type DisplayEvent = z.infer<typeof DisplayEventSchema>;
