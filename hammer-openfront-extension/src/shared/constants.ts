export const TROOP_DISPLAY_DIV = 10;

/**
 * Internal transfer-direction discriminators for CIA / donation tracking.
 *
 * These are NOT the game's wire MessageType enum. As of OpenFront v0.32+ the
 * game consolidated its display messages (donations became DONATION_SENT/
 * DONATION_RECEIVED, built client-side) and moved the actual donation payload
 * onto the GameUpdateType.DonateEvent channel — so player-to-player donations
 * no longer arrive as display messages at all (see processDonateEvent, which
 * feeds trackCIAEvent synthetic SENT_* values). The 18–22 numeric values here
 * are only used as stable internal keys — they are NOT the game's wire enum
 * (in v0.32+ index 20 is CHAT, not trade gold).
 *
 * CAPTURED_ENEMY_UNIT (11) is the exception: it IS the game's real wire
 * MessageType, and it's the channel port/captured-trade-ship gold now arrives
 * on — a DisplayEvent with messageType 11 and message key
 * "events_display.received_gold_from_captured_ship" (see TradeShipExecution.ts
 * and the game-contract test). That message key is the reliable discriminator
 * the port-income routing gates on (message-processor.handleReceivedGoldTrade).
 */
export const MessageType = {
  SENT_GOLD_TO_PLAYER: 18,
  RECEIVED_GOLD_FROM_PLAYER: 19,
  RECEIVED_GOLD_FROM_TRADE: 20,
  SENT_TROOPS_TO_PLAYER: 21,
  RECEIVED_TROOPS_FROM_PLAYER: 22,
  CAPTURED_ENEMY_UNIT: 11,
} as const;

/**
 * Game message key carried by the captured-trade-ship gold DisplayEvent. Used
 * as the reliable discriminator for routing port income (the numeric
 * messageType 11 alone is broad; the key pins it to trade/port gold).
 */
export const CAPTURED_SHIP_GOLD_KEY =
  "events_display.received_gold_from_captured_ship";

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
  RailroadDestructionEvent: 16,
  RailroadConstructionEvent: 17,
  RailroadSnapEvent: 18,
  ConquestEvent: 19,
  EmbargoEvent: 20,
  SpawnPhaseEnd: 21,
  GamePaused: 22,
  DonateEvent: 23,
} as const;

export const CITY_TROOP_INCREASE = 250_000;

export const CIA_BIG_GOLD_THRESHOLD = 500_000;
export const CIA_BIG_TROOPS_THRESHOLD = 500_000;
export const CIA_MAX_TRANSFERS = 2000;
export const CIA_MAX_ALERTS = 200;

export const SIZES = [
  { w: 600, h: 500, bodyH: 446, label: "S" },
  { w: 850, h: 660, bodyH: 606, label: "M" },
  { w: 1120, h: 820, bodyH: 766, label: "L" },
];

export const RECIPROCATE_COOLDOWN_MS = 10_000;

// Palantir smart reciprocation constants — range-based scoring system
// Exploit filters
export const PALANTIR_MIN_DONATION = 5_000;
export const PALANTIR_MIN_SACRIFICE = 0.02;
// Scoring weights (must sum to 1.0)
export const PALANTIR_W_SACRIFICE = 0.4;
export const PALANTIR_W_LOYALTY = 0.3;
export const PALANTIR_W_TEAMMATE = 0.2;
export const PALANTIR_W_SIZE = 0.1;
// Loyalty normalizes over this many sends (score 1.0 at this count)
export const PALANTIR_LOYALTY_SENDS = 5;
// Default sacrifice when donor troop count is unknown
export const PALANTIR_DEFAULT_SACRIFICE = 0.1;
// Minimum gold to bother sending
export const PALANTIR_MIN_GOLD = 1_000;

export const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
export const LEVEL_NAMES = ["debug", "info", "warn", "error"] as const;
export const CONSOLE_LEVEL_MAP: Record<string, number> = { debug: 0, log: 1, info: 1, warn: 2, error: 3 };
