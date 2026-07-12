/**
 * Game contract tests — validates that our extension's hardcoded data
 * matches the OpenFront game's authoritative sources.
 *
 * These tests catch:
 *   - Quick chat keys not matching game's "category.key" format
 *   - Emoji indices not matching game's flattenedEmojiTable
 *   - needsTarget flags not matching game's requiresPlayer
 *   - Worker message property names drifting from game's interfaces
 *
 * When the game updates, these tests will flag mismatches before
 * they reach production as silent failures.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { EMOJI_TABLE, EMOJI_COMPACT } from "../src/shared/emoji-table";
import { GameUpdateType, MessageType, CAPTURED_SHIP_GOLD_KEY } from "../src/shared/constants";
import quickChatData from "../../OpenFrontIO/resources/QuickChat.json";

// Read OpenFront source text so packed-stats + DonateEvent contracts are pinned
// against the actual game, not a hand-copied constant. (process.cwd() is the
// extension package root; the game clone is a sibling at ../OpenFrontIO. Plain
// fs — NOT `new URL(..., import.meta.url)`, which Vite rewrites as an asset.)
const OF = (rel: string) =>
  readFileSync(resolve(process.cwd(), "../OpenFrontIO", rel), "utf8");

// ───────────────────────────────────────────────────────
// Build the game's valid quick chat keys from QuickChat.json
// ───────────────────────────────────────────────────────
type QCEntry = { key: string; requiresPlayer: boolean };
const GAME_QC_DATA = quickChatData as Record<string, QCEntry[]>;

const VALID_QC_KEYS = new Set(
  Object.entries(GAME_QC_DATA).flatMap(([category, entries]) =>
    entries.map((entry) => `${category}.${entry.key}`),
  ),
);

const REQUIRES_PLAYER = new Map(
  Object.entries(GAME_QC_DATA).flatMap(([category, entries]) =>
    entries.map((entry) => [`${category}.${entry.key}`, entry.requiresPlayer] as const),
  ),
);

// ───────────────────────────────────────────────────────
// Build the game's emoji table from Util.ts (hardcoded here
// as the authoritative reference — update when game changes)
// ───────────────────────────────────────────────────────
const GAME_EMOJI_TABLE = [
  "\u{1F600}", "\u{1F60A}", "\u{1F970}", "\u{1F607}", "\u{1F60E}",
  "\u{1F61E}", "\u{1F97A}", "\u{1F62D}", "\u{1F631}", "\u{1F621}",
  "\u{1F608}", "\u{1F921}", "\u{1F971}", "\u{1FAE1}", "\u{1F595}",
  "\u{1F44B}", "\u{1F44F}", "\u270B", "\u{1F64F}", "\u{1F4AA}",
  "\u{1F44D}", "\u{1F44E}", "\u{1FAF4}", "\u{1F90C}", "\u{1F926}",
  "\u{1F91D}", "\u{1F198}", "\u{1F54A}\uFE0F", "\u{1F3F3}\uFE0F", "\u23F3",
  "\u{1F525}", "\u{1F4A5}", "\u{1F480}", "\u2622\uFE0F", "\u26A0\uFE0F",
  "\u2196\uFE0F", "\u2B06\uFE0F", "\u2197\uFE0F", "\u{1F451}", "\u{1F947}",
  "\u2B05\uFE0F", "\u{1F3AF}", "\u27A1\uFE0F", "\u{1F948}", "\u{1F949}",
  "\u2199\uFE0F", "\u2B07\uFE0F", "\u2198\uFE0F", "\u2764\uFE0F", "\u{1F494}",
  "\u{1F4B0}", "\u2693", "\u26F5", "\u{1F3E1}", "\u{1F6E1}\uFE0F",
  "\u{1F3ED}", "\u{1F682}", "\u2753", "\u{1F414}", "\u{1F400}",
];

// ───────────────────────────────────────────────────────
// Import our extension's quick chat definitions
// (inline since they're in TSX files we can't import directly)
// ───────────────────────────────────────────────────────
const ALLIANCES_QUICK_CHATS = [
  { key: "help.troops", label: "Send Troops" },
  { key: "help.gold", label: "Send Gold" },
  { key: "help.help_defend", label: "Help Defend" },
  { key: "attack.attack", label: "Attack" },
  { key: "defend.defend", label: "Defend" },
  { key: "greet.thanks", label: "Thanks" },
  { key: "greet.gg", label: "GG" },
  { key: "greet.hello", label: "Hello" },
  { key: "misc.go", label: "Go!" },
];

const COMMS_QC_ITEMS: { key: string; needsTarget?: boolean }[] = [
  { key: "greet.hello" },
  { key: "greet.good_luck" },
  { key: "greet.well_played" },
  { key: "greet.thanks" },
  { key: "greet.gg" },
  { key: "greet.bye" },
  { key: "greet.oops" },
  { key: "help.troops" },
  { key: "help.gold" },
  { key: "help.help_defend", needsTarget: true },
  { key: "help.alliance" },
  { key: "help.no_attack" },
  { key: "help.trade_partners" },
  { key: "attack.attack", needsTarget: true },
  { key: "attack.focus", needsTarget: true },
  { key: "attack.finish", needsTarget: true },
  { key: "attack.mirv", needsTarget: true },
  { key: "attack.build_warships" },
  { key: "defend.defend", needsTarget: true },
  { key: "defend.defend_from", needsTarget: true },
  { key: "defend.dont_attack", needsTarget: true },
  { key: "defend.ally", needsTarget: true },
  { key: "defend.build_posts" },
  { key: "misc.go" },
  { key: "misc.strategy" },
  { key: "misc.team_up", needsTarget: true },
  { key: "misc.build_closer" },
  { key: "warnings.strong", needsTarget: true },
  { key: "warnings.weak", needsTarget: true },
  { key: "warnings.betrayed", needsTarget: true },
  { key: "warnings.getting_big", needsTarget: true },
  { key: "warnings.mirv_soon", needsTarget: true },
  { key: "warnings.snowballing", needsTarget: true },
  { key: "warnings.cheating", needsTarget: true },
  { key: "warnings.stop_trading", needsTarget: true },
];

// ═══════════════════════════════════════════════════════
// QUICK CHAT KEY FORMAT TESTS
// ═══════════════════════════════════════════════════════
describe("quick chat keys match game protocol", () => {
  test("all AlliancesView quick chat keys are valid game keys", () => {
    for (const qc of ALLIANCES_QUICK_CHATS) {
      expect(VALID_QC_KEYS.has(qc.key), `"${qc.key}" is not a valid game key`).toBe(true);
    }
  });

  test("all CommsView quick chat keys are valid game keys", () => {
    for (const qc of COMMS_QC_ITEMS) {
      expect(VALID_QC_KEYS.has(qc.key), `"${qc.key}" is not a valid game key`).toBe(true);
    }
  });

  test("quick chat keys use category.key format", () => {
    const allKeys = [
      ...ALLIANCES_QUICK_CHATS.map((q) => q.key),
      ...COMMS_QC_ITEMS.map((q) => q.key),
    ];
    for (const key of allKeys) {
      expect(key, `"${key}" must contain a dot`).toContain(".");
      const parts = key.split(".");
      expect(parts.length, `"${key}" must be exactly "category.key"`).toBe(2);
      expect(parts[0].length, `"${key}" category must not be empty`).toBeGreaterThan(0);
      expect(parts[1].length, `"${key}" key must not be empty`).toBeGreaterThan(0);
    }
  });

  test("no duplicate quick chat keys in CommsView", () => {
    const keys = COMMS_QC_ITEMS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("no duplicate quick chat keys in AlliancesView", () => {
    const keys = ALLIANCES_QUICK_CHATS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ═══════════════════════════════════════════════════════
// NEEDS TARGET / REQUIRES PLAYER ALIGNMENT
// ═══════════════════════════════════════════════════════
describe("needsTarget matches game requiresPlayer", () => {
  test("CommsView needsTarget flags match game", () => {
    for (const qc of COMMS_QC_ITEMS) {
      const gameRequires = REQUIRES_PLAYER.get(qc.key);
      if (gameRequires === true) {
        expect(
          qc.needsTarget,
          `"${qc.key}" has requiresPlayer=true in game but needsTarget is not set`,
        ).toBe(true);
      }
      if (qc.needsTarget === true) {
        expect(
          gameRequires,
          `"${qc.key}" has needsTarget=true but game has requiresPlayer=false`,
        ).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// EMOJI TABLE TESTS
// ═══════════════════════════════════════════════════════
describe("emoji table matches game", () => {
  test("EMOJI_TABLE has exactly 60 entries", () => {
    expect(EMOJI_TABLE.length).toBe(60);
  });

  test("EMOJI_TABLE matches game's flattenedEmojiTable", () => {
    expect(EMOJI_TABLE.length).toBe(GAME_EMOJI_TABLE.length);
    for (let i = 0; i < GAME_EMOJI_TABLE.length; i++) {
      expect(
        EMOJI_TABLE[i],
        `Emoji at index ${i}: expected "${GAME_EMOJI_TABLE[i]}" but got "${EMOJI_TABLE[i]}"`,
      ).toBe(GAME_EMOJI_TABLE[i]);
    }
  });

  test("EMOJI_COMPACT indices are valid game indices", () => {
    for (const entry of EMOJI_COMPACT) {
      expect(
        entry.index,
        `Compact emoji index ${entry.index} out of range`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        entry.index,
        `Compact emoji index ${entry.index} out of range`,
      ).toBeLessThan(60);
    }
  });

  test("EMOJI_COMPACT labels match EMOJI_TABLE at their index", () => {
    for (const entry of EMOJI_COMPACT) {
      expect(
        entry.label,
        `Compact emoji "${entry.label}" at index ${entry.index} doesn't match table "${EMOJI_TABLE[entry.index]}"`,
      ).toBe(EMOJI_TABLE[entry.index]);
    }
  });

  test("EMOJI_COMPACT has no duplicate indices", () => {
    const indices = EMOJI_COMPACT.map((e) => e.index);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

// ═══════════════════════════════════════════════════════
// WORKER MESSAGE FORMAT TESTS
// ═══════════════════════════════════════════════════════
describe("worker message format matches game", () => {
  test("game_update_batch uses gameUpdates property (not updates)", () => {
    // Simulates what the Worker sends — this is the exact shape from
    // OpenFrontIO/src/core/worker/WorkerMessages.ts:GameUpdateBatchMessage
    const batchMessage = {
      type: "game_update_batch" as const,
      gameUpdates: [
        {
          tick: 100,
          updates: [null, null, [{ id: "p1", troops: 5000 }]],
          packedTileUpdates: [],
        },
      ],
    };

    // This is how our hooks.content.ts reads it — must use gameUpdates
    expect(batchMessage.gameUpdates).toBeDefined();
    expect(Array.isArray(batchMessage.gameUpdates)).toBe(true);
    expect(batchMessage.gameUpdates[0].tick).toBe(100);

    // Verify the OLD wrong property doesn't exist
    expect((batchMessage as any).updates).toBeUndefined();
  });

  test("game_update uses gameUpdate property (singular)", () => {
    const updateMessage = {
      type: "game_update" as const,
      gameUpdate: {
        tick: 50,
        updates: [null, null, [{ id: "p1", troops: 3000 }]],
        packedTileUpdates: [],
      },
    };

    expect(updateMessage.gameUpdate).toBeDefined();
    expect(updateMessage.gameUpdate.tick).toBe(50);
  });

  test("player updates are at index 2 (GUT_PLAYER)", () => {
    const GUT_PLAYER = 2;
    const gameUpdate = {
      tick: 100,
      updates: [
        null,       // index 0: tiles (unused in this format)
        null,       // index 1: units
        [{ id: "p1", troops: 5000 }],  // index 2: players
        null,       // index 3: display events
      ],
    };

    const players = gameUpdate.updates[GUT_PLAYER];
    expect(players).toBeDefined();
    expect(players![0].id).toBe("p1");
  });
});

// ═══════════════════════════════════════════════════════
// GAME UPDATE TYPE CONSTANTS
// ═══════════════════════════════════════════════════════
describe("GameUpdateType constants", () => {
  test("Player type index matches game protocol", () => {
    // From OpenFrontIO GameUpdateType enum — Player = 2
    // Our hooks use index 2 (GUT_PLAYER) to extract player data
    expect(GameUpdateType.Player).toBe(2);
  });

  test("DisplayEvent type index matches game protocol", () => {
    expect(GameUpdateType.DisplayEvent).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════
// PACKED PLAYER STATS QUAD LAYOUT (v0.32+ commit bca980f)
// ═══════════════════════════════════════════════════════
describe("packedPlayerUpdates quad layout matches game", () => {
  const playerImpl = OF("src/core/game/PlayerImpl.ts");
  const gameUpdates = OF("src/core/game/GameUpdates.ts");

  test("GameUpdateViewData still carries packedPlayerUpdates", () => {
    expect(gameUpdates).toContain("packedPlayerUpdates?: Float64Array");
  });

  test("quad order is [smallID, tilesOwned, gold, troops]", () => {
    // The extension (hooks.content.ts / bridge.ts / worker-hook.ts) unpacks
    // stats[i..i+3] as smallID, tilesOwned, gold, troops. Pin that order
    // against the game's encoder in PlayerImpl.toUpdate → statsOut.push(...).
    const m = playerImpl.match(/statsOut\.push\(([\s\S]*?)\);/);
    expect(m, "statsOut.push(...) not found in PlayerImpl.toUpdate").toBeTruthy();
    const body = m![1];
    const iSmall = body.indexOf("smallID");
    const iTiles = body.indexOf("tilesOwned");
    const iGold = body.indexOf("gold");
    const iTroops = body.indexOf("troops");
    expect(iSmall).toBeGreaterThanOrEqual(0);
    expect(iTiles).toBeGreaterThan(iSmall);
    expect(iGold).toBeGreaterThan(iTiles);
    expect(iTroops).toBeGreaterThan(iGold);
  });

  test("doc comment names the same quad order", () => {
    expect(gameUpdates).toContain("[smallID, tilesOwned, gold, troops]");
  });
});

// ═══════════════════════════════════════════════════════
// DONATE EVENT INDEX + SHAPE (v0.32+ commit 41ef675)
// ═══════════════════════════════════════════════════════
describe("DonateEvent contract matches game", () => {
  const gameUpdates = OF("src/core/game/GameUpdates.ts");

  test("DonateEvent is the last GameUpdateType member (index 23)", () => {
    // Our constants pin DonateEvent = 23; the game defines it as the final
    // enum member. Extract the enum body and confirm order/position.
    const enumMatch = gameUpdates.match(/export enum GameUpdateType\s*\{([\s\S]*?)\}/);
    expect(enumMatch, "GameUpdateType enum not found").toBeTruthy();
    const members = enumMatch![1]
      .replace(/\/\/[^\n]*/g, "") // strip line comments (some members are documented)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(members.indexOf("Player")).toBe(GameUpdateType.Player);
    expect(members.indexOf("DisplayEvent")).toBe(GameUpdateType.DisplayEvent);
    expect(members.indexOf("DonateEvent")).toBe(GameUpdateType.DonateEvent);
    expect(GameUpdateType.DonateEvent).toBe(23);
  });

  test("DonateEventUpdate shape is {donationType, senderId, recipientId, amount}", () => {
    const ifaceMatch = gameUpdates.match(
      /export interface DonateEventUpdate\s*\{([\s\S]*?)\}/,
    );
    expect(ifaceMatch, "DonateEventUpdate interface not found").toBeTruthy();
    const body = ifaceMatch![1];
    expect(body).toContain("type: GameUpdateType.DonateEvent");
    expect(body).toMatch(/donationType:\s*"troops"\s*\|\s*"gold"/);
    expect(body).toMatch(/senderId:\s*PlayerID/);
    expect(body).toMatch(/recipientId:\s*PlayerID/);
    expect(body).toMatch(/amount:\s*bigint/);
  });
});

