/**
 * palantir.ts — Smart reciprocation formula (range-based scoring).
 *
 * Scores each donor 0.0–1.0 based on sacrifice, loyalty, team, and
 * relative size, then maps that score to the user's chosen min–max
 * percentage range. Exploiters (tiny donations / trivial sacrifice)
 * get filtered out entirely.
 *
 * Pure function, no store or side-effect dependencies.
 */

import {
  PALANTIR_MIN_DONATION,
  PALANTIR_MIN_SACRIFICE,
  PALANTIR_W_SACRIFICE,
  PALANTIR_W_LOYALTY,
  PALANTIR_W_TEAMMATE,
  PALANTIR_W_SIZE,
  PALANTIR_LOYALTY_SENDS,
  PALANTIR_DEFAULT_SACRIFICE,
  PALANTIR_MIN_GOLD,
} from "../constants";

export interface PalantirInput {
  amountSent: number;
  donorTroops: number;
  sendCount: number;
  myGold: number;
  myTroops: number;
  isTeammate: boolean;
  /** User's minimum reciprocation % (default 25) */
  minPct: number;
  /** User's maximum reciprocation % (default 50) */
  maxPct: number;
}

export interface PalantirResult {
  /** Amount to send back (0 if skipped) */
  final: number;
  /** Overall donor quality score 0.0–1.0 */
  score: number;
  /** Actual percentage of your resource to send */
  percentage: number;
  /** Whether this donation was filtered out */
  skipped: boolean;
  /** Reason for filtering, if skipped */
  skipReason?: "min-donation" | "min-sacrifice";
  // Breakdown scores for UI display
  sacrificeScore: number;
  loyaltyScore: number;
  teammateScore: number;
  sizeScore: number;
  /** Raw sacrifice ratio (amountSent / donorTroops) */
  sacrificeRatio: number;
}

export function calcPalantirAmount(input: PalantirInput): PalantirResult {
  const {
    amountSent,
    donorTroops,
    sendCount,
    myGold,
    myTroops,
    isTeammate,
    minPct,
    maxPct,
  } = input;

  // Sacrifice ratio
  const sacrificeRatio =
    donorTroops > 0
      ? Math.min(amountSent / donorTroops, 1)
      : PALANTIR_DEFAULT_SACRIFICE;

  const baseResult = {
    sacrificeRatio,
    sacrificeScore: 0,
    loyaltyScore: 0,
    teammateScore: 0,
    sizeScore: 0,
  };

  // Exploit filter: minimum donation amount
  if (amountSent < PALANTIR_MIN_DONATION) {
    return {
      ...baseResult,
      final: 0,
      score: 0,
      percentage: 0,
      skipped: true,
      skipReason: "min-donation",
    };
  }

  // Exploit filter: minimum sacrifice ratio
  if (donorTroops > 0 && sacrificeRatio < PALANTIR_MIN_SACRIFICE) {
    return {
      ...baseResult,
      final: 0,
      score: 0,
      percentage: 0,
      skipped: true,
      skipReason: "min-sacrifice",
    };
  }

  // Score components (each 0.0–1.0)

  // 1. Sacrifice score — how much of their army they gave up
  //    Linear: 0% → 0.0, 100% → 1.0
  const sacrificeScore = Math.min(sacrificeRatio, 1);

  // 2. Loyalty score — repeat donors ramp up over PALANTIR_LOYALTY_SENDS
  //    1st send = 0.0, 5th send = 1.0 (capped)
  const loyaltyScore = Math.min(
    Math.max(sendCount - 1, 0) / PALANTIR_LOYALTY_SENDS,
    1,
  );

  // 3. Teammate score — binary: 1.0 if teammate, 0.0 if not
  const teammateScore = isTeammate ? 1.0 : 0.0;

  // 4. Relative size score — smaller player helping bigger player scores higher
  //    If donor has fewer troops than you, they're making a bigger relative sacrifice
  const sizeRatio =
    myTroops > 0 && donorTroops > 0
      ? Math.min(myTroops / donorTroops, 5) / 5  // cap at 5:1 ratio → score 1.0
      : 0.5; // unknown → neutral
  const sizeScore = Math.min(sizeRatio, 1);

  // Weighted score
  const score = Math.min(
    sacrificeScore * PALANTIR_W_SACRIFICE +
      loyaltyScore * PALANTIR_W_LOYALTY +
      teammateScore * PALANTIR_W_TEAMMATE +
      sizeScore * PALANTIR_W_SIZE,
    1,
  );

  // Map score to user's percentage range
  const percentage = minPct + score * (maxPct - minPct);
  const amountToSend =
    myGold < PALANTIR_MIN_GOLD ? 0 : Math.floor((myGold * percentage) / 100);

  return {
    final: amountToSend,
    score,
    percentage,
    skipped: false,
    sacrificeScore,
    loyaltyScore,
    teammateScore,
    sizeScore,
    sacrificeRatio,
  };
}
