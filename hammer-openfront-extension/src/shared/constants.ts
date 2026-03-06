export const TROOP_DISPLAY_DIV = 10;

export const MessageType = {
  SENT_GOLD_TO_PLAYER: 18,
  RECEIVED_GOLD_FROM_PLAYER: 19,
  RECEIVED_GOLD_FROM_TRADE: 20,
  SENT_TROOPS_TO_PLAYER: 21,
  RECEIVED_TROOPS_FROM_PLAYER: 22,
} as const;

export const GameUpdateType = {
  Tile: 0,
  Unit: 1,
  Player: 2,
  DisplayEvent: 3,
  DisplayChatEvent: 4,
  AllianceRequest: 5,
  AllianceRequestReply: 6,
  BrokeAlliance: 7,
  AllianceExpired: 8,
  AllianceExtension: 9,
  TargetPlayer: 10,
  Emoji: 11,
  Win: 12,
  Hash: 13,
  UnitIncoming: 14,
  BonusEvent: 15,
  RailroadEvent: 16,
  ConquestEvent: 17,
  EmbargoEvent: 18,
} as const;

export const CITY_TROOP_INCREASE = 250_000;

export const CIA_BIG_GOLD_THRESHOLD = 500_000;
export const CIA_BIG_TROOPS_THRESHOLD = 500_000;
export const CIA_MAX_TRANSFERS = 2000;
export const CIA_MAX_ALERTS = 200;

export const SIZES = [
  { w: 520, h: 420, bodyH: 372, label: "S" },
  { w: 750, h: 580, bodyH: 532, label: "M" },
  { w: 1000, h: 720, bodyH: 672, label: "L" },
];

export const RECIPROCATE_COOLDOWN_MS = 10_000;

export const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
export const LEVEL_NAMES = ["debug", "info", "warn", "error"] as const;
export const CONSOLE_LEVEL_MAP: Record<string, number> = { debug: 0, log: 1, info: 1, warn: 2, error: 3 };