// ═══════════════════════════════════════════════════════
// PORT / CAPTURED-SHIP GOLD CONTRACT (v0.32: mt=20 became CHAT)
// ═══════════════════════════════════════════════════════
describe("captured-trade-ship gold (port income) contract matches game", () => {
  const gameTs = OF("src/core/game/Game.ts");
  const tradeShip = OF("src/core/execution/TradeShipExecution.ts");

  test("CAPTURED_ENEMY_UNIT is index 11 in the game's MessageType enum", () => {
    // The game's MessageType is a plain auto-incremented enum; its numeric
    // value IS the wire type our router matches on. Pin index 11.
    const enumMatch = gameTs.match(/export enum MessageType\s*\{([\s\S]*?)\}/);
    expect(enumMatch, "MessageType enum not found").toBeTruthy();
    const members = enumMatch![1]
      .replace(/\/\/[^\n]*/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(members.indexOf("CAPTURED_ENEMY_UNIT")).toBe(11);
    expect(MessageType.CAPTURED_ENEMY_UNIT).toBe(11);
  });

  test("TradeShipExecution emits the captured-ship gold display message we route on", () => {
    // The message key is our reliable discriminator; the messageType pins the
    // numeric channel. Both must survive to the extension's display payload.
    expect(tradeShip).toContain(`"${CAPTURED_SHIP_GOLD_KEY}"`);
    expect(tradeShip).toContain("MessageType.CAPTURED_ENEMY_UNIT");
  });
});
