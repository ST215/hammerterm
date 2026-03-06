/**
 * Thin re-export file that imports from the shared modules and
 * re-exports everything under a single namespace for test imports.
 */

// ===== CONSTANTS =====
export {
  TROOP_DISPLAY_DIV,
  MessageType,
  GameUpdateType,
  CITY_TROOP_INCREASE,
  CIA_BIG_GOLD_THRESHOLD,
  CIA_BIG_TROOPS_THRESHOLD,
  CIA_MAX_TRANSFERS,
  CIA_MAX_ALERTS,
  SIZES,
  RECIPROCATE_COOLDOWN_MS,
  LOG_LEVELS,
  LEVEL_NAMES,
  CONSOLE_LEVEL_MAP,
} from "../../src/shared/constants";

// ===== UTILS =====
export {
  dTroops,
  num,
  esc,
  short,
  comma,
  fullNum,
  fmtSec,
  fmtDuration,
  parseAmt,
} from "../../src/shared/utils";

// ===== TYPES =====
export type {
  PlayerData,
  DonationRecord,
  PortRecord,
  CityRecord,
  LogEntry,
  CIATransfer,
  CIAFlowEntry,
  CIAPlayerTotal,
  CIAAlert,
  CIAState,
} from "../../src/shared/types";

// ===== LOGIC: STATE =====
export { bump, bumpPorts } from "../../src/shared/logic/state";

// ===== LOGIC: CITY =====
export {
  addToOwnerSum,
  upsertCity,
  estimateMaxTroops,
} from "../../src/shared/logic/city";

// ===== LOGIC: PLAYER HELPERS =====
export {
  findPlayer,
  findPlayerByName,
  readMyPlayer,
  asIsAlly,
  getTeammates,
  getAllies,
} from "../../src/shared/logic/player-helpers";

// ===== LOGIC: CIA =====
export { createCIAState, trackCIAEvent } from "../../src/shared/logic/cia";

// ===== LOGIC: LOGGER =====
export {
  extractCategory,
  serializeValue,
  createLogBuffer,
} from "../../src/shared/logic/logger";
