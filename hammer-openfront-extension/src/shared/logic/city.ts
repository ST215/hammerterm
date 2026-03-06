import type { CityRecord } from "../types";
import { num } from "../utils";
import { CITY_TROOP_INCREASE } from "../constants";

export function addToOwnerSum(
  cityLevelSumByOwner: Map<number, number>,
  ownerID: number,
  deltaLevel: number,
): void {
  if (typeof ownerID !== "number") return;
  const prev = cityLevelSumByOwner.get(ownerID) || 0;
  cityLevelSumByOwner.set(ownerID, prev + deltaLevel);
}

export function upsertCity(
  cityById: Map<string, CityRecord>,
  cityLevelSumByOwner: Map<number, number>,
  u: { id: unknown; level?: unknown; ownerID?: unknown; isActive?: boolean },
): void {
  const idKey = String(u.id);
  const newLevel = num(u.level);
  const newOwner = num(u.ownerID);
  const prev = cityById.get(idKey);
  if (u.isActive === false) {
    if (prev) {
      addToOwnerSum(cityLevelSumByOwner, prev.ownerID, -prev.level);
      cityById.delete(idKey);
    }
    return;
  }
  if (prev) {
    if (prev.ownerID !== newOwner) {
      addToOwnerSum(cityLevelSumByOwner, prev.ownerID, -prev.level);
      addToOwnerSum(cityLevelSumByOwner, newOwner, newLevel);
    } else if (prev.level !== newLevel) {
      addToOwnerSum(cityLevelSumByOwner, newOwner, newLevel - prev.level);
    }
  } else {
    addToOwnerSum(cityLevelSumByOwner, newOwner, newLevel);
  }
  cityById.set(idKey, { ownerID: newOwner, level: newLevel });
}

export function estimateMaxTroops(
  tilesOwned: number,
  smallID: number,
  cityLevelSumByOwner: Map<number, number>,
): number {
  const tiles = Math.max(0, num(tilesOwned));
  const base = 2 * (Math.pow(tiles, 0.6) * 1000 + 50000);
  const cityLevels = cityLevelSumByOwner.get(num(smallID)) || 0;
  return Math.max(0, Math.floor(base + cityLevels * CITY_TROOP_INCREASE));
}
