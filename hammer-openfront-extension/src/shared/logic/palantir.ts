/**
 * palantir.ts — Smart reciprocation formula.
 *
 * Calculates optimal send-back amount based on:
 * 1. Sacrifice ratio (what % of their troops did they send?)
 * 2. Loyalty multiplier (repeat donors get a bonus)
 * 3. Teammate multiplier (same-team players get 1.25x)
 * 4. Self-preservation (your generosity scales with your power level)
 *
 * Pure function, no store or side-effect dependencies.
 */

import {
  PALANTIR_FLOOR,
  PALANTIR_CAP_PCT,
  PALANTIR_TEAM_BONUS,
  PALANTIR_LOYALTY_STEP,
  PALANTIR_LOYALTY_MAX,
  PALANTIR_DEFAULT_SACRIFICE,
  PALANTIR_SMALL_THRESHOLD,
  PALANTIR_MID_THRESHOLD,
  PALANTIR_SELF_SMALL,
  PALANTIR_SELF_MID,
  PALANTIR_SELF_DOMINANT,
  PALANTIR_MIN_GOLD,
} from "../constants";

export type PalantirPhase = "conserving" | "growing" | "dominant";

export interface PalantirInput {
  amountSent: number;
  donorTroops: number;
  sendCount: number;
  myGold: number;
  myTroops: number;
  isTeammate: boolean;
}

export interface PalantirResult {
  final: number;
  sacrificeRatio: number;
  loyaltyMultiplier: number;
  teammateMultiplier: number;
  selfMod: number;
  phase: PalantirPhase;
  rawAmount: number;
  flooredAmount: number;
  cappedAmount: number;
}

export function getPhase(myTroops: number): PalantirPhase {
  if (myTroops < PALANTIR_SMALL_THRESHOLD) return "conserving";
  if (myTroops < PALANTIR_MID_THRESHOLD) return "growing";
  return "dominant";
}

export function getSelfMod(phase: PalantirPhase): number {
  switch (phase) {
    case "conserving":
      return PALANTIR_SELF_SMALL;
    case "growing":
      return PALANTIR_SELF_MID;
    case "dominant":
      return PALANTIR_SELF_DOMINANT;
  }
}

export function calcPalantirAmount(input: PalantirInput): PalantirResult {
  const { amountSent, donorTroops, sendCount, myGold, myTroops, isTeammate } =
    input;

  // 1. Sacrifice ratio
  const sacrificeRatio =
    donorTroops > 0
      ? Math.min(amountSent / donorTroops, 1)
      : PALANTIR_DEFAULT_SACRIFICE;

  // 2. Loyalty multiplier
  const loyaltyBonus = Math.min(
    Math.max(sendCount - 1, 0) * PALANTIR_LOYALTY_STEP,
    PALANTIR_LOYALTY_MAX,
  );
  const loyaltyMultiplier = 1.0 + loyaltyBonus;

  // 3. Teammate multiplier
  const teammateMultiplier = isTeammate ? PALANTIR_TEAM_BONUS : 1.0;

  // 4. Self-preservation
  const phase = getPhase(myTroops);
  const selfMod = getSelfMod(phase);

  // 5. Assembly
  const rawAmount =
    myGold * sacrificeRatio * loyaltyMultiplier * teammateMultiplier * selfMod;
  const flooredAmount = Math.max(rawAmount, PALANTIR_FLOOR);
  const cap = myGold * PALANTIR_CAP_PCT;
  const cappedAmount = Math.min(flooredAmount, cap);

  // If we have less than minimum gold, send 0 (will be re-queued)
  const final =
    myGold < PALANTIR_MIN_GOLD ? 0 : Math.floor(Math.max(cappedAmount, 0));

  return {
    final,
    sacrificeRatio,
    loyaltyMultiplier,
    teammateMultiplier,
    selfMod,
    phase,
    rawAmount,
    flooredAmount,
    cappedAmount,
  };
}
