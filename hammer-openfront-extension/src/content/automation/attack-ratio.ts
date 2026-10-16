/**
 * attack-ratio.ts — ISOLATED-world side of the attack-ratio governor.
 *
 * The governor itself runs in the MAIN world (hooks.content.ts → ATTACK
 * GOVERNOR), beside the game, where it reads live troops and the exact troop
 * cap synchronously and enforces each click as it happens. This module only:
 *   - flips the store flag for Start/Stop (works from the overlay OR the
 *     external window — the flag syncs to the game tab either way), and
 *   - in the game tab, pushes the store's governor config to the MAIN world on
 *     every change plus a heartbeat (so a late-loading MAIN world catches up).
 *
 * It does NOT attack. Setting the slider is a pure client-side write — no
 * server intent — so it's unaffected by the intent rate limiter.
 */

import { useStore } from "@store/index";
import type { GovernorConfig } from "@shared/logic/attack-governor";
import { sendToMainWorld } from "../bridge";
import { registerInterval } from "../cleanup";

export function asAttackRatioStart(): void {
  useStore.getState().setAttackRatioRunning(true);
}

export function asAttackRatioStop(): void {
  useStore.getState().setAttackRatioRunning(false);
}

export function asAttackRatioToggle(): void {
  const s = useStore.getState();
  s.setAttackRatioRunning(!s.attackRatioRunning);
}

type GovernorState = ReturnType<typeof useStore.getState>;

export function governorConfigFrom(s: GovernorState): GovernorConfig {
  return {
    running: s.attackRatioRunning && !s.isReplay,
    mode: s.attackRatioMode,
    fixedPct: s.attackRatioBasePct,
    holdPct: s.attackRatioBreakevenPct,
    floorPct: s.attackRatioFloorPct,
    capPct: s.attackRatioMaxCap,
  };
}

const HEARTBEAT_MS = 2000;
let syncInstalled = false;

/** Game tab only: keep the MAIN-world governor's config in step with the store. */
export function installGovernorSync(): void {
  if (syncInstalled) return;
  syncInstalled = true;

  let lastJson = "";
  const push = (force: boolean) => {
    const cfg = governorConfigFrom(useStore.getState());
    const json = JSON.stringify(cfg);
    if (!force && json === lastJson) return;
    lastJson = json;
    sendToMainWorld({ action: "governor-config", config: cfg });
  };

  push(true);
  useStore.subscribe(() => push(false));
  registerInterval(setInterval(() => push(true), HEARTBEAT_MS));
}
