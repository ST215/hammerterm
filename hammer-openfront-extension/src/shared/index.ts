// Constants
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
} from "./constants";

// Utility functions
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
} from "./utils";

// Types
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
} from "./types";

// Logic — state
export { bump, bumpPorts } from "./logic/state";

// Logic — city
export { addToOwnerSum, upsertCity, estimateMaxTroops } from "./logic/city";

// Logic — player helpers
export {
  findPlayer,
  findPlayerByName,
  readMyPlayer,
  asIsAlly,
  getTeammates,
  getAllies,
} from "./logic/player-helpers";

// Logic — CIA
export { createCIAState, trackCIAEvent } from "./logic/cia";

// Logic — logger
export { extractCategory, serializeValue, createLogBuffer } from "./logic/logger";

// Schemas
export {
  DisplayEventSchema,
  PersistedStateSchema,
} from "./schemas";
export type { PersistedState, DisplayEvent } from "./schemas";
